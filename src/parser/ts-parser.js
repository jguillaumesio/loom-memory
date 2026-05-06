import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const TS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export function isTsFile(filePath) {
  return TS_EXTS.has(path.extname(filePath).toLowerCase());
}

/**
 * Parse a source file and return { symbols, imports, calls }.
 *
 * symbols: string[] — top-level exported names
 * imports: string[] — module specifiers (raw, unresolved)
 * calls: { caller: string, callee: string, line: number }[] — detected call sites
 */
export function parseFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  const scriptKind =
    ext === '.tsx' ? ts.ScriptKind.TSX :
    ext === '.jsx' ? ts.ScriptKind.JSX :
    ext === '.ts'  ? ts.ScriptKind.TS  :
    ts.ScriptKind.JS;

  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);

  const symbols = new Set();
  const imports = new Set();
  const calls = [];
  const functionStack = [];

  function visit(node) {
    // ── IMPORTS ──────────────────────────────────────────
    // import x from 'm'; import { a } from 'm'; import * as ns from 'm';
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    }
    // export { a } from 'm';  export * from 'm';
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    }
    // import x = require('m')
    if (ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression)) {
      imports.add(node.moduleReference.expression.text);
    }
    // dynamic import('m') and require('m')
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      const isDynamicImport = expr.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(expr) && expr.text === 'require';
      if ((isDynamicImport || isRequire) &&
          node.arguments.length > 0 &&
          ts.isStringLiteral(node.arguments[0])) {
        imports.add(node.arguments[0].text);
      }

      const current = functionStack[functionStack.length - 1];
      if (current) {
        const callee = callName(expr);
        if (callee && !isNoiseCall(callee)) {
          const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          calls.push({ caller: current, callee, line: pos.line + 1 });
        }
      }
    }

    // ── EXPORTED SYMBOLS ─────────────────────────────────
    // export function foo() {} / export class Foo {} / export const x = ...
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ||
       ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node))
      && hasExportModifier(node)
      && node.name
    ) {
      symbols.add(node.name.text);
    }
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) symbols.add(decl.name.text);
      }
    }
    // export default function foo() {} / export default class Bar {}
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && hasDefaultModifier(node)) {
      symbols.add(node.name ? node.name.text : 'default');
    }
    // export { a, b as c }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) {
        symbols.add((el.name).text);
      }
    }
    // export = something  (CJS-style)
    if (ts.isExportAssignment(node)) {
      symbols.add(node.isExportEquals ? 'export=' : 'default');
    }

    const fnName = functionName(node);
    if (fnName) {
      functionStack.push(fnName);
      ts.forEachChild(node, visit);
      functionStack.pop();
      return;
    }

    ts.forEachChild(node, visit);
  }

  function hasExportModifier(node) {
    return !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  }
  function hasDefaultModifier(node) {
    return !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
  }

  function functionName(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && node.name) return node.name.getText(sf);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
        return node.parent.name.text;
      }
      if (ts.isPropertyAssignment(node.parent)) return node.parent.name.getText(sf);
    }
    return null;
  }

  function callName(expr) {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
    if (ts.isElementAccessExpression(expr) && ts.isStringLiteral(expr.argumentExpression)) {
      return expr.argumentExpression.text;
    }
    return null;
  }

  function isNoiseCall(name) {
    return new Set([
      'log', 'error', 'warn', 'info', 'debug',
      'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
      'push', 'pop', 'slice', 'split', 'join', 'trim', 'includes',
      'setTimeout', 'setInterval', 'JSON', 'parse', 'stringify',
    ]).has(name);
  }

  visit(sf);
  return {
    symbols: [...symbols],
    imports: [...imports],
    calls,
  };
}

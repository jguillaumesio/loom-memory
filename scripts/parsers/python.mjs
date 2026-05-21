import { BaseParser } from './base.mjs';
import { childText, loadTreeSitter, walk } from './tree-sitter-utils.mjs';

const parser = loadTreeSitter('tree-sitter-python');

export class PythonParser extends BaseParser {
    get extensions() { return ['.py']; }

    extractImports(content) {
        try {
            return extractImportsAst(content);
        } catch {
            return extractImportsRegex(content);
        }
    }

    extractSymbols(content) {
        try {
            return extractSymbolsAst(content);
        } catch {
            return extractSymbolsRegex(content);
        }
    }

    resolveExtensions(base) {
        return [base, `${base}.py`, `${base}/__init__.py`];
    }
}

function extractImportsAst(content) {
    if (!parser) throw new Error('tree-sitter-python unavailable');
    const imports = [];
    const tree = parser.parse(content);
    walk(tree.rootNode, (node) => {
        if (node.type === 'import_from_statement') {
            const module = node.namedChildren.find((child) => child.type === 'relative_import')?.text ??
                node.namedChildren.find((child) => child.type === 'dotted_name')?.text;
            if (module) imports.push(normalizeRelativeImport(module));
        }
        if (node.type === 'import_statement') {
            for (const child of node.namedChildren) {
                if (child.type === 'dotted_name') imports.push(child.text);
                if (child.type === 'aliased_import') {
                    const imported = child.namedChildren.find((nested) => nested.type === 'dotted_name')?.text;
                    if (imported) imports.push(imported);
                }
            }
        }
    });
    return imports;
}

function normalizeRelativeImport(module) {
    if (!module.startsWith('.')) return module;
    const prefix = module.match(/^\.+/)?.[0] ?? '';
    const rest = module.slice(prefix.length);
    const directory = prefix.length === 1 ? './' : '../'.repeat(prefix.length - 1);
    return `${directory}${rest}`;
}

function extractSymbolsAst(content) {
    if (!parser) throw new Error('tree-sitter-python unavailable');
    const symbols = [];
    const tree = parser.parse(content);
    walk(tree.rootNode, (node) => {
        if (node.type === 'function_definition' || node.type === 'class_definition') {
            const name = childText(node, 'name') ?? node.namedChildren.find((child) => child.type === 'identifier')?.text;
            if (name) symbols.push(name);
        }
        if (node.type === 'assignment' && node.parent?.type === 'module') {
            const left = childText(node, 'left') ?? node.namedChildren[0]?.text;
            if (left && /^[A-Za-z_]\w*$/.test(left)) symbols.push(left);
        }
    });
    return symbols;
}

function extractImportsRegex(content) {
        const imports = [];
        // from app.models import User
        const fromImp = /^from\s+([\w.]+)\s+import/gm;
        // import os / import os, sys
        const plainImp = /^import\s+([\w.,\s]+)/gm;
        let m;
        while ((m = fromImp.exec(content)) !== null) imports.push(m[1]);
        while ((m = plainImp.exec(content)) !== null) {
            imports.push(...m[1].split(',').map(s => s.trim()));
        }
        return imports;
}

function extractSymbolsRegex(content) {
        const symbols = [];
        const patterns = [
            /^def\s+(\w+)/gm,
            /^async\s+def\s+(\w+)/gm,
            /^class\s+(\w+)/gm,
            /^(\w+)\s*=\s*(?!.*lambda)/gm,  // module-level assignments
        ];
        for (const re of patterns) {
            let m;
            while ((m = re.exec(content)) !== null) symbols.push(m[1]);
        }
        return symbols;
}

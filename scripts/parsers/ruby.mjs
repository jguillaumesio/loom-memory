import { BaseParser } from './base.mjs';
import { firstNamedChildText, loadTreeSitter, stringValue, walk } from './tree-sitter-utils.mjs';

const parser = loadTreeSitter('tree-sitter-ruby');

export class RubyParser extends BaseParser {
    get extensions() { return ['.rb']; }

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
        return [base, `${base}.rb`];
    }
}

function extractImportsAst(content) {
    if (!parser) throw new Error('tree-sitter-ruby unavailable');
    const imports = [];
    const tree = parser.parse(content);
    walk(tree.rootNode, (node) => {
        if (node.type !== 'call') return;
        const receiver = node.namedChildren[0]?.text;
        if (!['require', 'require_relative', 'autoload'].includes(receiver)) return;
        for (const child of node.namedChildren) {
            if (child.type !== 'argument_list') continue;
            for (const arg of child.namedChildren) {
                if (arg.type === 'string') {
                    const value = stringValue(arg);
                    if (value) imports.push(value);
                }
            }
        }
    });
    return imports;
}

function extractSymbolsAst(content) {
    if (!parser) throw new Error('tree-sitter-ruby unavailable');
    const symbols = [];
    const tree = parser.parse(content);
    walk(tree.rootNode, (node) => {
        if (node.type === 'method' || node.type === 'singleton_method') {
            const name = firstNamedChildText(node, ['identifier', 'operator']);
            if (name) symbols.push(name);
        }
        if (node.type === 'class' || node.type === 'module') {
            const name = firstNamedChildText(node, ['constant']);
            if (name) symbols.push(name);
        }
    });
    return symbols;
}

function extractImportsRegex(content) {
        const imports = [];
        const patterns = [
            /^require\s+['"]([^'"]+)['"]/gm,
            /^require_relative\s+['"]([^'"]+)['"]/gm,
            /^autoload\s+:\w+,\s+['"]([^'"]+)['"]/gm,
        ];
        let m;
        for (const re of patterns) {
            while ((m = re.exec(content)) !== null) imports.push(m[1]);
        }
        return imports;
}

function extractSymbolsRegex(content) {
        const symbols = [];
        const patterns = [
            /^(?:  )*(?:def\s+(?:self\.)?(\w+))/gm,
            /^(?:  )*class\s+(\w+)/gm,
            /^(?:  )*module\s+(\w+)/gm,
        ];
        for (const re of patterns) {
            let m;
            while ((m = re.exec(content)) !== null) symbols.push(m[1]);
        }
        return symbols;
}

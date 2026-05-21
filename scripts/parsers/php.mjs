import { BaseParser } from './base.mjs';
import { childText, firstNamedChildText, loadTreeSitter, stringValue, walk } from './tree-sitter-utils.mjs';

const parser = loadTreeSitter('tree-sitter-php', (mod) => mod.php ?? mod);

export class PhpParser extends BaseParser {
    get extensions() { return ['.php']; }

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
        return [base, `${base}.php`];
    }
}

function extractImportsAst(content) {
    if (!parser) throw new Error('tree-sitter-php unavailable');
    const imports = [];
    const tree = parser.parse(content);
    walk(tree.rootNode, (node) => {
        if (node.type === 'namespace_use_clause') {
            const name = firstNamedChildText(node, ['qualified_name', 'name', 'namespace_name']);
            if (name) imports.push(name.replace(/^\\/, ''));
        }
        if (node.type === 'include_expression' || node.type === 'include_once_expression' ||
            node.type === 'require_expression' || node.type === 'require_once_expression') {
            for (const child of node.namedChildren) {
                if (child.type === 'string') {
                    const value = stringValue(child);
                    if (value) imports.push(value);
                }
            }
        }
    });
    return imports;
}

function extractSymbolsAst(content) {
    if (!parser) throw new Error('tree-sitter-php unavailable');
    const symbols = [];
    const tree = parser.parse(content);
    walk(tree.rootNode, (node) => {
        if (['class_declaration', 'interface_declaration', 'trait_declaration', 'enum_declaration'].includes(node.type)) {
            const name = childText(node, 'name') ?? firstNamedChildText(node, ['name']);
            if (name) symbols.push(name);
        }
        if (node.type === 'function_definition' || node.type === 'method_declaration') {
            const name = childText(node, 'name') ?? firstNamedChildText(node, ['name']);
            if (name) symbols.push(name);
        }
        if (node.type === 'const_element') {
            const name = childText(node, 'name') ?? firstNamedChildText(node, ['name']);
            if (name) symbols.push(name);
        }
    });
    return symbols;
}

function extractImportsRegex(content) {
        const imports = [];
        // use App\Http\Controllers\UserController;
        // use App\Http\Controllers\UserController as UC;
        const useStmt = /^use\s+([\w\\]+)(?:\s+as\s+\w+)?;/gm;
        // require/include
        const req = /(?:require|include)(?:_once)?\s*\(?['"]([^'"]+)['"]\)?/g;
        let m;
        while ((m = useStmt.exec(content)) !== null) imports.push(m[1]);
        while ((m = req.exec(content)) !== null) imports.push(m[1]);
        return imports;
}

function extractSymbolsRegex(content) {
        const symbols = [];
        const patterns = [
            /^(?:abstract\s+|final\s+)?class\s+(\w+)/gm,
            /^interface\s+(\w+)/gm,
            /^trait\s+(\w+)/gm,
            /^(?:public|protected|private|static)?\s*function\s+(\w+)/gm,
            /^const\s+(\w+)/gm,
        ];
        for (const re of patterns) {
            let m;
            while ((m = re.exec(content)) !== null) symbols.push(m[1]);
        }
        return symbols;
}

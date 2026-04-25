import { BaseParser } from './base.mjs';

export class RubyParser extends BaseParser {
    get extensions() { return ['.rb']; }

    extractImports(content) {
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

    extractSymbols(content) {
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

    resolveExtensions(base) {
        return [base, `${base}.rb`];
    }
}

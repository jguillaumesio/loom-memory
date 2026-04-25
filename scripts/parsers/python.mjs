import { BaseParser } from './base.mjs';

export class PythonParser extends BaseParser {
    get extensions() { return ['.py']; }

    extractImports(content) {
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

    extractSymbols(content) {
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

    resolveExtensions(base) {
        return [base, `${base}.py`, `${base}/__init__.py`];
    }
}

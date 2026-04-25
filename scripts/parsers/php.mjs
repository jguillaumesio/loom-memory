import { BaseParser } from './base.mjs';

export class PhpParser extends BaseParser {
    get extensions() { return ['.php']; }

    extractImports(content) {
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

    extractSymbols(content) {
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

    resolveExtensions(base) {
        return [base, `${base}.php`];
    }
}

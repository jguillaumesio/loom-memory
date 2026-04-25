import { BaseParser } from './base.mjs';

export class JavascriptParser extends BaseParser {
    get extensions() {
        return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
    }

    extractImports(content) {
        const imports = [];
        // ESM: import x from '...'  /  import '...'
        const esm = /(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g;
        // CJS: require('...')
        const cjs = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        let m;
        while ((m = esm.exec(content)) !== null) imports.push(m[1]);
        while ((m = cjs.exec(content)) !== null) imports.push(m[1]);
        return imports;
    }

    extractSymbols(content) {
        const symbols = [];
        const patterns = [
            /export\s+(?:async\s+)?function\s+(\w+)/g,
            /export\s+const\s+(\w+)/g,
            /export\s+class\s+(\w+)/g,
            /export\s+interface\s+(\w+)/g,
            /export\s+type\s+(\w+)/g,
            /export\s+enum\s+(\w+)/g,
            /export\s+default\s+(?:function|class)\s+(\w+)/g,
            /module\.exports\s*=\s*(?:function\s+)?(\w+)/g,
        ];
        for (const re of patterns) {
            let m;
            while ((m = re.exec(content)) !== null) symbols.push(m[1]);
        }
        return symbols;
    }

    resolveExtensions(base) {
        return [
            base,
            `${base}.ts`, `${base}.tsx`,
            `${base}.js`, `${base}.jsx`,
            `${base}/index.ts`, `${base}/index.tsx`,
            `${base}/index.js`,
        ];
    }
}

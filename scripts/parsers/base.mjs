// parsers/base.mjs
export class BaseParser {
    /** @returns {string[]} file extensions this parser handles */
    get extensions() { throw new Error('not implemented'); }

    /** @returns {string[]} import paths found in content */
    extractImports(content, filePath) { throw new Error('not implemented'); }

    /** @returns {string[]} exported symbol names */
    extractSymbols(content, filePath) { throw new Error('not implemented'); }

    /** @returns {string[]} candidate resolved paths to try */
    resolveExtensions(base) { throw new Error('not implemented'); }
}

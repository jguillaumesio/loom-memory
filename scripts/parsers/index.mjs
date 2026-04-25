// parsers/index.mjs
import { extname } from 'path';
import { JavascriptParser } from './javascript.mjs';
import { PhpParser }        from './php.mjs';
import { PythonParser }     from './python.mjs';
import { RubyParser }       from './ruby.mjs';

const parsers = [
    new JavascriptParser(),
    new PhpParser(),
    new PythonParser(),
    new RubyParser(),
];

const byExtension = new Map();
for (const parser of parsers) {
    for (const ext of parser.extensions) {
        byExtension.set(ext, parser);
    }
}

export function getParser(filePath) {
    const ext = extname(filePath);
    return byExtension.get(ext) ?? null;
}

export function getAllExtensions() {
    return [...byExtension.keys()];
}

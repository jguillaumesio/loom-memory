import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function loadTreeSitter(languagePackage, selectLanguage = (mod) => mod) {
  try {
    const Parser = require('tree-sitter');
    const languageModule = require(languagePackage);
    const language = selectLanguage(languageModule);
    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
  } catch {
    return null;
  }
}

export function walk(node, visitor) {
  visitor(node);
  for (let i = 0; i < node.namedChildCount; i++) {
    walk(node.namedChild(i), visitor);
  }
}

export function childText(node, fieldName) {
  return node.childForFieldName(fieldName)?.text ?? null;
}

export function firstNamedChildText(node, types) {
  const wanted = new Set(types);
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (wanted.has(child.type)) return child.text;
  }
  return null;
}

export function stringValue(node) {
  if (!node) return null;
  const content = firstNamedChildText(node, ['string_content']);
  return content ?? node.text.replace(/^['"]|['"]$/g, '');
}

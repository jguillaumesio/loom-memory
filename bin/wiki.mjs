#!/usr/bin/env node
// Thin wrapper so you can run: wiki-tool update --target ../my-app

const cmd = process.argv[2];
const { execSync } = await import('child_process');
const { fileURLToPath } = await import('url');
const { dirname, join } = await import('path');

const here = dirname(fileURLToPath(import.meta.url));

const commands = {
    'update': '../scripts/update-code-map.mjs',
    'graph': '../scripts/build-graph.mjs',
    'detailed': '../scripts/update-detailed-maps.mjs',
    'init': '../scripts/init.mjs',
};

if (!commands[cmd]) {
    console.error(`Unknown command: ${cmd}`);
    console.error(`Available: ${Object.keys(commands).join(', ')}`);
    process.exit(1);
}

const scriptPath = join(here, commands[cmd]);
const restArgs = process.argv.slice(3).join(' ');

execSync(`node ${scriptPath} ${restArgs}`, { stdio: 'inherit' });

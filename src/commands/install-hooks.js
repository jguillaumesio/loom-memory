import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

export function installHuskyHooks(absPath) {
    // Install husky in target repo if not present
    const pkgPath = path.join(absPath, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    const hasHusky = pkg.devDependencies?.husky || pkg.dependencies?.husky
    if (!hasHusky) {
        console.log('  Installing husky...')
        execSync('npm install --save-dev husky', { cwd: absPath, stdio: 'inherit' })
        execSync('npx husky init', { cwd: absPath, stdio: 'inherit' })
    }

    // Write post-commit hook
    const hookDir = path.join(absPath, '.husky')
    fs.mkdirSync(hookDir, { recursive: true })

    const hook = `#!/bin/sh
# graph-rag auto self-improvement hook

echo "🔄 graph-rag: updating knowledge base..."

# 1. Rebuild import graph (fast — pure static analysis)
node build-graph.mjs

# 2. Update code maps for changed zones only (incremental)
node update-code-map.mjs

# 3. Update detailed maps for changed zones
node update-detailed-maps.mjs

# 4. Stage the updated wiki files
git add _wiki/ _graph/ 2>/dev/null || true

echo "✅ graph-rag: knowledge base updated"
`

    fs.writeFileSync(path.join(hookDir, 'post-commit'), hook, { mode: 0o755 })
    console.log('  ✅ Installed .husky/post-commit hook')
}

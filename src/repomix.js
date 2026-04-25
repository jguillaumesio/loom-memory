import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import path from 'path'
import os from 'node:os'
import crypto from 'node:crypto'

function buildRepomixConfig(repoRoot) {
    const loomIgnorePath = path.join(repoRoot, '.loomignore')
    if (!existsSync(loomIgnorePath)) return null
    const patterns = readFileSync(loomIgnorePath, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
    if (patterns.length === 0) return null
    const tmpFile = path.join(os.tmpdir(), `repomix-${crypto.randomBytes(6).toString('hex')}.json`)
    writeFileSync(tmpFile, JSON.stringify({ ignore: { customPatterns: patterns } }))
    return tmpFile
}

export function runRepomix(repoPath) {
    const outputPath = path.join(repoPath, 'repomix-output.xml')
    const configPath = buildRepomixConfig(repoPath)
    const configFlag = configPath ? ` --config ${configPath}` : ''

    try {
        execSync(
            `npx repomix --output repomix-output.xml${configFlag}`,
            {
                cwd: repoPath,
                stdio: 'pipe'
            }
        )
    } finally {
        if (configPath) {
            try { unlinkSync(configPath) } catch {}
        }
    }

    return readFileSync(outputPath, 'utf-8')
}

export function loadExistingOutput(repoPath) {
    const outputPath = path.join(repoPath, 'repomix-output.xml')
    if (!existsSync(outputPath)) {
        throw new Error('No repomix-output.xml found. Run without --skip-repomix.')
    }
    return readFileSync(outputPath, 'utf-8')
}

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

export function runRepomix(repoPath) {
    const outputPath = path.join(repoPath, 'repomix-output.xml')

    execSync(
        `npx repomix --output repomix-output.xml`,
        {
            cwd: repoPath,
            stdio: 'pipe'
        }
    )

    return readFileSync(outputPath, 'utf-8')
}

export function loadExistingOutput(repoPath) {
    const outputPath = path.join(repoPath, 'repomix-output.xml')
    if (!existsSync(outputPath)) {
        throw new Error('No repomix-output.xml found. Run without --skip-repomix.')
    }
    return readFileSync(outputPath, 'utf-8')
}

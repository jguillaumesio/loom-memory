import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import ora from 'ora'
import chalk from 'chalk'
import { callLLM } from '../llm.js'

function getChangedFiles(repoPath) {
    try {
        const output = execSync('git diff --name-only HEAD~1 HEAD', {
            cwd: repoPath,
            encoding: 'utf-8'
        })
        return output.trim().split('\n').filter(Boolean)
    } catch {
        // fallback: all staged files
        const output = execSync('git diff --name-only --cached', {
            cwd: repoPath,
            encoding: 'utf-8'
        })
        return output.trim().split('\n').filter(Boolean)
    }
}

function readChangedContent(repoPath, files) {
    return files
        .filter(f => {
            const full = path.join(repoPath, f)
            return fs.existsSync(full)
        })
        .map(f => {
            const content = fs.readFileSync(path.join(repoPath, f), 'utf-8')
            return `### ${f}\n\`\`\`\n${content}\n\`\`\``
        })
        .join('\n\n')
}

export async function runUpdate(repoPath, options) {
    const absPath = path.resolve(repoPath)
    const wikiDir = path.join(absPath, '_wiki')

    console.log(chalk.bold.cyan('\n🔄 graph-rag update\n'))

    const changedFiles = getChangedFiles(absPath)
    if (!changedFiles.length) {
        console.log(chalk.yellow('No changed files detected.'))
        return
    }

    console.log(chalk.dim(`Changed files: ${changedFiles.join(', ')}\n`))

    const changedContext = readChangedContent(absPath, changedFiles)

    // Re-generate call graph for changed files only
    const spinner = ora('Updating _wiki/05-Call-Graph.md for changed files...').start()
    try {
        const prompt = `
Update the call graph for ONLY these changed files. 
Use the same format as before (📁 file * function * Logic * -> Calls).
Only output entries for the files listed below.

${changedContext}
`
        const output = await callLLM(prompt, changedContext)

        // Append to existing call graph with a timestamp section
        const cgPath = path.join(wikiDir, '05-Call-Graph.md')
        const existing = fs.existsSync(cgPath) ? fs.readFileSync(cgPath, 'utf-8') : ''
        const timestamp = new Date().toISOString().split('T')[0]
        const updated = `${existing}\n\n---\n## Updated ${timestamp}\n\n${output}`
        fs.writeFileSync(cgPath, updated, 'utf-8')

        spinner.succeed('Call graph updated')
    } catch (e) {
        spinner.fail(e.message)
    }

    console.log(chalk.bold.green('\n✅ Update complete\n'))
}

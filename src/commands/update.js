import path from 'path'
import fs from 'fs'
import { execFileSync, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import ora from 'ora'
import chalk from 'chalk'
import { callLLM } from '../llm.js'
import { loadConfig } from '../config.js'
import { parseWikiFiles } from '../wiki-parser.js'
import { replaceSection } from '../utils/wiki-section.js'

function taskSpinner(label, silent) {
    if (!silent) return ora(label).start()
    return {
        succeed() {},
        fail(message) { if (message) console.error(message) },
        warn(message) { if (message) console.error(message) },
    }
}

function getChangedFiles(repoPath, since = 'last-commit') {
    const diffRef = since === 'last-commit' ? 'HEAD~1 HEAD' : `${since} HEAD`
    try {
        const output = execSync(`git diff --name-only ${diffRef}`, {
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

function loadPrompt(name) {
    const p = new URL(`../../prompts/${name}.md`, import.meta.url)
    return fs.readFileSync(p, 'utf-8')
}

export function zoneSectionId(zoneName) {
    return `zone-${zoneName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root'}`
}

export function affectedZones(changedFiles, zones) {
    if (changedFiles.includes('*')) return zones
    return zones.filter((zone) => changedFiles.some((file) => file === zone.path || file.startsWith(zone.path.replace(/\/$/, '') + '/')))
}

function filesForZone(changedFiles, zone) {
    if (changedFiles.includes('*')) return []
    return changedFiles.filter((file) => file === zone.path || file.startsWith(zone.path.replace(/\/$/, '') + '/'))
}

export async function runUpdate(repoPath, options) {
    const absPath = path.resolve(repoPath)
    const config = await loadConfig(absPath)
    const wikiDir = path.join(absPath, config.output.wiki)
    const silent = !!options.silent

    if (!silent) console.log(chalk.bold.cyan('\nloom-memory update\n'))

    let spinner = taskSpinner('Rebuilding static graph...', silent)
    try {
        const graphScript = new URL('../../scripts/build-graph.mjs', import.meta.url)
        execFileSync(process.execPath, [fileURLToPath(graphScript)], { cwd: absPath, stdio: silent ? 'ignore' : 'inherit' })
        spinner.succeed('Static graph rebuilt')
    } catch (e) {
        spinner.fail('Static graph failed: ' + e.message)
    }

    const changedFiles = options.all ? ['*'] : getChangedFiles(absPath, options.since)
    if (!changedFiles.length) {
        if (!silent) console.log(chalk.yellow('No changed files detected.'))
        await runMapScripts(absPath, options, silent)
        return
    }

    if (!silent) console.log(chalk.dim(`Changed files: ${changedFiles.join(', ')}\n`))

    const changedContext = options.all ? '' : readChangedContent(absPath, changedFiles)

    await updateWikiSections(absPath, wikiDir, config, changedFiles, silent)

    // Re-generate call graph for changed files only
    spinner = taskSpinner('Updating _wiki/05-Call-Graph.md for changed files...', silent)
    try {
        if (!changedContext) throw new Error('No readable changed files for LLM call graph update')
        const prompt = `
Update the call graph for ONLY these changed files. 
Use the same format as before (📁 file * function * Logic * -> Calls).
Only output entries for the files listed below.

${changedContext}
`
        const output = await callLLM(prompt, changedContext, {
            repoRoot: absPath,
            config,
            task: 'incremental-call-graph',
            model: config.llm.models.callGraph,
        })

        // Append to existing call graph with a timestamp section
        const cgPath = path.join(wikiDir, '05-Call-Graph.md')
        const existing = fs.existsSync(cgPath) ? fs.readFileSync(cgPath, 'utf-8') : ''
        const timestamp = new Date().toISOString().split('T')[0]
        const updated = `${existing}\n\n---\n## Updated ${timestamp}\n\n${output}`
        fs.writeFileSync(cgPath, updated, 'utf-8')

        spinner.succeed('Call graph updated')
    } catch (e) {
        spinner.warn(e.message)
    }

    await runMapScripts(absPath, options, silent)

    if (!silent) console.log(chalk.bold.green('\nUpdate complete\n'))
}

async function updateWikiSections(absPath, wikiDir, config, changedFiles, silent) {
    const zones = affectedZones(changedFiles, config.zones)
    if (!zones.length || changedFiles.includes('*')) return

    const promptTemplate = loadPrompt('wiki-section')
    for (const zone of zones) {
        const zoneFiles = filesForZone(changedFiles, zone)
        const zoneContext = readChangedContent(absPath, zoneFiles)
        const spinner = taskSpinner(`Updating wiki sections for ${zone.name}...`, silent)

        try {
            if (!zoneContext) throw new Error(`No readable changed files for ${zone.name}`)
            const prompt = `${promptTemplate}

Zone: ${zone.name}
Path: ${zone.path}
Description: ${zone.description || 'N/A'}
Changed files: ${zoneFiles.join(', ')}
`
            const output = await callLLM(prompt, zoneContext, {
                repoRoot: absPath,
                config,
                task: 'incremental-wiki-section',
                zone: zone.name,
                model: config.llm.models.wiki,
            })
            const files = parseWikiFiles(output)
            const sectionId = zoneSectionId(zone.name)
            const title = `Zone: ${zone.name}`

            for (const [filename, content] of Object.entries(files)) {
                if (!['01-Architecture-Stack.md', '02-Fonctionnalites-Actuelles.md', '03-Regles-LLM.md'].includes(filename)) continue
                replaceSection(path.join(wikiDir, filename), sectionId, content, { title })
            }
            spinner.succeed(`Wiki sections updated for ${zone.name}`)
        } catch (e) {
            spinner.warn(`Wiki section update skipped for ${zone.name}: ${e.message}`)
        }
    }
}

async function runMapScripts(absPath, options, silent) {
    const args = ['--target', absPath]
    if (options.silent) args.push('--silent')
    if (options.all) args.push('--all')

    const scripts = [
        { label: 'zone maps', file: '../../scripts/update-code-map.mjs' },
        { label: 'detailed maps', file: '../../scripts/update-detailed-maps.mjs' },
    ]

    for (const script of scripts) {
        const spinner = taskSpinner(`Updating ${script.label}...`, silent)
        try {
            const scriptUrl = new URL(script.file, import.meta.url)
            execFileSync(process.execPath, [fileURLToPath(scriptUrl), ...args], {
                cwd: absPath,
                stdio: silent ? 'ignore' : 'inherit',
            })
            spinner.succeed(`${script.label} updated`)
        } catch (e) {
            spinner.warn(`${script.label} skipped: ${e.message}`)
        }
    }
}

import path from 'path'
import fs from 'fs'
import ora from 'ora'
import chalk from 'chalk'
import { runRepomix, loadExistingOutput } from '../repomix.js'
import { callLLM } from '../llm.js'
import { parseWikiFiles } from '../wiki-parser.js'
import { execSync } from 'child_process'

function buildGraph(absPath) {
    const graphScript = path.join(absPath, 'build-graph.mjs')
    if (!fs.existsSync(graphScript)) {
        const src = new URL('../../scripts/build-graph.mjs', import.meta.url)
        fs.copyFileSync(src, graphScript)
    }
    execSync(`node build-graph.mjs`, { cwd: absPath, stdio: 'inherit' })
}

function loadPrompt(name) {
    const p = new URL(`../../prompts/${name}.md`, import.meta.url)
    return fs.readFileSync(p, 'utf-8')
}

function writeFile(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
}

function ensureDocsFiles(absPath) {
    // Create decisions.md and pitfalls.md if they don't exist
    // so AGENTS.md references are immediately valid
    const decisions = path.join(absPath, 'docs/decisions.md')
    const pitfalls = path.join(absPath, 'docs/pitfalls.md')

    if (!fs.existsSync(decisions)) {
        writeFile(decisions, `# Decisions Log\n\nAppend decisions here after each significant task.\n`)
    }
    if (!fs.existsSync(pitfalls)) {
        writeFile(pitfalls, `# Pitfalls Log\n\nAppend traps and false assumptions here.\n`)
    }
}

export async function runInit(repoPath, options) {
    const absPath = path.resolve(repoPath)
    const wikiDir = path.join(absPath, '_wiki')

    console.log(chalk.bold.cyan('\n🚀 graph-rag init\n'))
    console.log(chalk.dim(`Target repo: ${absPath}\n`))

    // ── Step 1: Repomix ──────────────────────────────────────────────────────
    let spinner = ora('Packing repository with repomix...').start()
    let contextXml
    try {
        if (options.skipRepomix) {
            contextXml = loadExistingOutput(absPath)
            spinner.succeed('Loaded existing repomix-output.xml')
        } else {
            contextXml = runRepomix(absPath)
            spinner.succeed(
                `Repository packed (${Math.round(contextXml.length / 1000)}k chars)`
            )
        }
    } catch (e) {
        spinner.fail(e.message)
        process.exit(1)
    }

    // ── Step 2: Wiki files ───────────────────────────────────────────────────
    spinner = ora('Generating _wiki/ (4 files)...').start()
    try {
        const wikiOutput = await callLLM(loadPrompt('wiki'), contextXml)
        const wikiFiles = parseWikiFiles(wikiOutput)

        for (const [filename, content] of Object.entries(wikiFiles)) {
            writeFile(path.join(wikiDir, filename), content)
        }
        spinner.succeed(
            `Generated ${Object.keys(wikiFiles).length} wiki files → _wiki/`
        )
    } catch (e) {
        spinner.fail('Wiki generation failed: ' + e.message)
        process.exit(1)
    }

    // ── Step 3: Code Map ─────────────────────────────────────────────────────
    spinner = ora('Generating _wiki/04-Code-Map.md...').start()
    try {
        const mapOutput = await callLLM(loadPrompt('map'), contextXml)
        writeFile(path.join(wikiDir, '04-Code-Map.md'), mapOutput)
        spinner.succeed('Generated _wiki/04-Code-Map.md')
    } catch (e) {
        spinner.fail('Code map generation failed: ' + e.message)
        process.exit(1)
    }

    // ── Step 4: Call Graph ───────────────────────────────────────────────────
    spinner = ora('Generating _wiki/05-Call-Graph.md...').start()
    try {
        const cgOutput = await callLLM(loadPrompt('callgraph'), contextXml)
        writeFile(path.join(wikiDir, '05-Call-Graph.md'), cgOutput)
        spinner.succeed('Generated _wiki/05-Call-Graph.md')
    } catch (e) {
        spinner.fail('Call graph generation failed: ' + e.message)
        process.exit(1)
    }

    // ── Step 5: AGENTS.md (template-based) ───────────────────────────────────
    spinner = ora('Generating AGENTS.md...').start()
    try {
        const agentsOutput = await callLLM(loadPrompt('agents'), contextXml)

        // Write to ROOT of target repo, not wiki
        writeFile(path.join(absPath, 'AGENTS.md'), agentsOutput)
        spinner.succeed('Generated AGENTS.md → repo root')
    } catch (e) {
        spinner.fail('AGENTS.md generation failed: ' + e.message)
        process.exit(1)
    }

    // ── Step 6: Scaffold docs/ ───────────────────────────────────────────────
    spinner = ora('Scaffolding docs/decisions.md and docs/pitfalls.md...').start()
    ensureDocsFiles(absPath)
    spinner.succeed('docs/ scaffolded (skipped if already exists)')

    // ── Done ──────────────────────────────────────────────────────────────────
    console.log(chalk.bold.green('\n✅ Done!\n'))
    console.log(chalk.dim(`Injected into: ${absPath}`))
    console.log('')
    console.log('  _wiki/00-Index.md')
    console.log('  _wiki/01-Architecture-Stack.md')
    console.log('  _wiki/02-Fonctionnalites-Actuelles.md')
    console.log('  _wiki/03-Regles-LLM.md')
    console.log('  _wiki/04-Code-Map.md')
    console.log('  _wiki/05-Call-Graph.md')
    console.log('  AGENTS.md             ← repo root')
    console.log('  docs/decisions.md     ← scaffolded')
    console.log('  docs/pitfalls.md      ← scaffolded')
    console.log('')
}

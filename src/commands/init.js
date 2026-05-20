import path from 'path'
import fs from 'fs'
import ora from 'ora'
import chalk from 'chalk'
import { runRepomix, loadExistingOutput } from '../repomix.js'
import { callLLM } from '../llm.js'
import { parseWikiFiles } from '../wiki-parser.js'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { ensureGitignore } from '../utils/gitignore.js'
import { writeManagedBlock } from '../utils/managed-block.js'
import { loadConfig } from '../config.js'
import { installHooks } from './install-hooks.js'
import { withWikiFrontmatter } from '../utils/wiki-frontmatter.js'
import { listModels } from '../utils/ollama.js'

function buildGraph(absPath) {
    const graphScript = new URL('../../scripts/build-graph.mjs', import.meta.url)
    execFileSync(process.execPath, [fileURLToPath(graphScript)], { cwd: absPath, stdio: 'inherit' })
}

function loadPrompt(name) {
    const p = new URL(`../../prompts/${name}.md`, import.meta.url)
    return fs.readFileSync(p, 'utf-8')
}

function packageVersion() {
    const p = new URL('../../package.json', import.meta.url)
    return JSON.parse(fs.readFileSync(p, 'utf-8')).version
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

function writeJson(filePath, value) {
    writeFile(filePath, JSON.stringify(value, null, 2) + '\n')
}

function ensureLocalConfig(absPath, config) {
    const configPath = path.join(absPath, '.loom-memory')
    if (fs.existsSync(configPath)) return 'exists'
    writeJson(configPath, {
        zones: config.zones,
        output: config.output,
        llm: {
            provider: config.llm.provider,
            model: config.llm.model,
            models: config.llm.models,
        },
        ollama: config.ollama,
        ignore: config.ignore,
    })
    return 'created'
}

function writeMcpConfig(absPath) {
    const serverScript = fileURLToPath(new URL('../../scripts/graph-mcp.mjs', import.meta.url))
    const config = {
        mcpServers: {
            'loom-memory': {
                command: process.execPath,
                args: [serverScript],
                cwd: absPath,
            },
        },
    }
    writeJson(path.join(absPath, 'mcp.json'), config)
    writeJson(path.join(absPath, '.cursor/mcp.json'), config)
}

export async function runInit(repoPath, options) {
    const absPath = path.resolve(repoPath)
    const config = await loadConfig(absPath)
    const version = packageVersion()
    const wikiDir = path.join(absPath, config.output.wiki)
    const graphDir = path.join(absPath, config.output.graph)

    console.log(chalk.bold.cyan('\nloom-memory init\n'))
    console.log(chalk.dim(`Target repo: ${absPath}\n`))

    if (options.dryRun) {
        printInitDryRun(absPath, config, options)
        return
    }

    try {
        await preflightLlm(absPath, config, options)
    } catch (e) {
        console.error(chalk.red('LLM preflight failed: ' + e.message))
        process.exit(1)
    }

    // ── Step 1: Static graph ─────────────────────────────────────────────────
    let spinner = ora('Building static graph...').start()
    try {
        buildGraph(absPath)
        spinner.succeed(`Graph built → ${path.relative(absPath, path.join(graphDir, 'codebase.db'))}`)
    } catch (e) {
        spinner.fail('Graph build failed: ' + e.message)
        process.exit(1)
    }

    // ── Step 2: Repomix ──────────────────────────────────────────────────────
    spinner = ora('Packing repository with repomix...').start()
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
        const wikiPrompt = loadPrompt('wiki')
        const wikiOutput = await callLLM(wikiPrompt, contextXml, {
            repoRoot: absPath,
            config,
            task: 'wiki-generation',
            model: options.model || config.llm.models.wiki,
        })
        const wikiFiles = parseWikiFiles(wikiOutput)

        for (const [filename, content] of Object.entries(wikiFiles)) {
            writeFile(path.join(wikiDir, filename), withWikiFrontmatter(content, {
                prompt: wikiPrompt,
                version,
            }))
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
        const mapPrompt = loadPrompt('map')
        const mapOutput = await callLLM(mapPrompt, contextXml, {
            repoRoot: absPath,
            config,
            task: 'code-map',
            model: options.model || config.llm.models.wiki,
        })
        writeFile(path.join(wikiDir, '04-Code-Map.md'), withWikiFrontmatter(mapOutput, {
            prompt: mapPrompt,
            version,
        }))
        spinner.succeed('Generated _wiki/04-Code-Map.md')
    } catch (e) {
        spinner.fail('Code map generation failed: ' + e.message)
        process.exit(1)
    }

    // ── Step 4: Call Graph ───────────────────────────────────────────────────
    spinner = ora('Generating _wiki/05-Call-Graph.md...').start()
    try {
        const callGraphPrompt = loadPrompt('callgraph')
        const cgOutput = await callLLM(callGraphPrompt, contextXml, {
            repoRoot: absPath,
            config,
            task: 'call-graph',
            model: options.model || config.llm.models.callGraph,
        })
        writeFile(path.join(wikiDir, '05-Call-Graph.md'), withWikiFrontmatter(cgOutput, {
            prompt: callGraphPrompt,
            version,
        }))
        spinner.succeed('Generated _wiki/05-Call-Graph.md')
    } catch (e) {
        spinner.fail('Call graph generation failed: ' + e.message)
        process.exit(1)
    }

    // ── Step 5: AGENTS.md (template-based) ───────────────────────────────────
    spinner = ora('Generating AGENTS.md...').start()
    try {
        const agentsOutput = await callLLM(loadPrompt('agents'), contextXml, {
            repoRoot: absPath,
            config,
            task: 'agents',
            model: options.model || config.llm.models.agents,
        })
        const generated = '<!-- Edit OUTSIDE the markers to keep your changes across regenerations. -->\n\n' + agentsOutput
        const agentsPath = path.join(absPath, 'AGENTS.md')
        const action = writeManagedBlock(agentsPath, generated, {
            header: '# AGENTS.md\n\n> Instructions for AI coding agents working in this repository.\n> The block below is auto-generated by loom-memory. Edit outside the markers to add custom rules.'
        })
        spinner.succeed(`AGENTS.md ${action} → repo root`)
    } catch (e) {
        spinner.fail('AGENTS.md generation failed: ' + e.message)
        process.exit(1)
    }

    // ── Step 6: Scaffold docs/ ───────────────────────────────────────────────
    spinner = ora('Scaffolding docs/decisions.md and docs/pitfalls.md...').start()
    ensureDocsFiles(absPath)
    spinner.succeed('docs/ scaffolded (skipped if already exists)')

    // ── Step 7: .gitignore ───────────────────────────────────────────────────
    const gitignoreResult = ensureGitignore(absPath)
    console.log(chalk.gray(`  ✓ .gitignore ${gitignoreResult.action}: _graph/*.db excluded`))

    // ── Step 8: Local config + MCP ───────────────────────────────────────────
    const configAction = ensureLocalConfig(absPath, config)
    console.log(chalk.gray(`  ✓ .loom-memory ${configAction}`))
    writeMcpConfig(absPath)
    console.log(chalk.gray('  ✓ MCP config written: mcp.json + .cursor/mcp.json'))

    // ── Step 9: Hooks ────────────────────────────────────────────────────────
    if (options.hooks !== false) {
        try {
            installHooks(absPath, { githubAction: options.githubAction })
        } catch (e) {
            console.log(chalk.yellow(`  ! Hooks skipped: ${e.message}`))
        }
    }

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
    console.log('  mcp.json              ← MCP config')
    console.log('  .cursor/mcp.json      ← Cursor MCP config')
    console.log('  docs/decisions.md     ← scaffolded')
    console.log('  docs/pitfalls.md      ← scaffolded')
    console.log('')
}

async function preflightLlm(absPath, config, options) {
    if (config.llm.provider !== 'ollama') return

    const models = await listModels(config.ollama?.url ?? config.llm?.ollamaUrl)
    const required = Array.from(new Set([
        options.model,
        config.llm.model,
        config.ollama?.model,
        ...Object.values(config.llm.models ?? {}),
    ].filter(Boolean)))
    const missing = required.filter((model) => !models.some((available) => available === model || available.split(':')[0] === model.split(':')[0]))

    if (missing.length > 0) {
        throw new Error(
            `Missing Ollama model(s) for ${absPath}: ${missing.join(', ')}.\n` +
            missing.map((model) => `Run \`ollama pull ${model}\`.`).join('\n')
        )
    }
}

function printInitDryRun(absPath, config, options) {
    const planned = [
        path.join(config.output.graph, 'codebase.db'),
        path.join(config.output.wiki, '00-Index.md'),
        path.join(config.output.wiki, '01-Architecture-Stack.md'),
        path.join(config.output.wiki, '02-Fonctionnalites-Actuelles.md'),
        path.join(config.output.wiki, '03-Regles-LLM.md'),
        path.join(config.output.wiki, '04-Code-Map.md'),
        path.join(config.output.wiki, '05-Call-Graph.md'),
        'AGENTS.md',
        'docs/decisions.md',
        'docs/pitfalls.md',
        '.gitignore',
        '.loom-memory',
        'mcp.json',
        '.cursor/mcp.json',
    ]

    if (options.hooks !== false) planned.push('.git/hooks/post-commit')
    if (options.githubAction) planned.push('.github/workflows/loom-memory.yml')

    console.log(chalk.bold('Dry run only. No files will be written.\n'))
    console.log(chalk.bold('Configuration'))
    console.log(`  Provider: ${chalk.cyan(config.llm.provider)}`)
    console.log(`  Default model: ${chalk.cyan(options.model || config.llm.model)}`)
    console.log(`  Task models: ${chalk.cyan(JSON.stringify(config.llm.models))}`)
    console.log(`  Wiki output: ${chalk.cyan(config.output.wiki)}`)
    console.log(`  Graph output: ${chalk.cyan(config.output.graph)}`)
    console.log(`  Zones: ${chalk.cyan(config.zones.map((z) => z.path).join(', '))}`)

    console.log(chalk.bold('\nPlanned writes'))
    for (const rel of planned) {
        const exists = fs.existsSync(path.join(absPath, rel))
        console.log(`  ${exists ? chalk.yellow('update') : chalk.green('create')} ${rel}`)
    }

    console.log(chalk.bold('\nPlanned work'))
    console.log('  Build static graph')
    console.log(options.skipRepomix ? '  Load existing repomix-output.xml' : '  Pack repository with Repomix')
    console.log('  Generate wiki, code map, call graph, AGENTS.md')
    console.log(options.hooks === false ? '  Skip Git hook installation' : '  Install Git post-commit hook')
}

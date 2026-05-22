#!/usr/bin/env node
import path from 'node:path'
import { program } from 'commander'
import { runInit } from '../src/commands/init.js'
import { runUpdate } from '../src/commands/update.js'
import { doctorCommand } from '../src/commands/doctor.js'
import { statusCommand } from '../src/commands/status.js'
import { installHooks } from '../src/commands/install-hooks.js'
import { verifyCommand } from '../src/commands/verify.js'
import { searchCommand } from '../src/commands/search.js'
import { benchmarkCommand } from '../src/commands/benchmark.js'

program
    .name('loom-memory')
    .description('Persistent repository memory for AI coding agents')
    .version('1.0.0')

program
    .command('init <repoPath>')
    .description('Initialize repository memory for a repository')
    .option('--model <model>', 'Override generation model')
    .option('--skip-repomix', 'Use existing repomix-output.xml')
    .option('--no-hooks', 'Skip installing Git hooks')
    .option('--github-action', 'Install a GitHub Actions workflow')
    .option('--dry-run', 'Show planned initialization writes without changing the target repository')
    .action(runInit)

program
    .command('update <repoPath>')
    .description('Refresh repository memory based on git changes')
    .option('--since <ref>', 'Git ref to diff from', 'last-commit')
    .option('--silent', 'Reduce command output')
    .option('--all', 'Refresh all generated local maps')
    .action(runUpdate)

program
    .command('doctor')
    .description('Diagnose environment and repository setup')
    .argument('[repoPath]', 'Repository path', '.')
    .action(doctorCommand)

program
    .command('status')
    .description('Show index freshness and statistics')
    .argument('[repoPath]', 'Repository path', '.')
    .action(statusCommand)

program
    .command('verify')
    .description('Verify generated memory against the graph and filesystem')
    .argument('[repoPath]', 'Repository path', '.')
    .action(verifyCommand)

program
    .command('search <repoPath> <query>')
    .description('Search local code and wiki memory for compact relevant context')
    .option('--limit <n>', 'Maximum number of chunks to return', '8')
    .action(searchCommand)

program
    .command('benchmark')
    .description('Measure graph coverage and estimated token reduction')
    .argument('[repoPath]', 'Repository path', '.')
    .option('--chunks <n>', 'Retrieval chunk count to model', '8')
    .option('--json', 'Print machine-readable JSON')
    .action(benchmarkCommand)

program
    .command('install-hooks <repoPath>')
    .description('Install post-commit hooks for auto self-improvement')
    .option('--github-action', 'Also install a GitHub Actions workflow')
    .action((repoPath, options) => {
        installHooks(path.resolve(repoPath), options)
    })

program.parse()

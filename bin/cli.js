#!/usr/bin/env node
import { program } from 'commander'
import { runInit } from '../src/commands/init.js'
import { runUpdate } from '../src/commands/update.js'
import { doctorCommand } from '../src/commands/doctor.js'

program
    .name('graph-rag')
    .description('Generate AI context wiki for any repository')
    .version('1.0.0')

program
    .command('init <repoPath>')
    .description('Full wiki generation for a repository')
    .option('--model <model>', 'Override model (gpt-4o, claude-sonnet)')
    .option('--skip-repomix', 'Use existing repomix-output.xml')
    .action(runInit)

program
    .command('update <repoPath>')
    .description('Incremental refresh based on git changes')
    .option('--since <ref>', 'Git ref to diff from', 'last-commit')
    .action(runUpdate)

program
    .command('doctor')
    .description('Diagnose environment and repository setup')
    .action(doctorCommand)

program
    .command('install-hooks <repoPath>')
    .description('Install Husky post-commit hook for auto self-improvement')
    .action(async (repoPath) => {
        const { installHuskyHooks } = await import('../src/commands/install-hooks.js')
        installHuskyHooks(path.resolve(repoPath))
    })

program.parse()

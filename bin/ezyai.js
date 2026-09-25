#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const skills = require('../core/skills/skillsManager');
const ssh = require('../core/ssh/sshClient');

const program = new Command();
program.name('ezyai').description('EzyAi Helper CLI — skills hub + SSH ops').version('0.1.0');

const skillsCmd = program.command('skills').description('manage synced AI-assistant skills');

skillsCmd
  .command('list')
  .description('list skills in the central store')
  .action(() => {
    console.log(JSON.stringify(skills.listSkills(), null, 2));
  });

skillsCmd
  .command('targets')
  .description('list known sync targets')
  .action(() => {
    console.log(JSON.stringify(skills.knownTargets(), null, 2));
  });

skillsCmd
  .command('add <name> <file>')
  .description('add a skill from a SKILL.md file')
  .action((name, file) => {
    const fs = require('fs');
    const content = fs.readFileSync(file, 'utf8');
    console.log(JSON.stringify(skills.createSkill(name, content), null, 2));
  });

skillsCmd
  .command('sync <name> <targetId>')
  .description('symlink a skill into a target tool')
  .action((name, targetId) => {
    console.log(JSON.stringify(skills.syncSkill(name, targetId), null, 2));
  });

skillsCmd
  .command('unsync <name> <targetId>')
  .description('remove a skill symlink from a target tool')
  .action((name, targetId) => {
    console.log(JSON.stringify(skills.unsyncSkill(name, targetId), null, 2));
  });

skillsCmd
  .command('rm <name>')
  .description('delete a skill and all its symlinks')
  .action((name) => {
    skills.deleteSkill(name);
    console.log(JSON.stringify({ deleted: name }, null, 2));
  });

const sshCmd = program.command('ssh').description('safe remote SSH operations');

sshCmd
  .command('run <host> <command...>')
  .description('run a command on a remote host')
  .option('--timeout <ms>', 'timeout in milliseconds', '30000')
  .option('--confirm', 'confirm a command that looks destructive', false)
  .action(async (host, commandParts, options) => {
    const result = await ssh.runCommand(host, commandParts.join(' '), {
      timeoutMs: Number(options.timeout),
      confirm: options.confirm,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'ok') process.exitCode = 1;
  });

sshCmd
  .command('copy <host> <localPath> <remotePath>')
  .description('copy a file to a remote host via scp')
  .option('--download', 'copy from remote to local instead of local to remote', false)
  .action(async (host, localPath, remotePath, options) => {
    const result = await ssh.transferFile(host, localPath, remotePath, options.download ? 'download' : 'upload');
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'ok') process.exitCode = 1;
  });

program
  .command('goal <goal...>')
  .description('have the Commander plan a goal and dispatch specialist agents')
  .requiredOption('--model <model>', 'model name')
  .option('--kind <kind>', 'openai (default; also Ollama/llama-server) or anthropic', 'openai')
  .option('--base-url <url>', 'provider base URL, e.g. http://127.0.0.1:11434')
  .option('--key-env <name>', 'environment variable holding the API key')
  .action(async (goalParts, options) => {
    const { createProvider } = require('../core/agents/providers');
    const { runGoal } = require('../core/agents/commander');
    const provider = createProvider({
      kind: options.kind,
      baseUrl: options.baseUrl,
      model: options.model,
      apiKeyEnv: options.keyEnv,
    });
    const out = await runGoal(goalParts.join(' '), {
      provider,
      onEvent: (e) => console.error(JSON.stringify(e)),
    });
    console.log(JSON.stringify(out, null, 2));
  });

program.parseAsync(process.argv);

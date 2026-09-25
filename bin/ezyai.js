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
  .command('unmanaged')
  .description('list existing skill folders in your tools that the hub does not manage')
  .action(() => {
    console.log(JSON.stringify(skills.listUnmanaged(), null, 2));
  });

skillsCmd
  .command('import <name> <targetId>')
  .description('move an existing skill folder into the hub and leave a symlink')
  .action((name, targetId) => {
    console.log(JSON.stringify(skills.importSkill(name, targetId), null, 2));
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
  .option('--bind <folder>', 'apply ```file:path blocks from agent output inside this folder (undoable)')
  .action(async (goalParts, options) => {
    const { createProvider } = require('../core/agents/providers');
    const { runGoal } = require('../core/agents/commander');
    const runs = require('../core/research/runs');
    const fileWrites = require('../core/goals/fileWrites');
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
    const run = runs.saveRun({ goal: goalParts.join(' '), ...out });
    let undoId = null;
    if (options.bind) {
      const writes = Object.values(out.results).flatMap(fileWrites.parseFileBlocks);
      if (writes.length) undoId = fileWrites.applyWrites(options.bind, writes);
    }
    console.log(JSON.stringify({ runId: run.id, undoId, ...out }, null, 2));
  });

program
  .command('undo <id>')
  .description('undo a goal run\'s file writes')
  .action((id) => {
    require('../core/goals/fileWrites').undo(id);
    console.log(JSON.stringify({ undone: id }));
  });

const runsCmd = program.command('runs').description('run history with provenance');
runsCmd.command('list').option('-q, --query <text>').option('--all', 'include archived')
  .action((o) => console.log(JSON.stringify(require('../core/research/runs').listRuns({ query: o.query, includeArchived: o.all }), null, 2)));
runsCmd.command('export <id>')
  .action((id) => console.log(require('../core/research/runs').exportMarkdown(id)));
runsCmd.command('verify <id>')
  .action((id) => console.log(JSON.stringify(require('../core/research/runs').verifyRun(id), null, 2)));
runsCmd.command('archive <id>')
  .action((id) => require('../core/research/runs').setArchived(id, true));

program
  .command('edit <file> <newTextFile>')
  .description('propose an edit as reviewable hunks; --accept applies chosen hunk indexes')
  .option('--accept <indexes>', 'comma-separated hunk indexes to apply, or "all"')
  .action((file, newTextFile, o) => {
    const fs = require('fs');
    const { proposeEdit, applyPatch } = require('../core/office/patches');
    const patch = proposeEdit(file, fs.readFileSync(newTextFile, 'utf8'));
    if (!o.accept) return console.log(JSON.stringify(patch.hunks, null, 2));
    const idx = o.accept === 'all' ? patch.hunks.map((h) => h.index) : o.accept.split(',').map(Number);
    applyPatch(patch, idx);
    console.log(JSON.stringify({ applied: idx }));
  });

const docxCmd = program.command('docx').description('Word documents with tracked changes');
docxCmd.command('read <file>')
  .action(async (file) => {
    const paras = await require('../core/office/docx').readDocx(require('fs').readFileSync(file));
    console.log(JSON.stringify(paras, null, 2));
  });
docxCmd.command('edit <file> <newParagraphsJson>')
  .description('newParagraphsJson: JSON array of the full paragraph list after edits')
  .option('--accept <indexes>', 'comma-separated paragraph indexes, or "all"; omit to just list changes')
  .option('--out <file>', 'output path (default: overwrite input)')
  .option('--author <name>', 'tracked-change author', 'EzyAi')
  .action(async (file, jsonFile, o) => {
    const fs = require('fs');
    const d = require('../core/office/docx');
    const buf = fs.readFileSync(file);
    const changes = await d.proposeDocxEdit(buf, JSON.parse(fs.readFileSync(jsonFile, 'utf8')));
    if (!o.accept) return console.log(JSON.stringify(changes, null, 2));
    const idx = o.accept === 'all' ? changes.map((c) => c.index) : o.accept.split(',').map(Number);
    fs.writeFileSync(o.out || file, await d.applyDocxEdit(buf, changes, idx, { author: o.author }));
    console.log(JSON.stringify({ applied: idx }));
  });

const marketCmd = program.command('market').description('skill marketplace');
marketCmd.command('list <registryUrl>')
  .action(async (url) => console.log(JSON.stringify(await require('../core/marketplace/registry').fetchRegistry(url), null, 2)));
marketCmd.command('install <registryUrl> <name>')
  .action(async (url, name) => {
    const m = require('../core/marketplace/registry');
    const entry = (await m.fetchRegistry(url)).find((s) => s.name === name);
    if (!entry) throw new Error(`no skill "${name}" in registry`);
    console.log(JSON.stringify(await m.installSkill(entry, skills)));
  });

program.parseAsync(process.argv);

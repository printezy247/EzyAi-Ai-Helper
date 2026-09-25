'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ezyai-p-'));
process.env.HOME = tmp(); // skills store resolves from HOME at load time

const runs = require('./research/runs');
const { proposeEdit, applyPatch } = require('./office/patches');
const { parseFileBlocks, applyWrites, undo } = require('./goals/fileWrites');
const market = require('./marketplace/registry');
const skills = require('./skills/skillsManager');

test('runs: save, search, archive, verify, export', () => {
  const base = tmp();
  const run = runs.saveRun(
    { goal: 'study cats', plan: [{ id: 't1', agent: 'researcher', task: 'x' }, { id: 't2', agent: 'writer', task: 'y', dependsOn: ['t1'] }], results: { t1: 'purr facts', t2: 'article' } },
    base
  );
  assert.equal(runs.listRuns({ query: 'purr' }, base).length, 1);
  assert.equal(runs.listRuns({ query: 'dogs' }, base).length, 0);
  assert.ok(runs.verifyRun(run.id, base).every((a) => a.ok));
  runs.setArchived(run.id, true, base);
  assert.equal(runs.listRuns({}, base).length, 0);
  assert.equal(runs.listRuns({ includeArchived: true }, base).length, 1);
  assert.match(runs.exportMarkdown(run.id, base), /Inputs: t1/);
  // tampering is detected
  const p = path.join(base, run.id, 'run.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.artifacts[0].content = 'changed';
  fs.writeFileSync(p, JSON.stringify(j));
  assert.equal(runs.verifyRun(run.id, base)[0].ok, false);
});

test('patches: accept some hunks, reject others, preserve untouched lines', () => {
  const dir = tmp();
  const f = path.join(dir, 'doc.md');
  fs.writeFileSync(f, 'a\nb\nc\nd\ne\n');
  const patch = proposeEdit(f, 'a\nB\nc\nd\nE\n');
  assert.equal(patch.hunks.length, 2);
  const out = applyPatch(patch, [0]); // accept only the first change
  assert.equal(out, 'a\nB\nc\nd\ne\n');
});

test('patches: refuses when the file changed after proposal', () => {
  const f = path.join(tmp(), 'd.txt');
  fs.writeFileSync(f, 'one\n');
  const patch = proposeEdit(f, 'two\n');
  fs.writeFileSync(f, 'edited meanwhile\n');
  assert.throws(() => applyPatch(patch, [0]), /changed since/);
});

test('fileWrites: parse, confine to folder, undo restores state', () => {
  const root = tmp();
  const journal = tmp();
  fs.writeFileSync(path.join(root, 'keep.txt'), 'original');
  const writes = parseFileBlocks('hi\n```file:keep.txt\nnew\n```\n```file:sub/new.txt\nfresh\n```');
  assert.equal(writes.length, 2);
  const id = applyWrites(root, writes, journal);
  assert.equal(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'new\n');
  assert.ok(fs.existsSync(path.join(root, 'sub/new.txt')));
  undo(id, journal);
  assert.equal(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(root, 'sub/new.txt')), false);
  assert.throws(() => applyWrites(root, [{ path: '../escape.txt', content: 'x' }], journal), /escapes/);
});

test('marketplace: installs a skill, enforces https and sha256', async () => {
  const body = '---\nname: mk\ndescription: from market\n---\nhi';
  const good = crypto.createHash('sha256').update(body).digest('hex');
  const fake = async () => ({ ok: true, text: async () => body });
  await market.installSkill({ name: 'mk', url: 'https://x/SKILL.md', sha256: good }, skills, fake);
  assert.equal(skills.listSkills().find((s) => s.name === 'mk').description, 'from market');
  await assert.rejects(market.installSkill({ name: 'mk2', url: 'https://x', sha256: 'bad' }, skills, fake), /mismatch/);
  await assert.rejects(market.installSkill({ name: 'mk3', url: 'http://x' }, skills, fake), /https/);
});

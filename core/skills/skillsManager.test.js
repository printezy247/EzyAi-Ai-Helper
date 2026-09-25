'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point HOME at a throwaway directory before requiring the module, since
// skillsManager resolves its store/state paths from os.homedir() at load time.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ezyai-test-'));
process.env.HOME = fakeHome;

const skills = require('./skillsManager');

test('create, list, sync, unsync, delete a skill', () => {
  skills.createSkill('demo-skill', '---\nname: demo-skill\ndescription: a demo\n---\nBody.');
  let list = skills.listSkills();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'demo-skill');
  assert.equal(list[0].description, 'a demo');
  assert.deepEqual(list[0].syncedTo, []);

  const targetId = skills.knownTargets()[0].id;
  skills.syncSkill('demo-skill', targetId);
  list = skills.listSkills();
  assert.deepEqual(list[0].syncedTo, [targetId]);

  const linkPath = path.join(skills.knownTargets()[0].dir, 'demo-skill');
  assert.ok(fs.lstatSync(linkPath).isSymbolicLink());

  skills.unsyncSkill('demo-skill', targetId);
  assert.equal(fs.existsSync(linkPath), false);

  skills.deleteSkill('demo-skill');
  assert.equal(skills.listSkills().length, 0);
});

test('import adopts an existing skill folder and leaves a symlink', () => {
  const target = skills.knownTargets()[0];
  const dir = path.join(target.dir, 'legacy-skill');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: legacy-skill\ndescription: old\n---\n');
  fs.writeFileSync(path.join(dir, 'extra.txt'), 'keep me');

  const found = skills.listUnmanaged().filter((s) => s.name === 'legacy-skill');
  assert.equal(found.length, 1);
  assert.equal(found[0].conflict, false);

  skills.importSkill('legacy-skill', target.id);
  assert.ok(fs.lstatSync(dir).isSymbolicLink());
  assert.equal(fs.readFileSync(path.join(dir, 'extra.txt'), 'utf8'), 'keep me'); // still reachable via the link
  assert.ok(fs.existsSync(path.join(skills.STORE_ROOT, 'legacy-skill', 'extra.txt')));
  const listed = skills.listSkills().find((s) => s.name === 'legacy-skill');
  assert.deepEqual(listed.syncedTo, [target.id]);
  assert.equal(skills.listUnmanaged().some((s) => s.name === 'legacy-skill'), false);
  assert.throws(() => skills.importSkill('legacy-skill', target.id), /already a symlink/);
});

test('import refuses to overwrite a skill already in the hub', () => {
  const target = skills.knownTargets()[1];
  skills.createSkill('dup-skill', '---\nname: dup-skill\ndescription: hub\n---\n');
  const dir = path.join(target.dir, 'dup-skill');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'other');
  assert.equal(skills.listUnmanaged().find((s) => s.name === 'dup-skill').conflict, true);
  assert.throws(() => skills.importSkill('dup-skill', target.id), /already has a skill/);
  assert.ok(fs.lstatSync(dir).isDirectory() && !fs.lstatSync(dir).isSymbolicLink()); // untouched
});

test('rejects invalid skill names', () => {
  assert.throws(() => skills.createSkill('Not Valid!', 'x'));
});

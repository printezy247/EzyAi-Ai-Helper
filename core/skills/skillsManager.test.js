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

test('rejects invalid skill names', () => {
  assert.throws(() => skills.createSkill('Not Valid!', 'x'));
});

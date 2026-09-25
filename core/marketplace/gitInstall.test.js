'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ezyai-gi-'));
const skills = require('../skills/skillsManager');
const gi = require('./gitInstall');

// A fake "clone" that lays out a repo with skills under skills/ and at the root of a subfolder.
async function fakeClone(_url, dest) {
  const mk = (rel, content) => {
    const p = path.join(dest, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  mk('skills/alpha/SKILL.md', '---\nname: alpha\ndescription: first\n---\nA');
  mk('skills/alpha/ref.md', 'reference');
  mk('beta/SKILL.md', '---\nname: beta\ndescription: second\n---\nB');
  mk('README.md', 'not a skill');
  mk('.git/config', 'ignored');
  fs.symlinkSync('/etc/passwd', path.join(dest, 'skills/alpha/link')); // must not be copied
}

test('parseRepoUrl accepts github https URLs only', () => {
  assert.equal(gi.parseRepoUrl('https://github.com/a/b').cloneUrl, 'https://github.com/a/b.git');
  assert.equal(gi.parseRepoUrl('https://github.com/a/b.git/').repo, 'b');
  for (const bad of ['http://github.com/a/b', 'https://evil.com/a/b', 'git@github.com:a/b.git', 'https://github.com/a/b; rm -rf /', '--upload-pack=x'])
    assert.throws(() => gi.parseRepoUrl(bad));
});

test('preview lists skills and files without installing', async () => {
  const list = await gi.preview('https://github.com/o/r', { clone: fakeClone });
  assert.deepEqual(list.map((s) => s.name).sort(), ['alpha', 'beta']);
  assert.ok(list.find((s) => s.name === 'alpha').files.includes('ref.md'));
  assert.equal(skills.listSkills().length, 0);
});

test('install copies chosen skills only, skips symlinks and existing names', async () => {
  const r = await gi.install('https://github.com/o/r', ['alpha'], skills, { clone: fakeClone });
  assert.deepEqual(r.installed, ['alpha']);
  assert.ok(fs.existsSync(path.join(skills.STORE_ROOT, 'alpha', 'ref.md')));
  assert.equal(fs.existsSync(path.join(skills.STORE_ROOT, 'alpha', 'link')), false);
  assert.equal(fs.existsSync(path.join(skills.STORE_ROOT, 'beta')), false);

  const again = await gi.install('https://github.com/o/r', ['alpha', 'beta'], skills, { clone: fakeClone });
  assert.deepEqual(again.installed, ['beta']);
  assert.equal(again.skipped[0].reason, 'already in the hub');
});

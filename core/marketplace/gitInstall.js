'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileP = promisify(execFile);

/**
 * Install skills from a GitHub repository. A skill is any folder that
 * contains a SKILL.md, found at the repo root, one level down, or under
 * skills/. Nothing in the repo is ever executed — files are only copied
 * into the hub store. Skills are instructions your AI tools will follow,
 * so preview() lets the caller show what is about to be installed and the
 * caller must pass the chosen names to install().
 */

const GH_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;
const SKIP = new Set(['.git', 'node_modules']);

function parseRepoUrl(url) {
  const m = GH_RE.exec(url.trim());
  if (!m) throw new Error('expected a URL like https://github.com/owner/repo');
  return { owner: m[1], repo: m[2], cloneUrl: `https://github.com/${m[1]}/${m[2]}.git` };
}

async function shallowClone(cloneUrl, dest) {
  await execFileP('git', ['clone', '--depth', '1', '--quiet', '--', cloneUrl, dest], {
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // never hang asking for credentials
  });
}

function findSkillDirs(root) {
  const found = [];
  const check = (dir) => {
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) found.push(dir);
  };
  check(root);
  for (const base of [root, path.join(root, 'skills')]) {
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP.has(e.name)) check(path.join(base, e.name));
    }
  }
  return [...new Set(found)];
}

function describe(dir, fallbackName) {
  const raw = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  const name = (raw.match(/^name:\s*(.+)$/m)?.[1] || path.basename(dir) || fallbackName).trim();
  const description = (raw.match(/^description:\s*(.+)$/m)?.[1] || '').trim();
  return { name, description };
}

/** Clone and list the skills a repo offers, without installing anything. */
async function preview(url, { clone = shallowClone } = {}) {
  const { repo, cloneUrl } = parseRepoUrl(url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ezyai-gh-'));
  try {
    await clone(cloneUrl, tmp);
    return findSkillDirs(tmp).map((dir) => {
      const d = describe(dir, repo);
      const files = [];
      const walk = (p) => {
        for (const e of fs.readdirSync(p, { withFileTypes: true })) {
          if (SKIP.has(e.name)) continue;
          e.isDirectory() ? walk(path.join(p, e.name)) : files.push(path.relative(dir, path.join(p, e.name)));
        }
      };
      walk(dir);
      return { ...d, dirName: dir === tmp ? repo : path.basename(dir), files };
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Install the named skills from a repo into the hub store. Skips existing names. */
async function install(url, names, skills, { clone = shallowClone } = {}) {
  const { repo, cloneUrl } = parseRepoUrl(url);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ezyai-gh-'));
  const installed = [];
  const skipped = [];
  try {
    await clone(cloneUrl, tmp);
    const wanted = new Set(names);
    for (const dir of findSkillDirs(tmp)) {
      const { name } = describe(dir, repo);
      const target = dir === tmp ? repo : path.basename(dir);
      if (!wanted.has(name) && !wanted.has(target)) continue;
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(target)) {
        skipped.push({ name: target, reason: 'folder name is not a valid skill name' });
        continue;
      }
      const dest = path.join(skills.STORE_ROOT, target);
      if (fs.existsSync(dest)) {
        skipped.push({ name: target, reason: 'already in the hub' });
        continue;
      }
      fs.mkdirSync(skills.STORE_ROOT, { recursive: true });
      fs.cpSync(dir, dest, {
        recursive: true,
        filter: (src) => !SKIP.has(path.basename(src)) && !fs.lstatSync(src).isSymbolicLink(),
      });
      installed.push(target);
    }
    return { installed, skipped };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { parseRepoUrl, preview, install, findSkillDirs };

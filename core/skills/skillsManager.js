'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { knownTargets } = require('./targets');

/**
 * Skills Hub — write an agent skill once in a central store, then sync it
 * into whichever AI coding assistants should see it, via symlinks. This is
 * the same idea as jiweiyeah/Skills-Manager's "write once, symlink
 * everywhere" model, reimplemented here on Node/fs rather than Tauri/Rust
 * so it runs with the toolchain actually available on this machine.
 *
 * Central store: ~/.ezyai/skills/<skill-name>/SKILL.md (+ any supporting files)
 * Sync state:    ~/.ezyai/skills.json  { "<skill-name>": ["claude-code", "codex", ...] }
 */

const STORE_ROOT = path.join(os.homedir(), '.ezyai', 'skills');
const STATE_FILE = path.join(os.homedir(), '.ezyai', 'skills.json');

function ensureStoreRoot() {
  fs.mkdirSync(STORE_ROOT, { recursive: true });
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

function readState() {
  ensureStoreRoot();
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function writeState(state) {
  ensureStoreRoot();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

function validName(name) {
  return typeof name === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(name);
}

function listSkills() {
  ensureStoreRoot();
  const state = readState();
  return fs
    .readdirSync(STORE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillMd = path.join(STORE_ROOT, entry.name, 'SKILL.md');
      let description = '';
      try {
        const raw = fs.readFileSync(skillMd, 'utf8');
        const match = raw.match(/^description:\s*(.+)$/m);
        if (match) description = match[1].trim();
      } catch {
        // no SKILL.md yet, or unreadable — leave description blank
      }
      return {
        name: entry.name,
        description,
        syncedTo: state[entry.name] || [],
      };
    });
}

function createSkill(name, content) {
  if (!validName(name)) {
    throw new Error(`invalid skill name "${name}" — use lowercase letters, digits, hyphens`);
  }
  ensureStoreRoot();
  const dir = path.join(STORE_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content);
  const state = readState();
  if (!state[name]) state[name] = [];
  writeState(state);
  return { name, dir };
}

function deleteSkill(name) {
  if (!validName(name)) throw new Error(`invalid skill name "${name}"`);
  const state = readState();
  for (const targetId of state[name] || []) {
    unsyncSkill(name, targetId);
  }
  delete state[name];
  writeState(state);
  fs.rmSync(path.join(STORE_ROOT, name), { recursive: true, force: true });
}

function targetById(targetId) {
  const target = knownTargets().find((t) => t.id === targetId);
  if (!target) throw new Error(`unknown sync target "${targetId}"`);
  return target;
}

/** Symlink the central skill directory into a target tool's skills dir. */
function syncSkill(name, targetId) {
  if (!validName(name)) throw new Error(`invalid skill name "${name}"`);
  const source = path.join(STORE_ROOT, name);
  if (!fs.existsSync(source)) throw new Error(`skill "${name}" does not exist`);
  const target = targetById(targetId);
  fs.mkdirSync(target.dir, { recursive: true });
  const linkPath = path.join(target.dir, name);

  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink() && fs.readlinkSync(linkPath) === source) {
      // already synced, nothing to do
    } else {
      throw new Error(
        `refusing to overwrite existing non-managed path at ${linkPath}; remove it manually first`
      );
    }
  } else {
    fs.symlinkSync(source, linkPath, 'dir');
  }

  const state = readState();
  state[name] = Array.from(new Set([...(state[name] || []), targetId]));
  writeState(state);
  return { name, targetId, linkPath };
}

function unsyncSkill(name, targetId) {
  const target = targetById(targetId);
  const linkPath = path.join(target.dir, name);
  if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(linkPath);
    } else {
      throw new Error(`refusing to remove non-symlink at ${linkPath}`);
    }
  }
  const state = readState();
  if (state[name]) {
    state[name] = state[name].filter((t) => t !== targetId);
    writeState(state);
  }
  return { name, targetId };
}

/**
 * Skills that already live in a target tool as real folders (not symlinks,
 * not managed by the hub) and could be imported.
 */
function listUnmanaged() {
  ensureStoreRoot();
  const found = [];
  for (const target of knownTargets()) {
    let entries;
    try {
      entries = fs.readdirSync(target.dir, { withFileTypes: true });
    } catch {
      continue; // target dir doesn't exist
    }
    for (const e of entries) {
      if (!e.isDirectory() || !validName(e.name)) continue; // isDirectory() is false for symlinks
      if (!fs.existsSync(path.join(target.dir, e.name, 'SKILL.md'))) continue;
      found.push({
        name: e.name,
        targetId: target.id,
        targetLabel: target.label,
        dir: path.join(target.dir, e.name),
        conflict: fs.existsSync(path.join(STORE_ROOT, e.name)),
      });
    }
  }
  return found;
}

/**
 * Adopt an existing skill folder: move it into the central store and leave a
 * symlink in its place, so the original tool keeps seeing it. Refuses to
 * overwrite anything already in the store.
 */
function importSkill(name, targetId) {
  if (!validName(name)) throw new Error(`invalid skill name "${name}"`);
  const target = targetById(targetId);
  const src = path.join(target.dir, name);
  const dest = path.join(STORE_ROOT, name);

  let stat;
  try {
    stat = fs.lstatSync(src);
  } catch {
    throw new Error(`no skill "${name}" found in ${target.dir}`);
  }
  if (stat.isSymbolicLink()) throw new Error(`"${name}" in ${target.label} is already a symlink; nothing to import`);
  if (!stat.isDirectory() || !fs.existsSync(path.join(src, 'SKILL.md'))) {
    throw new Error(`"${src}" is not a skill folder (no SKILL.md)`);
  }
  if (fs.existsSync(dest)) {
    throw new Error(`the hub already has a skill named "${name}"; rename one of them first`);
  }

  ensureStoreRoot();
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.cpSync(src, dest, { recursive: true }); // different filesystem: copy, then remove
    fs.rmSync(src, { recursive: true });
  }
  fs.symlinkSync(dest, src, 'dir');

  const state = readState();
  state[name] = Array.from(new Set([...(state[name] || []), targetId]));
  writeState(state);
  return { name, targetId, store: dest, link: src };
}

module.exports = {
  listUnmanaged,
  importSkill,
  STORE_ROOT,
  STATE_FILE,
  listSkills,
  createSkill,
  deleteSkill,
  syncSkill,
  unsyncSkill,
  knownTargets,
};

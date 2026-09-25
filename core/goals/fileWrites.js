'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/**
 * Phase 5 slice — goal-driven agents may write files, but only inside a
 * bound folder, and every write is journaled so it can be undone in one
 * step. Agents propose writes as fenced blocks:
 *
 *   ```file:relative/path.txt
 *   contents
 *   ```
 */

const defaultJournal = () => path.join(os.homedir(), '.ezyai', 'undo');

function parseFileBlocks(text) {
  const out = [];
  const re = /```file:([^\n]+)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) out.push({ path: m[1].trim(), content: m[2] });
  return out;
}

function resolveInside(root, rel) {
  const abs = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    throw new Error(`path escapes the bound folder: ${rel}`);
  }
  return abs;
}

/** Apply writes under root; returns a change-set id usable with undo(). */
function applyWrites(root, writes, journalDir = defaultJournal()) {
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const entries = writes.map((w) => {
    const abs = resolveInside(root, w.path);
    const existed = fs.existsSync(abs);
    return { abs, existed, before: existed ? fs.readFileSync(abs, 'utf8') : null, content: w.content };
  });
  fs.mkdirSync(journalDir, { recursive: true });
  fs.writeFileSync(path.join(journalDir, `${id}.json`), JSON.stringify(entries.map(({ abs, existed, before }) => ({ abs, existed, before }))));
  for (const e of entries) {
    fs.mkdirSync(path.dirname(e.abs), { recursive: true });
    fs.writeFileSync(e.abs, e.content);
  }
  return id;
}

function undo(id, journalDir = defaultJournal()) {
  const file = path.join(journalDir, `${id}.json`);
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const e of entries.reverse()) {
    if (e.existed) fs.writeFileSync(e.abs, e.before);
    else fs.rmSync(e.abs, { force: true });
  }
  fs.rmSync(file);
}

module.exports = { parseFileBlocks, applyWrites, undo };

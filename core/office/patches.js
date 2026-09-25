'use strict';

const fs = require('fs');
const crypto = require('crypto');

/**
 * Phase 2 slice — reviewable AI edits for text-based documents
 * (Markdown, HTML, plain text). An AI proposes new text; we turn it into
 * hunks against the file's current content. Nothing is written until the
 * user accepts hunks, untouched lines are preserved byte-for-byte, and a
 * patch refuses to apply if the file changed since it was proposed.
 * (Binary formats — docx/xlsx/pdf — need dedicated engines; see ROADMAP.)
 */

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const splitLines = (s) => s.match(/[^\n]*\n|[^\n]+$/g) || []; // keeps line endings

/** Line diff via LCS -> list of hunks {start, remove:[lines], add:[lines]} on the old text. */
function diffHunks(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const hunks = [];
  let i = 0;
  let j = 0;
  let cur = null;
  const flush = () => { if (cur) { hunks.push(cur); cur = null; } };
  while (i < n || j < m) {
    if (i < n && j < m && oldLines[i] === newLines[j]) { flush(); i++; j++; continue; }
    if (!cur) cur = { start: i, remove: [], add: [] };
    if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) cur.add.push(newLines[j++]);
    else cur.remove.push(oldLines[i++]);
  }
  flush();
  return hunks;
}

function proposeEdit(file, newText) {
  const oldText = fs.readFileSync(file, 'utf8');
  const hunks = diffHunks(splitLines(oldText), splitLines(newText)).map((h, index) => ({ index, ...h }));
  return { file, baseSha: sha(oldText), hunks };
}

/** Apply only the accepted hunk indexes. Returns the new text; writes the file. */
function applyPatch(patch, acceptedIndexes) {
  const oldText = fs.readFileSync(patch.file, 'utf8');
  if (sha(oldText) !== patch.baseSha) {
    throw new Error('file changed since the edit was proposed; re-propose the edit');
  }
  const accepted = new Set(acceptedIndexes);
  const oldLines = splitLines(oldText);
  const out = [];
  let pos = 0;
  for (const h of patch.hunks) {
    out.push(...oldLines.slice(pos, h.start));
    if (accepted.has(h.index)) out.push(...h.add);
    else out.push(...h.remove);
    pos = h.start + h.remove.length;
  }
  out.push(...oldLines.slice(pos));
  const next = out.join('');
  fs.writeFileSync(patch.file, next);
  return next;
}

module.exports = { proposeEdit, applyPatch };

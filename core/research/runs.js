'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/**
 * Phase 4 — run history with provenance. Every goal run is saved as
 * <base>/<id>/run.json. Each result is an "artifact" recording which task
 * and agent produced it, which upstream artifacts fed it, and a sha256 of
 * its content, so any output can be traced back to how it was made.
 */

const defaultBase = () => path.join(os.homedir(), '.ezyai', 'runs');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function saveRun({ goal, plan, results }, base = defaultBase()) {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const artifacts = plan.map((t) => ({
    taskId: t.id,
    agent: t.agent,
    task: t.task,
    inputs: t.dependsOn || [],
    sha256: sha256(results[t.id] ?? ''),
    content: results[t.id] ?? '',
  }));
  const run = { id, goal, createdAt: new Date().toISOString(), archived: false, artifacts };
  fs.mkdirSync(path.join(base, id), { recursive: true });
  fs.writeFileSync(path.join(base, id, 'run.json'), JSON.stringify(run, null, 2));
  return run;
}

function readRun(id, base = defaultBase()) {
  return JSON.parse(fs.readFileSync(path.join(base, id, 'run.json'), 'utf8'));
}

function listRuns({ query, includeArchived = false } = {}, base = defaultBase()) {
  if (!fs.existsSync(base)) return [];
  const q = query?.toLowerCase();
  return fs
    .readdirSync(base)
    .map((id) => {
      try { return readRun(id, base); } catch { return null; }
    })
    .filter(Boolean)
    .filter((r) => includeArchived || !r.archived)
    .filter((r) => !q || r.goal.toLowerCase().includes(q) || r.artifacts.some((a) => a.content.toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ id, goal, createdAt, archived }) => ({ id, goal, createdAt, archived }));
}

function setArchived(id, archived, base = defaultBase()) {
  const run = readRun(id, base);
  run.archived = archived;
  fs.writeFileSync(path.join(base, id, 'run.json'), JSON.stringify(run, null, 2));
}

/** Verify each artifact's content still matches its recorded hash. */
function verifyRun(id, base = defaultBase()) {
  return readRun(id, base).artifacts.map((a) => ({ taskId: a.taskId, ok: sha256(a.content) === a.sha256 }));
}

function exportMarkdown(id, base = defaultBase()) {
  const run = readRun(id, base);
  const parts = [`# ${run.goal}`, `_Run ${run.id}_`];
  for (const a of run.artifacts) {
    parts.push(
      `## ${a.taskId} (${a.agent})`,
      `Task: ${a.task}`,
      a.inputs.length ? `Inputs: ${a.inputs.join(', ')}` : 'Inputs: none',
      `sha256: \`${a.sha256}\``,
      '',
      a.content
    );
  }
  return parts.join('\n\n');
}

module.exports = { saveRun, readRun, listRuns, setArchived, verifyRun, exportMarkdown };

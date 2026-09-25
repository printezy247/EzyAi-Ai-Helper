'use strict';

let lastUndoId = null;
const undoBtn = document.getElementById('goal-undo');
const out = document.getElementById('goal-output');

async function refreshRuns() {
  const list = document.getElementById('runs-list');
  const runs = await window.ezyai.runs.list(document.getElementById('runs-query').value || undefined);
  list.innerHTML = '';
  runs.forEach((r) => {
    const li = document.createElement('li');
    li.textContent = `${r.createdAt.slice(0, 16)} — ${r.goal}`;
    li.style.cursor = 'pointer';
    li.addEventListener('click', async () => {
      out.textContent = await window.ezyai.runs.export(r.id);
    });
    list.appendChild(li);
  });
}

document.getElementById('runs-query').addEventListener('input', refreshRuns);

document.getElementById('goal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = (id) => document.getElementById(id).value.trim();
  out.textContent = 'planning and running…';
  try {
    const cfg = { kind: 'openai', model: v('goal-model'), baseUrl: v('goal-base') || undefined, apiKeyEnv: v('goal-keyenv') || undefined };
    const res = await window.ezyai.goals.run(v('goal-text'), cfg, v('goal-bind') || undefined);
    lastUndoId = res.undoId;
    undoBtn.disabled = !lastUndoId;
    out.textContent = await window.ezyai.runs.export(res.runId);
    refreshRuns();
  } catch (err) {
    out.textContent = `error: ${err.message}`;
  }
});

undoBtn.addEventListener('click', async () => {
  if (!lastUndoId) return;
  await window.ezyai.goals.undo(lastUndoId);
  out.textContent += '\n\n(file writes undone)';
  lastUndoId = null;
  undoBtn.disabled = true;
});

refreshRuns();

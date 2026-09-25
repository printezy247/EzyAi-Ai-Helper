'use strict';

let selectedSkill = null;

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

function showStatus(msg, isError) {
  const el = document.getElementById('skills-status');
  el.textContent = msg || '';
  el.style.color = isError ? '#ff7b7b' : '#7bd88f';
}

function errText(err) {
  // Electron wraps IPC errors as "Error invoking remote method '...': Error: <message>"
  return String(err && err.message ? err.message : err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

async function refreshSkills() {
  const [skills, targets] = await Promise.all([window.ezyai.skills.list(), window.ezyai.skills.targets()]);
  if (selectedSkill && !skills.some((s) => s.name === selectedSkill)) selectedSkill = null;

  const skillsList = document.getElementById('skills-list');
  skillsList.innerHTML = '';
  if (skills.length === 0) {
    skillsList.innerHTML = '<li class="hint">No skills yet — add one below.</li>';
  }
  skills.forEach((skill) => {
    const li = document.createElement('li');
    li.textContent = `${skill.name} — synced: ${skill.syncedTo.join(', ') || 'none'}`;
    li.style.cursor = 'pointer';
    if (skill.name === selectedSkill) li.style.background = '#232a36';
    li.addEventListener('click', () => {
      selectedSkill = skill.name;
      showStatus('');
      refreshSkills();
    });
    skillsList.appendChild(li);
  });

  renderTargets(targets, skills.find((s) => s.name === selectedSkill));
}

function renderTargets(targets, activeSkill) {
  const targetsList = document.getElementById('targets-list');
  targetsList.innerHTML = '';
  targets.forEach((target) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${target.label} (${target.dir})`;
    const toggle = document.createElement('button');
    const synced = activeSkill && activeSkill.syncedTo.includes(target.id);
    toggle.textContent = synced ? 'unsync' : 'sync';
    toggle.disabled = !activeSkill;
    toggle.addEventListener('click', async () => {
      if (!activeSkill) return;
      try {
        if (synced) {
          await window.ezyai.skills.unsync(activeSkill.name, target.id);
          showStatus(`Unsynced ${activeSkill.name} from ${target.label}`);
        } else {
          const r = await window.ezyai.skills.sync(activeSkill.name, target.id);
          showStatus(`Synced ${activeSkill.name} -> ${r.linkPath}`);
        }
      } catch (err) {
        showStatus(errText(err), true);
      }
      const keep = document.getElementById('skills-status').textContent;
      const color = document.getElementById('skills-status').style.color;
      await refreshSkills();
      showStatus(keep, color === 'rgb(255, 123, 123)');
    });
    li.appendChild(label);
    li.appendChild(toggle);
    targetsList.appendChild(li);
  });
}

document.getElementById('skill-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('skill-name').value.trim();
  const content = document.getElementById('skill-content').value;
  try {
    await window.ezyai.skills.create(name, content);
    selectedSkill = name; // select it so the sync buttons are live
    e.target.reset();
    await refreshSkills();
    showStatus(`Added ${name} — now click a sync button on the right`);
  } catch (err) {
    showStatus(errText(err), true);
  }
});

document.getElementById('ssh-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const host = document.getElementById('ssh-host').value.trim();
  const command = document.getElementById('ssh-command').value.trim();
  const confirm = document.getElementById('ssh-confirm').checked;
  const output = document.getElementById('ssh-output');
  output.textContent = 'running…';
  const result = await window.ezyai.ssh.run(host, command, { confirm });
  output.textContent = JSON.stringify(result, null, 2);
});

refreshSkills();

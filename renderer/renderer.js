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

async function refreshSkills() {
  const [skills, targets] = await Promise.all([window.ezyai.skills.list(), window.ezyai.skills.targets()]);

  const skillsList = document.getElementById('skills-list');
  skillsList.innerHTML = '';
  skills.forEach((skill) => {
    const li = document.createElement('li');
    li.textContent = `${skill.name} — synced: ${skill.syncedTo.join(', ') || 'none'}`;
    li.style.cursor = 'pointer';
    li.addEventListener('click', () => {
      selectedSkill = skill.name;
      renderTargets(targets, skill);
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
      if (synced) {
        await window.ezyai.skills.unsync(activeSkill.name, target.id);
      } else {
        await window.ezyai.skills.sync(activeSkill.name, target.id);
      }
      refreshSkills();
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
  await window.ezyai.skills.create(name, content);
  e.target.reset();
  refreshSkills();
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

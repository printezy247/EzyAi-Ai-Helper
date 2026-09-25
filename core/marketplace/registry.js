'use strict';

const crypto = require('crypto');

/**
 * Phase 6 slice — a skill marketplace. A registry is a JSON document:
 *   { "skills": [ { "name", "description", "url", "sha256"? } ] }
 * Installing downloads SKILL.md from the entry's https URL, verifies the
 * sha256 when the entry provides one, and adds it to the Skills Hub store.
 * Nothing is fetched or installed without an explicit call.
 */

async function fetchRegistry(url, fetchImpl = fetch) {
  if (!url.startsWith('https://')) throw new Error('registry URL must be https');
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.skills)) throw new Error('registry has no "skills" array');
  return data.skills;
}

async function installSkill(entry, skills, fetchImpl = fetch) {
  if (!entry.url?.startsWith('https://')) throw new Error('skill URL must be https');
  const res = await fetchImpl(entry.url);
  if (!res.ok) throw new Error(`skill download HTTP ${res.status}`);
  const content = await res.text();
  if (entry.sha256) {
    const actual = crypto.createHash('sha256').update(content).digest('hex');
    if (actual !== entry.sha256) throw new Error(`sha256 mismatch for ${entry.name}; refusing to install`);
  }
  return skills.createSkill(entry.name, content);
}

module.exports = { fetchRegistry, installSkill };

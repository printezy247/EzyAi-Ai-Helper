'use strict';

const os = require('os');
const path = require('path');

/**
 * Known AI coding assistants and the directory each one reads skill/agent
 * definitions from. This list is intentionally small and explicit — every
 * entry here is a real, documented convention for that tool, not a guess.
 * Add to this list rather than inventing paths.
 */
function knownTargets() {
  const home = os.homedir();
  return [
    { id: 'claude-code', label: 'Claude Code', dir: path.join(home, '.claude', 'skills') },
    { id: 'codex', label: 'Codex CLI', dir: path.join(home, '.codex', 'skills') },
    { id: 'cursor', label: 'Cursor', dir: path.join(home, '.cursor', 'skills') },
    { id: 'gemini-cli', label: 'Gemini CLI', dir: path.join(home, '.gemini', 'skills') },
  ];
}

module.exports = { knownTargets };

'use strict';

const { spawn } = require('child_process');

/**
 * SSH Ops — a thin, safety-conscious wrapper around the system `ssh`/`scp`
 * binaries, in the spirit of badseal/ssh-skill: structured JSON-shaped
 * results, host key verification left ON by default, a hard cap on how
 * much output is returned, and a timeout that reports "outcome_unknown"
 * rather than silently letting a caller assume failure and retry blind.
 *
 * This intentionally shells out to the system `ssh`/`scp` rather than
 * bundling a Paramiko-equivalent SSH implementation, so it needs the
 * `ssh`/`scp` binaries on PATH (OpenSSH client) and respects the user's
 * normal ~/.ssh/config and known_hosts.
 */

const OUTPUT_CAP_BYTES = 256 * 1024; // 256 KiB, same cap as ssh-skill
const DEFAULT_TIMEOUT_MS = 30_000;

// Command patterns that are refused unless the caller passes confirm: true.
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\b:\(\)\{.*\}:/, // fork bomb shape
  />\s*\/dev\/sd[a-z]/,
];

function capBuffer(chunks) {
  let total = 0;
  const kept = [];
  for (const chunk of chunks) {
    if (total >= OUTPUT_CAP_BYTES) break;
    const remaining = OUTPUT_CAP_BYTES - total;
    const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    kept.push(slice);
    total += slice.length;
  }
  const truncated = total >= OUTPUT_CAP_BYTES && chunks.reduce((n, c) => n + c.length, 0) > OUTPUT_CAP_BYTES;
  return { text: Buffer.concat(kept).toString('utf8'), truncated };
}

/**
 * Run a single command on a remote host over ssh.
 * @param {string} host - a Host alias from ~/.ssh/config, or user@host
 * @param {string} command - the remote command line to run
 * @param {{timeoutMs?: number, confirm?: boolean, allowStrictHostKeyOff?: boolean}} opts
 * @returns {Promise<{status: 'ok'|'error'|'timeout'|'refused', code: number|null, stdout: string, stderr: string, truncated: boolean}>}
 */
function runCommand(host, command, opts = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, confirm = false } = opts;

  if (!confirm) {
    const hit = DESTRUCTIVE_PATTERNS.find((re) => re.test(command));
    if (hit) {
      return Promise.resolve({
        status: 'refused',
        code: null,
        stdout: '',
        stderr: `command matched a destructive pattern (${hit}); re-run with confirm: true if this is intentional`,
        truncated: false,
      });
    }
  }

  const args = [
    '-o', 'BatchMode=yes', // never prompt for a password
    '-o', 'StrictHostKeyChecking=yes', // never silently trust a new host key
    '-o', `ConnectTimeout=${Math.max(1, Math.ceil(timeoutMs / 1000))}`,
    host,
    '--',
    command,
  ];

  return new Promise((resolve) => {
    const child = spawn('ssh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      const out = capBuffer(stdoutChunks);
      const err = capBuffer(stderrChunks);
      resolve({
        status: 'timeout',
        code: null,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
      });
    }, timeoutMs);

    child.stdout.on('data', (d) => stdoutChunks.push(d));
    child.stderr.on('data', (d) => stderrChunks.push(d));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: 'error', code: null, stdout: '', stderr: String(err), truncated: false });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = capBuffer(stdoutChunks);
      const err = capBuffer(stderrChunks);
      resolve({
        status: code === 0 ? 'ok' : 'error',
        code,
        stdout: out.text,
        stderr: err.text,
        truncated: out.truncated || err.truncated,
      });
    });
  });
}

/**
 * Copy a file to/from a remote host via scp.
 * @param {'upload'|'download'} direction
 */
function transferFile(host, localPath, remotePath, direction, opts = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const src = direction === 'upload' ? localPath : `${host}:${remotePath}`;
  const dst = direction === 'upload' ? `${host}:${remotePath}` : localPath;
  const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', src, dst];

  return new Promise((resolve) => {
    const child = spawn('scp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stderrChunks = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ status: 'timeout', code: null, stderr: capBuffer(stderrChunks).text });
    }, timeoutMs);

    child.stderr.on('data', (d) => stderrChunks.push(d));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: 'error', code: null, stderr: String(err) });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: code === 0 ? 'ok' : 'error', code, stderr: capBuffer(stderrChunks).text });
    });
  });
}

module.exports = { runCommand, transferFile, OUTPUT_CAP_BYTES, DEFAULT_TIMEOUT_MS };

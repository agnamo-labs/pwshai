// Control surface for scripts/tailshare.py — the writable WebDAV backend that
// `tailscale serve --bg <port>` publishes.
//
// Why a local server at all: `tailscale serve <dir>` is a read-only HTTP
// listing AND demands a local-admin token on Windows. `tailscale serve <port>`
// has neither problem, so the write path is a loopback WebDAV server plus a
// port proxy. Read/write comes from WebDAV; `serve` only carries it.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const DEFAULT_PORT = 8420;

function repoRoot() {
  return path.join(__dirname, '..');
}

function scriptPath() {
  return path.join(repoRoot(), 'scripts', 'tailshare.py');
}

/** The venv interpreter if it exists, else a system python. */
function resolvePython() {
  const candidates = IS_WIN
    ? [path.join(repoRoot(), '.venv', 'Scripts', 'python.exe')]
    : [path.join(repoRoot(), '.venv', 'bin', 'python3'), path.join(repoRoot(), '.venv', 'bin', 'python')];

  for (const c of candidates) if (fs.existsSync(c)) return { python: c, venv: true };

  for (const name of ['python3', 'python']) {
    const r = spawnSync(name, ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (!r.error && r.status === 0) return { python: name, venv: false };
  }
  return { python: null, venv: false };
}

/** wsgidav + cheroot must be importable by the chosen interpreter. */
function deps(python) {
  if (!python) return { ok: false, error: 'no python interpreter found' };
  const r = spawnSync(python, ['-c', 'import wsgidav, cheroot'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  return {
    ok: r.status === 0,
    error: r.status === 0 ? null : 'wsgidav/cheroot not installed',
    hint: r.status === 0 ? null : `"${python}" -m pip install wsgidav cheroot`
  };
}

function probe(port, timeoutMs = 600) {
  // Any HTTP answer means the socket is up; the status code is irrelevant here.
  const r = spawnSync('curl', ['-s', '-o', os.devNull, '-w', '%{http_code}', `--max-time`, String(timeoutMs / 1000), `http://127.0.0.1:${port}/`],
    { encoding: 'utf8', timeout: timeoutMs + 1500, windowsHide: true });
  return r.status === 0 && /\d{3}/.test(r.stdout || '');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Wait until the loopback port answers, or the budget runs out. */
function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (probe(port)) return { ok: true, waitedMs: Date.now() - start };
    sleep(400);
  }
  return { ok: false, waitedMs: Date.now() - start };
}

/** PID holding a listening port, so a stray server is identifiable. */
function pidOnPort(port) {
  if (IS_WIN) {
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    const line = (r.stdout || '')
      .split(/\r?\n/)
      .find((l) => l.includes(`:${port} `) && /LISTENING/i.test(l));
    if (!line) return null;
    const pid = line.trim().split(/\s+/).pop();
    return pid && /^\d+$/.test(pid) ? Number(pid) : null;
  }
  const r = spawnSync('sh', ['-c', `lsof -ti tcp:${port} 2>/dev/null || fuser ${port}/tcp 2>/dev/null`], { encoding: 'utf8', timeout: 10000 });
  const pid = (r.stdout || '').trim().split(/\s+/)[0];
  return pid && /^\d+$/.test(pid) ? Number(pid) : null;
}

/**
 * Start the WebDAV share. Roots are `{ label, path }`; every root is mounted at
 * /<label>/ so several drives can be published without colliding.
 */
function start(roots, options = {}) {
  const port = options.port || DEFAULT_PORT;
  const script = scriptPath();
  if (!fs.existsSync(script)) return { ok: false, error: `missing ${script}` };

  const { python, venv } = resolvePython();
  if (!python) return { ok: false, error: 'no python interpreter found', hint: 'install python 3' };

  const d = deps(python);
  if (!d.ok) return { ok: false, error: d.error, hint: d.hint, python };

  const existing = pidOnPort(port);
  if (existing) {
    return { ok: false, error: `port ${port} already in use`, pid: existing, alreadyRunning: true, port };
  }

  const args = [script, '--port', String(port)];
  if (options.readOnly) args.push('--read-only');
  for (const r of roots) args.push('--root', `${r.label}=${r.path}`);

  const logFile = options.logFile || path.join(os.tmpdir(), `tailshare-${port}.log`);
  const out = fs.openSync(logFile, 'a');

  const child = spawn(python, args, {
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true
  });
  child.unref();

  const ready = waitForPort(port, options.timeoutMs || 15000);
  return {
    ok: ready.ok,
    port,
    pid: child.pid,
    python,
    venv,
    readOnly: !!options.readOnly,
    roots,
    logFile,
    waitedMs: ready.waitedMs,
    error: ready.ok ? null : 'server did not answer on the loopback port in time',
    hint: ready.ok ? null : `read ${logFile}`
  };
}

function stop(port = DEFAULT_PORT) {
  const pid = pidOnPort(port);
  if (!pid) return { ok: true, port, stopped: false, note: 'nothing listening' };
  try {
    process.kill(pid);
    return { ok: true, port, stopped: true, pid };
  } catch (e) {
    return { ok: false, port, pid, error: e.code || e.message };
  }
}

function status(port = DEFAULT_PORT) {
  const pid = pidOnPort(port);
  return { port, running: !!pid, pid };
}

module.exports = {
  DEFAULT_PORT,
  scriptPath, resolvePython, deps,
  start, stop, status, pidOnPort, waitForPort, probe
};

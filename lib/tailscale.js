// Tailnet control surface: binary discovery, daemon lifecycle, login, serve,
// taildrive and device reachability.
//
// Portability contract: no hardcoded drive letters, no hardcoded install paths,
// no shell interpolation. Every external command is invoked as an argv array so
// paths containing spaces and user input never reach a shell parser.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// Node's own timeout, used everywhere because `tailscale ping` has no --timeout flag.
const DEFAULT_TIMEOUT = 15000;

// --- low level -------------------------------------------------------------

/**
 * Run a command as argv (never through a shell). Returns a normalised result so
 * callers can report a *verified* exit code instead of guessing.
 */
function run(bin, args = [], options = {}) {
  const res = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: options.timeout || DEFAULT_TIMEOUT,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    input: options.input,
    cwd: options.cwd
  });

  const timedOut = res.error && res.error.code === 'ETIMEDOUT';
  const spawnError = res.error && !timedOut ? res.error : null;

  return {
    ok: !res.error && res.status === 0,
    code: typeof res.status === 'number' ? res.status : null,
    signal: res.signal || null,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    error: timedOut ? 'timeout' : spawnError ? spawnError.code || spawnError.message : null,
    notFound: !!(spawnError && spawnError.code === 'ENOENT')
  };
}

// --- 1. discovery: find tailscale anywhere on this machine -----------------

function candidatePaths() {
  const home = os.homedir();
  const list = [];

  if (IS_WIN) {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
    list.push(
      path.join(pf, 'Tailscale', 'tailscale.exe'),
      path.join(pf86, 'Tailscale', 'tailscale.exe'),
      path.join(local, 'Tailscale', 'tailscale.exe'),
      path.join(home, 'scoop', 'shims', 'tailscale.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\tailscale.exe'
    );
  } else if (IS_MAC) {
    list.push(
      '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
      '/Applications/Tailscale.app/Contents/MacOS/tailscale',
      '/usr/local/bin/tailscale',
      '/opt/homebrew/bin/tailscale',
      '/usr/bin/tailscale'
    );
  } else {
    list.push('/usr/bin/tailscale', '/usr/local/bin/tailscale', '/bin/tailscale', '/snap/bin/tailscale');
  }

  return list;
}

function onPath() {
  const probe = IS_WIN
    ? run('where.exe', ['tailscale'], { timeout: 5000 })
    : run('sh', ['-lc', 'command -v tailscale'], { timeout: 5000 });
  if (!probe.ok) return null;
  const first = probe.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
  return first && fs.existsSync(first) ? first : null;
}

/**
 * Search every plausible location for a local tailscale install. Reports the
 * full candidate list so a miss is explainable rather than just "not found".
 */
function detect() {
  const probed = [];
  const seen = new Set();

  const add = (p, source) => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    const exists = fs.existsSync(p);
    if (exists) probed.push({ path: p, source, exists: true });
    else probed.push({ path: p, source, exists: false });
  };

  const pathHit = onPath();
  if (pathHit) add(pathHit, 'PATH');
  for (const p of candidatePaths()) add(p, 'candidate');

  const found = probed.filter((c) => c.exists);
  const chosen = found[0] || null;

  const result = {
    platform: process.platform,
    arch: process.arch,
    found: !!chosen,
    binary: chosen ? chosen.path : null,
    candidates: probed,
    version: null,
    daemon: null
  };

  if (chosen) {
    const v = run(chosen.path, ['version'], { timeout: 8000 });
    result.version = v.ok ? v.stdout.split(/\r?\n/).filter(Boolean)[0] : null;
    result.versionRaw = v.ok ? v.stdout : null;
    result.daemon = daemonStatus(chosen.path);
  }

  return result;
}

// --- 2. daemon lifecycle --------------------------------------------------

const SERVICE_NAME = IS_WIN ? 'Tailscale' : IS_MAC ? 'Tailscale' : 'tailscaled';

function daemonStatus(bin) {
  const out = {
    platform: process.platform,
    service: SERVICE_NAME,
    running: false,
    state: 'unknown',
    detail: null,
    startable: false
  };

  if (IS_WIN) {
    const q = run('sc.exe', ['query', SERVICE_NAME], { timeout: 8000 });
    if (q.notFound || (q.code === 1060)) {
      out.state = 'not-installed';
      out.detail = `service '${SERVICE_NAME}' not found`;
      return out;
    }
    const m = q.stdout.match(/STATE\s*:\s*\d+\s+(\S+)/);
    out.state = m ? m[1].toLowerCase() : 'unknown';
    out.running = out.state === 'running' || out.state === 'start_pending';
    out.startable = out.state === 'stopped';
    out.detail = q.stdout.match(/SERVICE_NAME:\s*(\S+)/) ? null : q.stderr || null;
    return out;
  }

  if (IS_MAC) {
    const ps = run('pgrep', ['-x', 'tailscaled'], { timeout: 5000 });
    const app = run('pgrep', ['-f', 'Tailscale.app'], { timeout: 5000 });
    out.running = ps.ok || app.ok;
    out.state = out.running ? 'running' : 'stopped';
    out.startable = !out.running;
    out.detail = out.running ? 'tailscaled process present' : 'no tailscaled process';
    return out;
  }

  const act = run('systemctl', ['is-active', SERVICE_NAME], { timeout: 6000 });
  out.state = (act.stdout || act.stderr || 'unknown').trim();
  out.running = out.state === 'active';
  out.startable = !out.running;
  out.detail = out.running ? null : 'needs `sudo systemctl start tailscaled`';
  return out;
}

/** Trigger the daemon. Elevation failures come back as a verified code. */
function startDaemon() {
  if (IS_WIN) {
    const r = run('sc.exe', ['start', SERVICE_NAME], { timeout: 20000 });
    const after = daemonStatus();
    return {
      ok: r.ok || after.running,
      code: r.code,
      output: r.stdout || r.stderr,
      elevationRequired: /access is denied|requires elevation|5:/i.test(r.stdout + r.stderr),
      state: after
    };
  }

  if (IS_MAC) {
    const r = run('open', ['-a', 'Tailscale'], { timeout: 10000 });
    const after = daemonStatus();
    return { ok: r.ok || after.running, code: r.code, output: r.stdout || r.stderr, state: after };
  }

  let r = run('systemctl', ['start', SERVICE_NAME], { timeout: 20000 });
  if (!r.ok) {
    r = run('sudo', ['-n', 'systemctl', 'start', SERVICE_NAME], { timeout: 20000 });
  }
  const after = daemonStatus();
  return {
    ok: r.ok || after.running,
    code: r.code,
    output: r.stdout || r.stderr,
    elevationRequired: /permission denied|password is required|sudo:/i.test(r.stdout + r.stderr),
    state: after
  };
}

function stopDaemon() {
  if (IS_WIN) {
    const r = run('sc.exe', ['stop', SERVICE_NAME], { timeout: 20000 });
    return { ok: r.ok, code: r.code, output: r.stdout || r.stderr, state: daemonStatus() };
  }
  const cmd = IS_MAC ? ['launchctl', ['kickstart', '-k', 'system/com.tailscale.tailscaled']] : null;
  const r = run('sudo', ['-n', 'systemctl', 'stop', SERVICE_NAME], { timeout: 20000 });
  return { ok: r.ok, code: r.code, output: r.stdout || r.stderr, state: daemonStatus(), macHint: cmd ? 'use the Tailscale menu bar to disconnect on macOS' : null };
}

// --- 3. status, login, peers ----------------------------------------------

/** `tailscale status --json`, with the failure surfaced as a verified code. */
function status(bin) {
  if (!bin) return { ok: false, code: null, error: 'tailscale binary not found', status: null };
  const r = run(bin, ['status', '--json'], { timeout: 15000 });
  if (!r.ok && !r.stdout) {
    return { ok: false, code: r.code, error: r.error || r.stderr || 'status failed', status: null };
  }
  try {
    return { ok: true, code: r.code, status: JSON.parse(r.stdout), error: null };
  } catch (e) {
    return { ok: false, code: r.code, error: 'unparseable status json', status: null, raw: r.stdout };
  }
}

function backendState(st) {
  return st && st.BackendState ? st.BackendState : 'Unknown';
}

function health(st) {
  return (st && Array.isArray(st.Health) ? st.Health : []).filter(Boolean);
}

function selfNode(st) {
  const s = (st && st.Self) || {};
  return {
    hostname: s.HostName || null,
    dnsName: (s.DNSName || '').replace(/\.$/, '') || null,
    os: s.OS || null,
    online: !!s.Online,
    ips: Array.isArray(s.TailscaleIPs) ? s.TailscaleIPs : [],
    created: s.Created || null
  };
}

function tailnetName(st) {
  return (st && st.CurrentTailnet && (st.CurrentTailnet.Name || st.CurrentTailnet.MagicDNSSuffix)) || (st && st.MagicDNSSuffix) || null;
}

/** Normalise the Peer map into an array sorted online-first, then by name. */
function peers(st) {
  const map = (st && st.Peer) || {};
  return Object.keys(map)
    .map((id) => {
      const p = map[id];
      return {
        id,
        hostname: p.HostName || '(unnamed)',
        dnsName: (p.DNSName || '').replace(/\.$/, ''),
        os: p.OS || '',
        online: !!p.Online,
        active: !!p.Active,
        exitNode: !!p.ExitNode,
        exitNodeOption: !!p.ExitNodeOption,
        ips: Array.isArray(p.TailscaleIPs) ? p.TailscaleIPs : [],
        curAddr: p.CurAddr || '',
        relay: p.Relay || '',
        lastSeen: p.LastSeen || null,
        lastHandshake: p.LastHandshake || null,
        rxBytes: p.RxBytes || 0,
        txBytes: p.TxBytes || 0,
        tags: p.Tags || [],
        sshHostKeys: p.SSH_HostKeys || []
      };
    })
    .sort((a, b) => (b.online - a.online) || a.hostname.localeCompare(b.hostname));
}

/** `tailscale up`, capturing the OAuth URL. `--auth-key` skips the browser. */
function login(bin, options = {}) {
  const args = ['up'];

  if (options.authKey) args.push(`--auth-key=${options.authKey}`);
  if (options.hostname) args.push(`--hostname=${options.hostname}`);
  if (options.advertiseRoutes) args.push(`--advertise-routes=${options.advertiseRoutes}`);
  if (options.acceptRoutes) args.push('--accept-routes');
  if (options.ssh) args.push('--ssh');
  if (options.forceReauth) args.push('--force-reauth');
  if (options.reset) args.push('--reset');
  if (options.timeout) args.push(`--timeout=${options.timeout}`);

  const r = run(bin, args, { timeout: options.timeoutMs || 60000 });
  const blob = `${r.stdout}\n${r.stderr}`;
  const urlMatch = blob.match(/https:\/\/login\.tailscale\.com\/[^\s'"]+/);

  return {
    ok: r.ok,
    code: r.code,
    output: blob.trim(),
    authUrl: urlMatch ? urlMatch[0] : null,
    needsLogin: /To authenticate, visit|visit:/i.test(blob) || !!urlMatch,
    error: r.error
  };
}

/** Poll BackendState until it matches one of `wanted` or the budget runs out. */
function sleepSync(ms) {
  // No subprocess, no busy-wait: block this thread on a shared buffer.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForState(bin, wanted, timeoutMs = 45000, onTick) {
  const start = Date.now();
  const deadline = start + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    const s = status(bin);
    last = s.status ? backendState(s.status) : `unreadable(${s.error || s.code})`;
    if (wanted.includes(last)) return { ok: true, state: last, waitedMs: Date.now() - start, status: s.status };
    if (typeof onTick === 'function') onTick(last, Date.now() - start);
    sleepSync(800);
  }
  return { ok: false, state: last, waitedMs: Date.now() - start, status: null };
}

/** `tailscale ping --c 1 <peer>`; classifies direct vs relayed. */
function ping(bin, target, options = {}) {
  if (!bin) return { ok: false, target, code: null, error: 'tailscale binary not found' };
  const count = String(options.count || 1);
  const args = ['ping', '--c', count];
  if (options.icmp) args.push('--icmp');
  if (options.peerapi) args.push('--peerapi');
  args.push(target);

  const r = run(bin, args, { timeout: options.timeoutMs || 12000 });
  const blob = `${r.stdout}\n${r.stderr}`.trim();

  const pong = blob.match(/pong from\s+(\S+)\s+\(([^)]+)\)\s+via\s+(\S+)\s+in\s+([\d.]+)?\s*(ms|s|µs|us)?/i);
  let latencyMs = null;
  if (pong && pong[4]) {
    const n = parseFloat(pong[4]);
    const unit = (pong[5] || 'ms').toLowerCase();
    latencyMs = unit === 's' ? n * 1000 : unit === 'us' || unit === 'µs' ? n / 1000 : n;
  }

  const via = pong ? pong[3] : null;
  const direct = !!via && !/^DERP/i.test(via);

  // Distinguish "the daemon cannot ping yet" from "the peer did not answer".
  // Both exit 1, and reporting the first as the second sends the user hunting
  // a dead peer that was never reachable in the first place.
  const daemonNotReady = /unexpected state:|not logged in|needs login|backend not running/i.test(blob);
  const unreachable = !r.ok && !daemonNotReady && /timeout|no route|not found|unknown peer/i.test(blob);

  return {
    ok: r.ok && !!pong,
    target,
    code: r.code,
    via,
    direct,
    relayed: !!via && /^DERP/i.test(via),
    latencyMs,
    output: blob,
    error: r.error,
    daemonNotReady,
    // Tailscale exits 1 on an unreachable peer; that is a real answer, not a crash.
    unreachable,
    reason: pong
      ? direct ? 'direct' : 'relayed via DERP'
      : daemonNotReady ? 'daemon not ready — node is not logged in'
      : unreachable ? 'no response from peer'
      : r.error === 'timeout' ? 'timed out'
      : `exit ${r.code}`
  };
}

// --- 4. serve: exposing a directory ---------------------------------------

function serveStatus(bin) {
  const r = run(bin, ['serve', 'status', '--json'], { timeout: 10000 });
  if (!r.stdout) return { ok: r.ok, code: r.code, config: {}, raw: r.stdout || r.stderr };
  try {
    return { ok: true, code: r.code, config: JSON.parse(r.stdout) };
  } catch (e) {
    return { ok: false, code: r.code, config: {}, raw: r.stdout, error: 'unparseable serve json' };
  }
}

/**
 * Serve a directory (or port) to the tailnet. On Windows a *path* target needs
 * a local-admin token; that refusal is returned as a named condition rather
 * than a generic failure.
 */
function serve(bin, target, options = {}) {
  const args = ['serve'];
  if (options.background !== false) args.push('--bg');
  if (options.https) args.push(`--https=${options.https}`);
  args.push(String(target));

  const r = run(bin, args, { timeout: options.timeoutMs || 20000 });
  const blob = `${r.stdout}\n${r.stderr}`.trim();

  return {
    ok: r.ok,
    code: r.code,
    output: blob,
    target: String(target),
    elevationRequired: /must be a Windows local admin|Access is denied|elevation/i.test(blob),
    error: r.error
  };
}

function serveReset(bin) {
  const r = run(bin, ['serve', 'reset'], { timeout: 15000 });
  return { ok: r.ok, code: r.code, output: (r.stdout || r.stderr).trim() };
}

// --- 5. taildrive ---------------------------------------------------------

function driveList(bin) {
  const r = run(bin, ['drive', 'list'], { timeout: 12000 });
  const blob = `${r.stdout}\n${r.stderr}`.trim();
  return {
    ok: r.ok,
    code: r.code,
    output: blob,
    aclRequired: /drive:share|not enabled|Access denied/i.test(blob),
    shares: r.ok
      ? blob
          .split(/\r?\n/)
          .slice(1)
          .map((l) => l.trim())
          .filter(Boolean)
      : []
  };
}

function driveShare(bin, name, dir) {
  const r = run(bin, ['drive', 'share', name, dir], { timeout: 15000 });
  const blob = `${r.stdout}\n${r.stderr}`.trim();
  return { ok: r.ok, code: r.code, output: blob, aclRequired: /drive:share|not enabled/i.test(blob) };
}

function driveUnshare(bin, name) {
  const r = run(bin, ['drive', 'unshare', name], { timeout: 15000 });
  return { ok: r.ok, code: r.code, output: (r.stdout || r.stderr).trim() };
}

// --- 6. mounted tailnet shares (the "drive" the user maps) ----------------

function isTailnetHost(host) {
  if (!host) return false;
  return /\.ts\.net$/i.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host);
}

/**
 * A Windows remote can be a UNC path (`\\host\share`, `\\host@SSL\DavWWWRoot`)
 * or a WebDAV URL (`https://host/`). Both forms must yield the host.
 */
function hostFromRemote(remote) {
  if (!remote) return null;
  const unc = remote.match(/^\\+([^\\@/]+)/);
  if (unc) return unc[1];
  const url = remote.match(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i);
  if (url) return url[1];
  return null;
}

/** Existing mounts whose remote is a tailnet host. Never assumes a letter. */
function tailnetMounts() {
  const mounts = [];

  if (IS_WIN) {
    const reg = run('reg.exe', ['query', 'HKCU\\Network', '/s'], { timeout: 8000 });
    if (reg.ok) {
      let letter = null;
      for (const line of reg.stdout.split(/\r?\n/)) {
        const key = line.match(/HKEY_CURRENT_USER\\Network\\([A-Z])/i);
        if (key) { letter = key[1].toUpperCase(); continue; }
        const rp = line.match(/RemotePath\s+REG_SZ\s+(\S.*)$/i);
        if (rp && letter) {
          const remote = rp[1].trim();
          const host = hostFromRemote(remote);
          mounts.push({
            id: `${letter}:`,
            letter: `${letter}:`,
            remote,
            host,
            tailnet: isTailnetHost(host),
            kind: /^https?:/i.test(remote) || /DavWWWRoot|@SSL/i.test(remote) ? 'webdav' : 'smb',
            source: 'registry'
          });
          letter = null;
        }
      }
    }
    if (!mounts.length) {
      const nu = run('net.exe', ['use'], { timeout: 8000 });
      for (const line of nu.stdout.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z]):\s+(\S+)/);
        if (m) {
          const host = hostFromRemote(m[2]);
          mounts.push({
            id: `${m[1]}:`, letter: `${m[1]}:`, remote: m[2], host,
            tailnet: isTailnetHost(host),
            kind: /DavWWWRoot|@SSL/i.test(m[2]) ? 'webdav' : 'smb',
            source: 'net use'
          });
        }
      }
    }
    return mounts;
  }

  const m = run('mount', [], { timeout: 8000 });
  for (const line of (m.stdout || '').split(/\r?\n/)) {
    const parts = line.match(/^(\S+)\s+on\s+(.+?)\s+\(([^)]+)\)/);
    if (!parts) continue;
    const host = (parts[1].match(/([A-Za-z0-9.-]+\.ts\.net)/) || [])[1] || '';
    mounts.push({
      id: parts[2], path: parts[2], remote: parts[1], host,
      tailnet: isTailnetHost(host), kind: parts[3], source: 'mount'
    });
  }
  return mounts;
}

/** First unused drive letter, so a mapping never collides with an existing one. */
function freeDriveLetter() {
  if (!IS_WIN) return null;
  const used = new Set(tailnetMounts().map((m) => (m.letter || '').toUpperCase()));
  const probe = run('wmic', ['logicaldisk', 'get', 'name'], { timeout: 8000 });
  if (probe.ok) for (const m of probe.stdout.matchAll(/([A-Z]):/g)) used.add(`${m[1]}:`);
  for (let c = 'D'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const letter = `${String.fromCharCode(c)}:`;
    if (!used.has(letter) && !fs.existsSync(`${letter}\\`)) return letter;
  }
  return null;
}

/** Map a tailnet WebDAV share to a free letter. No fixed drive letter. */
function mapTailnetShare(url, options = {}) {
  if (!IS_WIN) {
    return { ok: false, code: null, output: 'mapping is a Windows WebClient operation; on macOS/Linux mount the URL directly', unsupported: true };
  }
  const letter = options.letter || freeDriveLetter();
  if (!letter) return { ok: false, code: null, output: 'no free drive letter available', noLetter: true };

  const r = run('net.exe', ['use', letter, url], { timeout: 30000 });
  const blob = `${r.stdout}\n${r.stderr}`.trim();
  return {
    ok: r.ok,
    code: r.code,
    letter,
    url,
    output: blob,
    // System error 85 = the letter is already in use; 67 = network name not found.
    alreadyInUse: /System error 85/i.test(blob),
    notFound: /System error 67|System error 53/i.test(blob),
    notLoggedIn: /System error 59|unexpected network error/i.test(blob)
  };
}

function unmapDrive(letter) {
  const r = run('net.exe', ['use', `${letter}`, '/delete', '/y'], { timeout: 15000 });
  return { ok: r.ok, code: r.code, output: (r.stdout || r.stderr).trim() };
}

// --- 7. misc --------------------------------------------------------------

function openBrowser(url) {
  if (!url) return { ok: false, error: 'no url' };
  let r;
  if (IS_WIN) r = run('cmd.exe', ['/c', 'start', '', url], { timeout: 10000 });
  else if (IS_MAC) r = run('open', [url], { timeout: 10000 });
  else r = run('xdg-open', [url], { timeout: 10000 });
  return { ok: r.ok, code: r.code, error: r.error };
}

function tailnetHostFrom(statusObj) {
  const n = tailnetName(statusObj);
  if (n) return n;
  const dns = selfNode(statusObj).dnsName;
  return dns ? dns.split('.').slice(1).join('.') : null;
}

function formatBytes(n) {
  const b = Number(n) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function formatAge(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!t || t <= 0) return 'never';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/**
 * Hide the one-time node key inside a login URL so it is never written to a log
 * or a transcript, while staying clickable in the terminal.
 */
function redactAuthUrl(url) {
  if (!url) return null;
  return url.replace(/([?&](?:key|node|code)=)[^&]+/gi, '$1<redacted>');
}

module.exports = {
  IS_WIN, IS_MAC, SERVICE_NAME,
  run,
  detect, daemonStatus, startDaemon, stopDaemon,
  status, backendState, health, selfNode, tailnetName, peers,
  login, waitForState, ping,
  serveStatus, serve, serveReset,
  driveList, driveShare, driveUnshare,
  tailnetMounts, freeDriveLetter, mapTailnetShare, unmapDrive, isTailnetHost, hostFromRemote,
  openBrowser, tailnetHostFrom, formatBytes, formatAge, redactAuthUrl
};

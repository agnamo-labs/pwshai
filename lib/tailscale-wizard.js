// Interactive tailnet wizard and non-interactive subcommands.
//
// Flow: locate the local install -> trigger the daemon -> authenticate (OAuth or
// API key) -> choose directories to expose -> opt in/out of the tailnet drive
// mapping -> enumerate and ping devices -> final verified confirmation.
//
// Every step reports a real exit code. Nothing here claims success it did not
// observe.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ts = require('./tailscale');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[97m',
  bgBlack: '\x1b[48;2;0;0;0m'
};

const ok = (s) => `${C.green}${s}${C.reset}`;
const bad = (s) => `${C.red}${s}${C.reset}`;
const warn = (s) => `${C.yellow}${s}${C.reset}`;
const dim = (s) => `${C.dim}${s}${C.reset}`;
const cy = (s) => `${C.cyan}${s}${C.reset}`;

function banner(title) {
  console.log(`\n${C.bgBlack}${C.bold}${C.magenta}┌─── ${title} ───┐${C.reset}\n`);
}

function kv(key, value, width = 22) {
  console.log(`${C.bgBlack}  ${dim(key.padEnd(width))} ${value}${C.reset}`);
}

/** Fixed-width table so device state is readable at a glance. */
function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const line = (cells, colour) =>
    cells.map((c, i) => colour(String(c ?? '').padEnd(widths[i]))).join('  ');
  console.log('  ' + C.bold + line(headers, (s) => s) + C.reset);
  console.log('  ' + dim(widths.map((w) => '─'.repeat(w)).join('  ')));
  for (const r of rows) console.log('  ' + line(r, (s) => s));
}

function makePrompts() {
  const prompts = require('prompts');
  const onCancel = () => {
    console.log(`\n${warn('[!] Cancelled.')}\n`);
    process.exit(0);
  };
  return { prompts, onCancel };
}

// --- step 1: locate --------------------------------------------------------

function stepLocate() {
  banner('STEP 1 · LOCATE TAILSCALE ON THIS MACHINE');
  const d = ts.detect();

  kv('platform', `${d.platform} ${d.arch}`);
  kv('binary', d.binary ? ok(d.binary) : bad('not found'));
  kv('version', d.version || dim('unknown'));

  const existing = d.candidates.filter((c) => c.exists);
  const missing = d.candidates.filter((c) => !c.exists);
  kv('probed', `${d.candidates.length} locations · ${existing.length} present`);
  for (const c of existing) console.log(`      ${ok('[*]')} ${c.path} ${dim('(' + c.source + ')')}`);
  if (!d.found) {
    console.log();
    for (const c of missing) console.log(`      ${bad('[ ]')} ${dim(c.path)}`);
    console.log(`\n${bad('[!]')} Tailscale is not installed on this machine.`);
    console.log(`    Install it, then re-run: ${cy('pwshai tailscale')}\n`);
  } else if (d.daemon) {
    kv('service', `${d.daemon.service} → ${d.daemon.running ? ok(d.daemon.state) : warn(d.daemon.state)}`);
  }
  console.log();
  return d;
}

// --- step 2: trigger -------------------------------------------------------

async function stepTrigger(d) {
  if (!d.found) return { skipped: true };
  if (d.daemon && d.daemon.running) {
    kv('daemon', ok('already running') + dim(' — nothing to trigger'));
    console.log();
    return { ok: true, already: true, state: d.daemon };
  }

  const { prompts, onCancel } = makePrompts();
  const res = await prompts({
    type: 'confirm',
    name: 'go',
    message: `Tailscale daemon (${d.daemon ? d.daemon.service : 'tailscaled'}) is not running. Start it?`,
    initial: true,
    onCancel
  });
  if (!res.go) {
    console.log(`${dim('[-] Skipped. The daemon must be running to continue.')}\n`);
    return { ok: false, skipped: true };
  }

  console.log(`${cy('[>]')} starting ${d.daemon ? d.daemon.service : 'tailscaled'}...`);
  const started = ts.startDaemon();
  kv('exit code', String(started.code));
  kv('state', started.state.running ? ok(started.state.state) : bad(started.state.state));
  if (!started.ok) {
    console.log(`  ${bad('[!]')} ${started.output.split('\n')[0]}`);
    if (started.elevationRequired) {
      console.log(`  ${warn('[i]')} This needs an elevated shell. Re-run from an Administrator terminal.`);
    }
  }
  console.log();
  return started;
}

// --- step 3: authenticate --------------------------------------------------

/**
 * `tailscale up` blocks until login completes, so drive it as a child process:
 * surface the OAuth URL the moment it appears, open the browser, then poll for
 * the backend to actually reach Running.
 */
function loginInteractive(binary, options = {}) {
  return new Promise((resolve) => {
    const args = ['up'];
    if (options.hostname) args.push(`--hostname=${options.hostname}`);
    if (options.ssh) args.push('--ssh');
    if (options.acceptRoutes) args.push('--accept-routes');

    const child = spawn(binary, args, { windowsHide: true });
    let out = '';
    let opened = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      try { child.kill(); } catch (e) {}
      resolve(result);
    };

    const onChunk = (buf) => {
      out += buf.toString();
      const m = out.match(/https:\/\/login\.tailscale\.com\/[^\s'"]+/);
      if (m && !opened && options.onUrl) {
        opened = true;
        options.onUrl(m[0]);
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('error', (e) => finish({ ok: false, code: null, error: e.code || e.message, output: out }));

    const started = Date.now();
    const budget = options.timeoutMs || 120000;

    const poll = setInterval(() => {
      const s = ts.status(binary);
      const state = ts.backendState(s.status);
      if (options.onState) options.onState(state, Date.now() - started);

      if (state === 'Running') return finish({ ok: true, code: 0, state, output: out });

      // status --json also carries the URL in some builds
      if (s.status && s.status.AuthURL && !opened && options.onUrl) {
        opened = true;
        options.onUrl(s.status.AuthURL);
      }
      if (Date.now() - started > budget) {
        return finish({ ok: false, code: null, state, output: out, error: 'login timed out' });
      }
    }, 1200);

    child.on('close', (code) => {
      const s = ts.status(binary);
      const state = ts.backendState(s.status);
      finish({ ok: code === 0 && state === 'Running', code, state, output: out });
    });
  });
}

async function stepAuth(binary) {
  banner('STEP 3 · AUTHENTICATE');

  const before = ts.status(binary);
  const state = ts.backendState(before.status);
  kv('backend state', state === 'Running' ? ok(state) : warn(state));
  if (state === 'Running') {
    const self = ts.selfNode(before.status);
    kv('node', `${self.hostname} ${self.ips.length ? cy(self.ips[0]) : ''}`);
    console.log(`  ${ok('[=]')} already connected — skipping login.\n`);
    return { ok: true, already: true };
  }
  for (const h of ts.health(before.status)) console.log(`  ${warn('[i]')} ${dim(h)}`);
  console.log();

  const { prompts, onCancel } = makePrompts();
  const choice = await prompts({
    type: 'select',
    name: 'mode',
    message: 'How do you want to authenticate?',
    choices: [
      { title: 'Open OAuth in browser', value: 'oauth', description: 'tailscale up, then open the login URL it prints' },
      { title: 'Paste an API key', value: 'key', description: 'auth key (tskey-auth-...), never written to disk' },
      { title: 'Skip authentication', value: 'skip', description: 'leave the node logged out' }
    ],
    onCancel
  });

  if (choice.mode === 'skip' || !choice.mode) {
    console.log(`${dim('[-] Skipped authentication.')}\n`);
    return { ok: false, skipped: true, state };
  }

  if (choice.mode === 'key') {
    const keyRes = await prompts({
      type: 'password',
      name: 'key',
      message: 'Paste the auth key (input is hidden):',
      onCancel
    });
    if (!keyRes.key) return { ok: false, skipped: true, state };

    console.log(`\n${cy('[>]')} tailscale up --auth-key=<hidden> ...`);
    const r = ts.login(binary, { authKey: keyRes.key.trim(), timeoutMs: 60000 });
    kv('exit code', String(r.code));
    if (!r.ok) {
      // The key itself must never be echoed, even on failure.
      const safe = r.output.replace(/tskey-[A-Za-z0-9-]+/g, 'tskey-<redacted>');
      console.log(`  ${bad('[!]')} ${safe.split('\n')[0] || 'login failed'}`);
    }
    const waited = r.ok ? ts.waitForState(binary, ['Running'], 30000) : { ok: false, state: 'not-attempted' };
    kv('backend state', waited.ok ? ok(waited.state) : bad(waited.state));
    console.log();
    return { ok: waited.ok, code: r.code, state: waited.state };
  }

  // OAuth
  const hostRes = await prompts({
    type: 'text',
    name: 'hostname',
    message: 'Hostname to advertise on the tailnet:',
    initial: os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    onCancel
  });

  console.log(`\n${cy('[>]')} tailscale up ...`);
  let urlShown = null;
  const res = await loginInteractive(binary, {
    hostname: hostRes.hostname || undefined,
    timeoutMs: 180000,
    onUrl: (url) => {
      urlShown = url;
      console.log(`\n  ${C.bold}Open this URL to authorise this machine:${C.reset}`);
      console.log(`  ${cy(url)}`);
      const opened = ts.openBrowser(url);
      console.log(`  ${opened.ok ? ok('[*] browser opened') : warn('[i] could not open a browser — open the URL manually')}\n`);
    },
    onState: (s, ms) => process.stdout.write(`\r  ${dim(`waiting… state=${s} (${Math.round(ms / 1000)}s)`)}   `)
  });

  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  kv('exit code', String(res.code));
  kv('backend state', res.state === 'Running' ? ok(res.state) : bad(res.state || 'unknown'));
  if (!urlShown) console.log(`  ${warn('[i]')} no login URL was emitted — the node may already hold a key.`);
  if (!res.ok) console.log(`  ${bad('[!]')} ${res.error || 'login did not complete'}`);
  console.log();
  return res;
}

// --- step 4: expose directories -------------------------------------------

function candidateDirs(statusObj) {
  const home = os.homedir();
  const seen = new Set();
  const out = [];
  const add = (label, p, note) => {
    if (!p) return;
    const norm = path.resolve(p);
    if (seen.has(norm) || !fs.existsSync(norm)) return;
    seen.add(norm);
    out.push({ label, path: norm, note });
  };

  add('current directory', process.cwd(), 'where you ran pwshai');
  add('home', home, 'whole user profile');
  add('Documents', path.join(home, 'Documents'));
  add('Desktop', path.join(home, 'Desktop'));
  add('Downloads', path.join(home, 'Downloads'));
  add('PowerShell profile', path.join(home, 'Documents', 'PowerShell'), 'slash commands');

  for (const m of ts.tailnetMounts()) {
    const root = m.letter ? `${m.letter}\\` : m.path;
    if (root && fs.existsSync(root)) add(`mounted share ${m.id}`, root, m.host || m.remote);
  }
  return out;
}

async function stepExpose(binary) {
  banner('STEP 4 · CHOOSE DIRECTORIES TO EXPOSE');

  const { prompts: pMode, onCancel: ocMode } = makePrompts();
  const mode = await pMode({
    type: 'select',
    name: 'mode',
    message: 'How should these directories be shared?',
    choices: [
      { title: 'Read + write', value: 'rw', description: 'WebDAV on a loopback port — map it as a drive and edit files from any tailnet device' },
      { title: 'Read only', value: 'ro', description: 'plain tailscale serve <dir> listing — no writes, and needs admin on Windows' }
    ],
    onCancel: ocMode
  });
  if (!mode.mode) return { ok: false, exposed: [] };
  if (mode.mode === 'rw') return await stepExposeWritable(binary);

  const serve = ts.serveStatus(binary);
  const current = Object.keys(serve.config || {});
  kv('serve config', current.length ? cy(current.join(', ')) : dim('none'));

  const dirs = candidateDirs();
  if (!dirs.length) {
    console.log(`  ${bad('[!]')} no candidate directories found.\n`);
    return { ok: false, exposed: [] };
  }

  const { prompts, onCancel } = makePrompts();
  const sel = await prompts({
    type: 'multiselect',
    name: 'dirs',
    message: 'Select directories to serve to your tailnet (space toggles, enter confirms)',
    choices: dirs.map((d) => ({ title: d.label, value: d.path, description: `${d.path}${d.note ? ' · ' + d.note : ''}`, selected: false })),
    instructions: false,
    min: 0,
    onCancel
  });

  const picked = sel.dirs || [];
  if (!picked.length) {
    console.log(`${dim('[-] No directories selected.')}\n`);
    return { ok: false, exposed: [] };
  }

  const custom = await prompts({
    type: 'text',
    name: 'extra',
    message: 'Add another absolute path (blank to skip):',
    initial: '',
    onCancel
  });
  if (custom.extra && custom.extra.trim()) {
    const p = path.resolve(custom.extra.trim());
    if (fs.existsSync(p)) picked.push(p);
    else console.log(`  ${bad('[!]')} ${p} does not exist — skipped.`);
  }

  const results = [];
  for (const dir of picked) {
    console.log(`\n${cy('[>]')} tailscale serve --bg ${dir}`);
    const r = ts.serve(binary, dir, { background: true });
    kv('exit code', String(r.code));
    if (r.ok) {
      kv('result', ok('served'));
      console.log(`      ${dim(r.output.split('\n')[0] || '')}`);
    } else {
      kv('result', bad('failed'));
      console.log(`      ${r.output.split('\n')[0] || '(no output)'}`);
      if (r.elevationRequired) {
        console.log(`      ${warn('[i]')} serving a directory on Windows requires a local-admin shell.`);
      }
    }
    results.push({ dir, ...r });
  }

  console.log();
  return { ok: results.every((r) => r.ok), exposed: results };
}

// --- step 4b: read/write share (WebDAV + serve <port>) --------------------

/**
 * The read/write path. `serve <dir>` cannot accept writes and needs admin on
 * Windows; `serve <port>` does neither. So the writable share is a loopback
 * WebDAV server published through a port proxy — WebDAV carries the writes,
 * `serve` only carries the traffic.
 */
async function stepExposeWritable(binary) {
  const share = require('./tailshare');

  const py = share.resolvePython();
  const dep = share.deps(py.python);
  kv('webdav backend', dep.ok ? ok(`wsgidav ready (${py.venv ? 'venv' : 'system python'})`) : bad(dep.error));
  if (!dep.ok) {
    console.log(`  ${warn('[i]')} install it: ${cy(dep.hint)}`);
    console.log(`  ${dim('or run: pwshai tailscale expose --install')}\n`);
    return { ok: false, exposed: [] };
  }

  const dirs = candidateDirs();
  if (!dirs.length) {
    console.log(`  ${bad('[!]')} no candidate directories found.\n`);
    return { ok: false, exposed: [] };
  }

  const { prompts, onCancel } = makePrompts();
  const sel = await prompts({
    type: 'multiselect',
    name: 'roots',
    message: 'Select roots to publish (read + write). Space toggles, enter confirms.',
    choices: dirs.map((d) => ({ title: d.label, value: d.path, description: d.path, selected: false })),
    instructions: false,
    min: 1,
    onCancel
  });

  const picked = sel.roots || [];
  if (!picked.length) {
    console.log(`${dim('[-] No roots selected.')}\n`);
    return { ok: false, exposed: [] };
  }

  // Labels become the URL path segment, so they must be unique and url-safe.
  const roots = [];
  const used = new Set();
  for (const p of picked) {
    let label = path.basename(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root';
    if (/^[A-Za-z]:[\\/]?$/.test(p)) label = p[0].toLowerCase();
    let n = label;
    let i = 2;
    while (used.has(n)) n = `${label}-${i++}`;
    used.add(n);
    roots.push({ label: n, path: p });
  }

  const portRes = await prompts({
    type: 'number',
    name: 'port',
    message: 'Loopback port for the WebDAV backend:',
    initial: share.DEFAULT_PORT,
    onCancel
  });
  const port = portRes.port || share.DEFAULT_PORT;

  console.log(`\n${cy('[>]')} starting tailshare on 127.0.0.1:${port} ...`);
  const started = share.start(roots, { port, readOnly: false });
  kv('backend', started.ok ? ok('listening') : bad(started.error || 'failed'));
  if (!started.ok) {
    if (started.alreadyRunning) console.log(`      ${warn('[i]')} already running (pid ${started.pid}) — reusing is not assumed, stopping is safer`);
    if (started.hint) console.log(`      ${dim(started.hint)}`);
    return { ok: false, exposed: [] };
  }
  for (const r of roots) console.log(`      ${cy('/' + r.label + '/')}  ->  ${r.path}`);

  console.log(`\n${cy('[>]')} tailscale serve --bg ${port} ...`);
  const served = ts.serve(binary, String(port), { background: true });
  kv('serve <port>', served.ok ? ok('published to tailnet') : bad('failed'));
  if (!served.ok) {
    console.log(`      ${dim(served.output.split('\n')[0] || '')}`);
    if (served.elevationRequired) console.log(`      ${warn('[i]')} needs a local-admin shell on Windows`);
    console.log(`      ${warn('[i]')} the local backend is still running on 127.0.0.1:${port}; stop it with: pwshai tailscale expose --stop`);
    return { ok: false, exposed: roots, backend: started };
  }

  const st = ts.status(binary).status;
  const host = ts.tailnetHostFrom(st);
  const self = ts.selfNode(st);
  const url = host && self.hostname ? `https://${self.hostname.toLowerCase()}.${host}/` : null;

  if (url) {
    kv('tailnet url', cy(url));
    console.log(`\n  ${C.bold}Map it from another tailnet device:${C.reset}`);
    console.log(`    Windows  ${cy('net use * ' + url)}`);
    console.log(`    macOS    ${cy('Finder → Go → Connect to Server → ' + url)}`);
    console.log(`    Linux    ${cy('mount -t davfs ' + url + ' /mnt/point')}`);
    console.log(`  ${dim('Access is tailnet membership — there is no second login.')}`);
    console.log(`  ${dim('Windows WebDAV caps single-file transfers near 50MB (registry FileSizeLimitInBytes).')}`);
  } else {
    console.log(`  ${warn('[i]')} connected to the tailnet? the URL cannot be derived until the node has an identity.`);
  }
  console.log();
  return { ok: true, exposed: roots, backend: started, url, readWrite: true };
}

// --- step 5: tailnet drive mapping (opt in / out) -------------------------

async function stepDrive(binary) {
  banner('STEP 5 · TAILNET DRIVE (OPT IN / OUT)');

  const mounts = ts.tailnetMounts();
  if (mounts.length) {
    table(['mount', 'kind', 'host', 'remote'], mounts.map((m) => [m.id, m.kind, m.host || '—', m.remote]));
  } else {
    console.log(`  ${dim('no tailnet mount is currently mapped')}`);
  }

  const drive = ts.driveList(binary);
  if (drive.aclRequired) {
    console.log(`\n  ${warn('[i]')} Taildrive shares are disabled by tailnet policy:`);
    console.log(`      ${dim(drive.output.split('\n')[0])}`);
  }
  console.log();

  const tailnetHost = ts.tailnetHostFrom(ts.status(binary).status);
  const { prompts, onCancel } = makePrompts();
  const choice = await prompts({
    type: 'select',
    name: 'act',
    message: 'Tailnet drive:',
    choices: [
      ...(mounts.length
        ? [{ title: 'Unmount the tailnet drive', value: 'unmount', description: `release ${mounts.map((m) => m.id).join(', ')}` }]
        : []),
      {
        title: 'Mount the tailnet share to a free drive letter',
        value: 'mount',
        description: tailnetHost ? `https://${tailnetHost}/` : 'needs a connected tailnet to know the host'
      },
      { title: 'Leave the drive alone', value: 'skip', description: 'no change' }
    ],
    onCancel
  });

  if (choice.act === 'skip' || !choice.act) {
    console.log(`${dim('[-] Drive unchanged.')}\n`);
    return { ok: true, changed: false };
  }

  if (choice.act === 'unmount') {
    for (const m of mounts) {
      if (!m.letter) continue;
      console.log(`${cy('[>]')} net use ${m.letter} /delete`);
      const r = ts.unmapDrive(m.letter);
      kv('exit code', String(r.code));
      kv('result', r.ok ? ok('unmounted') : bad(r.output.split('\n')[0] || 'failed'));
    }
    console.log();
    return { ok: true, changed: true };
  }

  if (!tailnetHost) {
    console.log(`  ${bad('[!]')} Cannot determine the tailnet host — connect first (step 3).\n`);
    return { ok: false };
  }
  if (!ts.IS_WIN) {
    console.log(`  ${warn('[i]')} Mapping a drive letter is Windows-only. On this platform mount directly:`);
    console.log(`      ${cy(`mount -t davfs https://${tailnetHost}/ /mnt/point`)}  ${dim('(or Finder → Connect to Server)')}\n`);
    return { ok: false, unsupported: true };
  }

  const letter = ts.freeDriveLetter();
  if (!letter) {
    console.log(`  ${bad('[!]')} No free drive letter available.\n`);
    return { ok: false };
  }

  const url = `https://${tailnetHost}/`;
  console.log(`${cy('[>]')} net use ${letter} ${url}`);
  const mapped = ts.mapTailnetShare(url, { letter });
  kv('exit code', String(mapped.code));
  if (mapped.ok) {
    kv('mapped', ok(`${letter} → ${url}`));
  } else {
    kv('result', bad(mapped.output.split('\n')[0] || 'failed'));
    if (mapped.notLoggedIn) console.log(`      ${warn('[i]')} the node is not connected to the tailnet yet.`);
    if (mapped.notFound) console.log(`      ${warn('[i]')} the host does not answer — is the peer online and serving?`);
  }
  console.log();
  return { ok: mapped.ok, letter, url };
}

// --- step 6: devices -------------------------------------------------------

function pingAll(binary, peerList, options = {}) {
  const online = peerList.filter((p) => p.online);
  const results = [];

  for (const peer of peerList) {
    if (!peer.online) {
      results.push({ peer, ok: false, state: 'offline', reason: `last seen ${ts.formatAge(peer.lastSeen)}` });
      continue;
    }
    if (options.skipOfflineOnly === false && online.length > (options.max || 25)) {
      results.push({ peer, ok: null, state: 'skipped', reason: 'over ping budget' });
      continue;
    }
    const target = peer.ips[0] || peer.dnsName || peer.hostname;
    const r = ts.ping(binary, target, { count: 1, timeoutMs: options.timeoutMs || 12000 });
    results.push({
      peer,
      ok: r.ok,
      state: r.ok ? (r.direct ? 'direct' : 'relayed') : r.daemonNotReady ? 'no-daemon' : r.unreachable ? 'unreachable' : 'error',
      latencyMs: r.latencyMs,
      via: r.via,
      reason: r.reason,
      code: r.code
    });
  }
  return results;
}

async function stepDevices(binary) {
  banner('STEP 6 · DEVICES ON THIS TAILNET');

  const s = ts.status(binary);
  if (!s.status) {
    console.log(`  ${bad('[!]')} cannot read status: ${s.error || s.code}\n`);
    return { ok: false, results: [] };
  }

  const state = ts.backendState(s.status);
  kv('backend state', state === 'Running' ? ok(state) : warn(state));
  kv('tailnet', ts.tailnetName(s.status) || dim('—'));

  const self = ts.selfNode(s.status);
  kv('this node', `${self.hostname}${self.ips.length ? ' · ' + cy(self.ips.join(', ')) : ''}`);

  const peerList = ts.peers(s.status);
  kv('peers', String(peerList.length));
  console.log();

  if (!peerList.length) {
    if (state !== 'Running') {
      console.log(`  ${warn('[!]')} No peers are visible because this node is not connected (${state}).`);
      console.log(`      ${dim('Authenticate in step 3, then re-run: pwshai tailscale status')}\n`);
    } else {
      console.log(`  ${dim('This tailnet has no other devices.')}\n`);
    }
    return { ok: state === 'Running', results: [] };
  }

  const { prompts, onCancel } = makePrompts();
  const res = await prompts({
    type: 'confirm',
    name: 'ping',
    message: `Ping all ${peerList.filter((p) => p.online).length} online device(s) to verify reachability?`,
    initial: true,
    onCancel
  });

  let results;
  if (res.ping) {
    console.log();
    results = pingAll(binary, peerList, { max: 25 });
  } else {
    results = peerList.map((p) => ({ peer: p, ok: null, state: 'not pinged', reason: '—' }));
  }

  console.log();
  table(
    ['device', 'os', 'state', 'ip', 'route', 'latency'],
    results.map((r) => [
      r.peer.hostname,
      r.peer.os,
      r.ok === true ? ok(r.state) : r.ok === false ? bad(r.state) : dim(r.state),
      r.peer.ips[0] || '—',
      r.via || r.reason || '—',
      r.latencyMs != null ? `${r.latencyMs.toFixed(1)}ms` : '—'
    ])
  );
  console.log();

  return { ok: results.some((r) => r.ok), results, peerList, state };
}

// --- step 7: confirm -------------------------------------------------------

function stepConfirm(binary, context = {}) {
  banner('STEP 7 · FINAL VERIFICATION');

  const s = ts.status(binary);
  const state = ts.backendState(s.status);
  const self = ts.selfNode(s.status);
  const peerList = ts.peers(s.status);
  const online = peerList.filter((p) => p.online);

  kv('status exit code', String(s.code));
  kv('backend state', state === 'Running' ? ok(state) : bad(state));
  kv('this node', self.hostname + (self.dnsName ? ` (${self.dnsName})` : ''));
  kv('tailscale ips', self.ips.length ? cy(self.ips.join(', ')) : bad('none assigned'));
  kv('tailnet', ts.tailnetName(s.status) || dim('—'));
  kv('devices', `${peerList.length} known · ${online.length} online`);

  const mounted = ts.tailnetMounts();
  kv('tailnet drives', mounted.length ? cy(mounted.map((m) => `${m.id}→${m.host}`).join(', ')) : dim('none'));

  const connected = state === 'Running' && self.ips.length > 0;

  console.log();
  if (connected) {
    console.log(`  ${ok('[=] CONNECTED')} — this machine is on the tailnet.`);
    if (context.pinged) {
      const reachable = context.pinged.filter((r) => r.ok).length;
      console.log(`  ${reachable > 0 ? ok('[=]') : warn('[i]')} ${reachable}/${context.pinged.length} devices answered a tailscale ping.`);
    }
    console.log(`  ${dim('verify from a peer:')} ${cy('tailscale status')}  ${dim('or')} ${cy('tailscale ping ' + self.hostname.toLowerCase())}`);
  } else {
    const health = ts.health(s.status);
    // Exit 0 means the status call worked; the node is still not connected.
    // Reporting that as an "error code" sends the user hunting a broken command.
    const codeNote = s.code === 0
      ? 'status call succeeded, the node itself is not connected'
      : `status exited ${s.code}`;
    console.log(`  ${bad('[!] NOT CONNECTED')} — state ${state} (${codeNote})`);
    for (const h of health) console.log(`      ${dim(h)}`);
    if (state === 'NeedsLogin' || state === 'NoState') {
      console.log(`      ${dim('run:')} ${cy('pwshai tailscale')} ${dim('and choose an auth method')}`);
    } else if (s.error) {
      console.log(`      ${dim('error:')} ${s.error}`);
    }
  }
  console.log();

  return { ok: connected, state, self, peers: peerList };
}

// --- wizard ---------------------------------------------------------------

async function runWizard() {
  console.clear();
  console.log(`${C.bgBlack}${C.bold}${C.magenta}┌──────────────────────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.bgBlack}${C.bold}${C.cyan}│      PWSHAI · TAILNET CONTROL                             │${C.reset}`);
  console.log(`${C.bgBlack}${C.bold}${C.magenta}└──────────────────────────────────────────────────────────┘${C.reset}`);

  const d = stepLocate();
  if (!d.found) return { ok: false, reason: 'tailscale not installed' };

  await stepTrigger(d);
  const auth = await stepAuth(d.binary);

  const { prompts, onCancel } = makePrompts();
  const cont = await prompts({
    type: 'confirm',
    name: 'go',
    message: 'Continue to directory exposure and device checks?',
    initial: true,
    onCancel
  });
  if (!cont.go) {
    console.log(`\n${dim('[-] Stopped after authentication.')}\n`);
    return stepConfirm(d.binary, {});
  }

  await stepExpose(d.binary);
  await stepDrive(d.binary);
  const devices = await stepDevices(d.binary);

  return stepConfirm(d.binary, { pinged: devices.results });
}

// --- non-interactive subcommands ------------------------------------------

function cmdDetect() {
  const d = ts.detect();
  console.log(JSON.stringify(d, null, 2));
  return d.found ? 0 : 1;
}

function cmdStatus(binary) {
  const b = binary || (ts.detect().binary);
  if (!b) {
    console.error(bad('[!] tailscale not found'));
    return 1;
  }
  const s = ts.status(b);
  const state = ts.backendState(s.status);
  console.log(`${C.bold}state${C.reset}   ${state}`);
  console.log(`${C.bold}tailnet${C.reset} ${ts.tailnetName(s.status) || '—'}`);

  const self = ts.selfNode(s.status);
  console.log(`${C.bold}self${C.reset}    ${self.hostname} ${self.ips.join(', ') || '(no ip)'}`);

  const peerList = ts.peers(s.status);
  if (!peerList.length) {
    console.log(`${C.bold}peers${C.reset}   none visible`);
    return state === 'Running' ? 0 : 2;
  }
  console.log();
  table(
    ['device', 'os', 'online', 'ip', 'last seen'],
    peerList.map((p) => [p.hostname, p.os, p.online ? ok('yes') : bad('no'), p.ips[0] || '—', ts.formatAge(p.lastSeen)])
  );
  return 0;
}

async function cmdPing(binary, targets) {
  const b = binary || ts.detect().binary;
  if (!b) return 1;
  const list = targets && targets.length ? targets : ts.peers(ts.status(b).status).filter((p) => p.online).map((p) => p.ips[0] || p.dnsName);
  if (!list.length) {
    console.log(`${warn('[i]')} no targets to ping`);
    return 2;
  }
  let failures = 0;
  for (const t of list) {
    const r = ts.ping(b, t, { count: 1 });
    const label = r.ok ? ok(r.direct ? 'direct' : 'relayed') : bad(r.state || r.reason);
    console.log(`${String(t).padEnd(40)} ${label}  ${r.latencyMs != null ? r.latencyMs.toFixed(1) + 'ms' : ''} ${dim('exit ' + r.code)}`);
    if (!r.ok) failures++;
  }
  return failures ? 1 : 0;
}

async function cmdExpose(binary, dirs) {
  const b = binary || ts.detect().binary;
  if (!b) return 1;

  const share = require('./tailshare');
  const flags = (dirs || []).filter((d) => d.startsWith('--'));
  const paths = (dirs || []).filter((d) => !d.startsWith('--'));

  if (flags.includes('--install')) {
    const py = share.resolvePython();
    if (!py.python) {
      console.log(`${bad('[!]')} no python interpreter found`);
      return 1;
    }
    console.log(`${cy('[>]')} ${py.python} -m pip install wsgidav cheroot`);
    const r = share.deps(py.python);
    if (r.ok) {
      console.log(`${ok('[*]')} already installed`);
      return 0;
    }
    const { spawnSync } = require('child_process');
    const inst = spawnSync(py.python, ['-m', 'pip', 'install', 'wsgidav', 'cheroot'], { stdio: 'inherit' });
    return inst.status === 0 ? 0 : 1;
  }

  if (flags.includes('--stop')) {
    const r = share.stop();
    console.log(r.stopped ? `${ok('[*]')} stopped backend pid ${r.pid} on :${r.port}` : `${dim('[-]')} nothing listening on :${r.port}`);
    return r.ok ? 0 : 1;
  }

  if (flags.includes('--status')) {
    console.log(JSON.stringify(share.status(), null, 2));
    return 0;
  }

  if (!paths.length) {
    console.log(`${warn('[i]')} usage:`);
    console.log(`      pwshai tailscale expose --write <dir> [dir...]   ${dim('# read + write over WebDAV')}`);
    console.log(`      pwshai tailscale expose <dir> [dir...]           ${dim('# read-only serve <dir>')}`);
    console.log(`      pwshai tailscale expose --status | --stop | --install`);
    return 2;
  }

  if (flags.includes('--write')) {
    const roots = [];
    const used = new Set();
    for (const d of paths) {
      const abs = path.resolve(d);
      if (!fs.existsSync(abs)) {
        console.log(`${bad('[!]')} ${abs} does not exist`);
        return 1;
      }
      let label = path.basename(abs).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root';
      if (/^[A-Za-z]:[\\/]?$/.test(abs)) label = abs[0].toLowerCase();
      let n = label;
      let i = 2;
      while (used.has(n)) n = `${label}-${i++}`;
      used.add(n);
      roots.push({ label: n, path: abs });
    }

    const started = share.start(roots, { port: share.DEFAULT_PORT, readOnly: false });
    console.log(`${started.ok ? ok('[*]') : bad('[!]')} backend ${started.ok ? 'listening' : started.error} on 127.0.0.1:${started.port} ${dim('pid ' + started.pid)}`);
    if (!started.ok) {
      if (started.hint) console.log(`    ${dim(started.hint)}`);
      return 1;
    }
    for (const r of roots) console.log(`    ${cy('/' + r.label + '/')} -> ${r.path}`);

    const served = ts.serve(b, String(started.port), { background: true });
    console.log(`${served.ok ? ok('[*]') : bad('[!]')} serve ${started.port} ${dim('exit ' + served.code)}`);
    if (!served.ok) {
      console.log(`    ${dim(served.output.split('\n')[0] || '')}`);
      return 1;
    }
    const st = ts.status(b).status;
    const host = ts.tailnetHostFrom(st);
    const self = ts.selfNode(st);
    if (host && self.hostname) {
      const url = `https://${self.hostname.toLowerCase()}.${host}/`;
      console.log(`\n  map from another device: ${cy('net use * ' + url)}`);
    }
    return 0;
  }

  let failures = 0;
  for (const d of paths) {
    const abs = path.resolve(d);
    if (!fs.existsSync(abs)) {
      console.log(`${bad('[!]')} ${abs} does not exist`);
      failures++;
      continue;
    }
    const r = ts.serve(b, abs, { background: true });
    console.log(`${abs.padEnd(50)} ${r.ok ? ok('served') : bad('failed')} ${dim('exit ' + r.code)}`);
    if (!r.ok) {
      console.log(`    ${dim(r.output.split('\n')[0] || '')}`);
      if (r.elevationRequired) console.log(`    ${warn('[i]')} needs a local-admin shell on Windows`);
      failures++;
    }
  }
  return failures ? 1 : 0;
}

async function cmdMount(binary, action) {
  const b = binary || ts.detect().binary;
  const mounts = ts.tailnetMounts();

  if (action === 'off') {
    let failures = 0;
    for (const m of mounts) {
      if (!m.letter) continue;
      const r = ts.unmapDrive(m.letter);
      console.log(`${m.letter} ${r.ok ? ok('unmounted') : bad(r.output)}`);
      if (!r.ok) failures++;
    }
    return failures ? 1 : 0;
  }

  if (action === 'on') {
    const host = ts.tailnetHostFrom(ts.status(b).status);
    if (!host) {
      console.log(`${bad('[!]')} cannot determine the tailnet host — connect first`);
      return 2;
    }
    const url = `https://${host}/`;
    const r = ts.mapTailnetShare(url);
    console.log(`${r.ok ? ok('mapped') : bad('failed')} ${r.letter || ''} → ${url} ${dim('exit ' + r.code)}`);
    if (!r.ok) console.log(`    ${dim(r.output.split('\n')[0] || '')}`);
    return r.ok ? 0 : 1;
  }

  console.log(JSON.stringify(mounts, null, 2));
  return 0;
}

module.exports = {
  runWizard, cmdDetect, cmdStatus, cmdPing, cmdExpose, cmdMount,
  stepLocate, stepTrigger, stepAuth, stepExpose, stepExposeWritable, stepDrive, stepDevices, stepConfirm,
  pingAll, candidateDirs, loginInteractive
};

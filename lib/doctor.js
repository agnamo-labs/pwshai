// Wind environment health diagnostic suite

const { execSync } = require('child_process');
const { ANSI_COLORS, zephyrText, breezeText, galeText } = require('./wind-palettes');
const { printWindBanner, printWindBox } = require('./wind-effects');
const { isTteAvailable } = require('./tte-bridge');
const { findConfigFile, getUserConfigPath } = require('./config');
const profile = require('./profile');

function checkTool(name, command) {
  try {
    const out = execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 3000 });
    return { name, ok: true, version: out.trim().split('\n')[0] };
  } catch (e) {
    return { name, ok: false, version: 'Not detected' };
  }
}

function runDoctor() {
  console.clear();
  const bgBlack = '\x1b[48;2;0;0;0m';
  const cyan = '\x1b[36m';
  const magenta = '\x1b[35m';
  const reset = '\x1b[0m';
  
  console.log(`${bgBlack}${cyan}=== ORBITAL SYSTEM DIAGNOSTICS ===${reset}\n`);

  const checks = [
    checkTool('Node.js Runtime', 'node -v'),
    checkTool('NPM Package Manager', 'npm -v'),
    checkTool('Winget Package Manager', 'winget --version'),
    checkTool('Python Runtime', 'python --version'),
    checkTool('Antigravity CLI (agy)', 'agy --version')
  ];

  const tteOk = isTteAvailable();
  checks.push({
    name: 'Python TerminalTextEffects',
    ok: tteOk,
    version: tteOk ? 'Installed & Ready' : 'Optional (Install with /pip -u)'
  });

  const cfg = findConfigFile();
  checks.push({
    name: 'Active Orbital Config',
    ok: !!cfg,
    version: cfg || 'Default built-in presets'
  });

  // Profile health. These are the facts that would have caught a silently dead
  // keybinding: which shell the terminal actually loads, where its profile is,
  // whether PSReadLine is new enough, and what the profile throws on startup.
  try {
    for (const row of profile.health({ loadProfile: true })) {
      checks.push({
        name: `${row.label} (${row.shell})`,
        ok: !!row.profileExists,
        version: row.profileExists ? row.profile : 'no profile file'
      });
      checks.push({
        name: `PSReadLine (${row.edition || row.label})`,
        ok: !!row.psreadline,
        version: row.psreadline || 'not loaded'
      });
      if (row.badChords > 0) {
        checks.push({
          name: `Profile chords (${row.label})`,
          ok: false,
          version: `${row.badChords} invalid chord(s) - run 'pwshai repair'`
        });
      }
      if (row.loadErrors && row.loadErrors.length) {
        const first = String(row.loadErrors[0]).replace(/\s+/g, ' ').slice(0, 90);
        checks.push({ name: `Profile errors (${row.label})`, ok: false, version: first });
      } else {
        checks.push({ name: `Profile errors (${row.label})`, ok: true, version: 'none on load' });
      }
      checks.push({
        name: `Slash commands (${row.label})`,
        ok: row.slashFunctions > 0,
        version: `${row.slashFunctions} loaded`
      });
    }
    const predictor = profile.ensureCompletionPredictor({ write: false });
    checks.push({
      name: 'CompletionPredictor',
      ok: predictor.status === 'present',
      version: predictor.status === 'present' ? 'Installed' : 'Missing (history-only predictions)'
    });
  } catch (e) {
    checks.push({ name: 'Profile health', ok: false, version: e.message });
  }

  for (const c of checks) {
    const icon = c.ok ? `${bgBlack}${cyan}[*]${reset}` : `${bgBlack}${magenta}[!]${reset}`;
    const nameStr = c.name.padEnd(32);
    const verStr = c.ok ? `${bgBlack}${cyan}${c.version}${reset}` : `${bgBlack}${ANSI_COLORS.dim}${c.version}${reset}`;
    console.log(`${icon} ${bgBlack}${ANSI_COLORS.bold}${nameStr}${reset} ${verStr}`);
  }

  console.log(`\n${bgBlack}${cyan}[=] All core telemetry evaluated. System ready for flight!${reset}\n`);
}

module.exports = {
  runDoctor
};

// Wind environment health diagnostic suite

const { execSync } = require('child_process');
const { ANSI_COLORS, zephyrText, breezeText, galeText } = require('./wind-palettes');
const { printWindBanner, printWindBox } = require('./wind-effects');
const { isTteAvailable } = require('./tte-bridge');
const { findConfigFile, getUserConfigPath } = require('./config');

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

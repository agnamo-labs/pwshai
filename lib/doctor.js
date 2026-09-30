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
  printWindBanner('W I N D   D O C T O R', 'Diagnosing Airflow Environment & System Dependencies', 'zephyr');

  const checks = [
    checkTool('Node.js Runtime', 'node -v'),
    checkTool('NPM Package Manager', 'npm -v'),
    checkTool('Winget Package Manager', 'winget --version'),
    checkTool('Python Runtime', 'python --version'),
    checkTool('Antigravity CLI (agy)', 'agy --version')
  ];

  const tteOk = isTteAvailable();
  checks.push({
    name: 'Python TerminalTextEffects (TTE)',
    ok: tteOk,
    version: tteOk ? 'Installed & Ready' : 'Optional (Install with /pip -u)'
  });

  const cfg = findConfigFile();
  checks.push({
    name: 'Active Wind Config',
    ok: !!cfg,
    version: cfg || 'Default built-in presets'
  });

  let report = '';
  for (const c of checks) {
    const icon = c.ok ? ANSI_COLORS.green + '✔ ' + ANSI_COLORS.reset : ANSI_COLORS.yellow + '○ ' + ANSI_COLORS.reset;
    const nameStr = c.name.padEnd(32);
    const verStr = c.ok ? zephyrText(c.version) : ANSI_COLORS.dim + c.version + ANSI_COLORS.reset;
    report += icon + ' ' + ANSI_COLORS.bold + nameStr + ANSI_COLORS.reset + ' ' + verStr + '\n';
  }

  printWindBox(report.trim(), 'ENVIRONMENT HEALTH METRICS', 'breeze');
  console.log();
  console.log(zephyrText('🍃 All airflow diagnostics evaluated. System ready for flight!'));
  console.log();
}

module.exports = {
  runDoctor
};

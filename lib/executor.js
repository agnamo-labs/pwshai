// Wind-themed process executor with high-precision airflow timing and streaming logs

const { spawn } = require('child_process');
const { ANSI_COLORS, zephyrText, breezeText, galeText } = require('./wind-palettes');

function formatDuration(ns) {
  const ms = Number(ns) / 1e6;
  if (ms < 1000) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function executeCommand(commandStr, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const fullCmdDisplay = `${commandStr} ${args.join(' ')}`.trim();
    const startTime = process.hrtime.bigint();

    console.log(
      zephyrText('༄  [GUST] ') +
      ANSI_COLORS.bold +
      ANSI_COLORS.brightWhite +
      fullCmdDisplay +
      ANSI_COLORS.reset
    );
    console.log(breezeText('≈≈'.repeat(28)));

    const path = require('path');
    const childArgs = args.map(arg => {
      if (typeof arg === 'string' && arg.startsWith('scripts/')) {
        return path.join(__dirname, '..', arg);
      }
      if (typeof arg === 'string' && arg.startsWith('C:\\Users\\GabeMaher\\main.py')) {
        return arg; // Fallback for old hardcoded stuff if any still exist
      }
      return arg;
    });

    const child = spawn(commandStr, childArgs, {
      stdio: 'inherit',
      shell: true,
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {})
      }
    });

    child.on('error', (err) => {
      const elapsed = formatDuration(process.hrtime.bigint() - startTime);
      console.log();
      console.log(ANSI_COLORS.red + ANSI_COLORS.bold + '╭─── [⚠️ TURBULENCE] COMMAND FAILED ──────────────────╮' + ANSI_COLORS.reset);
      console.log(ANSI_COLORS.red + '│' + ANSI_COLORS.reset + ` Failed to spawn '${commandStr}'`);
      console.log(ANSI_COLORS.red + '│' + ANSI_COLORS.reset + ` Error: ${err.message}`);
      console.log(ANSI_COLORS.red + '│' + ANSI_COLORS.reset + ` Time: ${elapsed}`);
      console.log(ANSI_COLORS.red + ANSI_COLORS.bold + '╰─────────────────────────────────────────────────────╯' + ANSI_COLORS.reset);
      console.log();
      reject(err);
    });

    child.on('close', (code) => {
      const elapsed = formatDuration(process.hrtime.bigint() - startTime);
      console.log(breezeText('≈≈'.repeat(28)));

      if (code === 0) {
        console.log(
          zephyrText('✨ [CALM] ') +
          ANSI_COLORS.green +
          `Finished successfully in ${elapsed} (code 0)` +
          ANSI_COLORS.reset
        );
      } else {
        console.log();
        console.log(ANSI_COLORS.yellow + ANSI_COLORS.bold + `╭─── [🌪️ GUST WARNING] ──────────────────────────────╮` + ANSI_COLORS.reset);
        console.log(ANSI_COLORS.yellow + '│' + ANSI_COLORS.reset + ` Command exited with code: ${code}`);
        console.log(ANSI_COLORS.yellow + '│' + ANSI_COLORS.reset + ` Time: ${elapsed}`);
        console.log(ANSI_COLORS.yellow + ANSI_COLORS.bold + `╰─────────────────────────────────────────────────────╯` + ANSI_COLORS.reset);
        console.log();
      }
      resolve(code);
    });
  });
}

module.exports = {
  executeCommand,
  formatDuration
};

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

    const child = spawn(commandStr, args, {
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
      console.error(
        ANSI_COLORS.red + `🌪️ [TURBULENCE] Failed to spawn '${commandStr}': ${err.message} (${elapsed})` + ANSI_COLORS.reset
      );
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
        console.log(
          ANSI_COLORS.yellow +
          `🌪️ [GUST WARNING] Command exited with code ${code} in ${elapsed}` +
          ANSI_COLORS.reset
        );
      }
      resolve(code);
    });
  });
}

module.exports = {
  executeCommand,
  formatDuration
};

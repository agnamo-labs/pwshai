// Python TerminalTextEffects (TTE) bridge with native Node wind animation fallbacks

const { spawnSync, spawn } = require('child_process');
const { ANSI_COLORS, zephyrText, galeText } = require('./wind-palettes');
const { animateGust, animateBreezeWave, animateSwirl, dissolveInWind } = require('./wind-effects');

const KNOWN_TTE_EFFECTS = [
  'waves',
  'beams',
  'rain',
  'scattered',
  'bubbles',
  'crumble',
  'decrypt',
  'errorcorrect',
  'expand',
  'fireworks',
  'matrix',
  'overflow',
  'pour',
  'print',
  'randomsequence',
  'rings',
  'slide',
  'spotlights',
  'spray',
  'swarm',
  'synthgrid',
  'unstable',
  'verticalslice',
  'vhstape',
  'wipe'
];

function isTteAvailable() {
  try {
    const res = spawnSync('python', ['-m', 'terminaltexteffects', '--help'], {
      encoding: 'utf-8',
      shell: true,
      stdio: 'pipe',
      timeout: 3000
    });
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

function getAvailableTteEffects() {
  return KNOWN_TTE_EFFECTS;
}

async function runTteEffect(effect = 'waves', text = 'Antigravity Wind Suite', options = {}) {
  const tteOk = isTteAvailable();
  const selectedEffect = effect.toLowerCase();

  if (tteOk && KNOWN_TTE_EFFECTS.includes(selectedEffect)) {
    console.log(zephyrText(`༄ [TTE GUST] Piping through Python terminaltexteffects '${selectedEffect}'...`));
    return new Promise((resolve) => {
      const child = spawn('python', ['-m', 'terminaltexteffects', selectedEffect], {
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: true
      });

      child.on('close', (code) => {
        resolve(code);
      });

      child.on('error', async () => {
        console.log(ANSI_COLORS.yellow + 'Falling back to native Wind animations...' + ANSI_COLORS.reset);
        await fallbackEffect(selectedEffect, text);
        resolve(0);
      });

      child.stdin.write(text + '\n');
      child.stdin.end();
    });
  } else {
    // Native wind fallback
    return fallbackEffect(selectedEffect, text);
  }
}

async function fallbackEffect(effectName, text) {
  console.log(galeText(`🍃 [NATIVE WIND] Running native animation for '${effectName}':`));
  switch (effectName) {
    case 'waves':
    case 'beams':
    case 'synthgrid':
      await animateBreezeWave(text, { iterations: 2, speed: 30 });
      break;
    case 'scattered':
    case 'crumble':
    case 'rain':
    case 'wipe':
      await dissolveInWind(text, {});
      break;
    case 'bubbles':
    case 'rings':
    case 'swarm':
      await animateSwirl(text, { duration: 1200 });
      break;
    case 'gust':
    default:
      await animateGust(text, { palette: 'zephyr', duration: 1100 });
      break;
  }
  return 0;
}

module.exports = {
  KNOWN_TTE_EFFECTS,
  isTteAvailable,
  getAvailableTteEffects,
  runTteEffect
};

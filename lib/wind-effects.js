// Wind-themed terminal text effects, ASCII banners, particle engines, and live animations

const {
  ANSI_COLORS,
  PALETTES,
  stripAnsi,
  applyWindGradient,
  zephyrText,
  breezeText,
  galeText,
  auroraText,
  mistText,
  cycloneText,
  rustleText
} = require('./wind-palettes');

const WIND_PARTICLES = ['༄', '≈', '~', '·', '✧', '🍃', '💨', '🌬️', '°'];

const WIND_ASCII_LOGO = `
  __          ___           _ 
  \\ \\        / (_)         | |
   \\ \\  /\\  / / _ _ __   __| |
    \\ \\/  \\/ / | | '_ \\ / _\` |
     \\  /\\  /  | | | | | (_| |
      \\/  \\/   |_|_| |_|\\__,_|
`;

const WIND_HEADER_COMPACT = ` ~ ༄ ─── W I N D  C L I ─── ༄ ~`;

function getWindHeader() {
  return applyWindGradient(WIND_ASCII_LOGO.trim(), 'zephyr');
}

function printWindBanner(title = 'W I N D  C L I', subtitle = 'The Whispering Slash Command Suite', palette = 'zephyr') {
  const cleanTitle = stripAnsi(title);
  const cleanSub = stripAnsi(subtitle);
  const width = Math.max(62, cleanTitle.length + 8, cleanSub.length + 8);
  const topBorder = '━'.repeat(width - 2);

  console.log(applyWindGradient('┏' + topBorder + '┓', palette));
  console.log(
    applyWindGradient('┃ ', palette) +
    ANSI_COLORS.bold +
    applyWindGradient('༄  ' + cleanTitle.padEnd(width - 6), palette) +
    ANSI_COLORS.reset +
    applyWindGradient('┃', palette)
  );
  if (cleanSub) {
    console.log(
      applyWindGradient('┃ ', palette) +
      ANSI_COLORS.dim +
      cleanSub.padEnd(width - 4) +
      ANSI_COLORS.reset +
      applyWindGradient('┃', palette)
    );
  }
  console.log(applyWindGradient('┗' + topBorder + '┛', palette));
  console.log();
}

function printWindBox(content, title = '', palette = 'breeze') {
  const lines = (typeof content === 'string' ? content : '').split('\n');
  const cleanLines = lines.map(l => stripAnsi(l));
  const maxLineLen = Math.max(0, ...cleanLines.map(l => l.length));
  const cleanTitle = stripAnsi(title);
  const width = Math.max(50, maxLineLen + 4, cleanTitle ? cleanTitle.length + 8 : 0);

  const titleHeader = cleanTitle ? ` ༄ ${cleanTitle} ༄ ` : '';
  const topBorderRight = '─'.repeat(Math.max(0, width - 2 - titleHeader.length));

  console.log(applyWindGradient('┌' + titleHeader + topBorderRight + '┐', palette));
  for (let i = 0; i < lines.length; i++) {
    const cleanL = cleanLines[i];
    const pad = ' '.repeat(Math.max(0, width - 4 - cleanL.length));
    console.log(
      applyWindGradient('│ ', palette) +
      lines[i] +
      pad +
      applyWindGradient(' │', palette)
    );
  }
  console.log(applyWindGradient('└' + '─'.repeat(width - 2) + '┘', palette));
}

function injectWindParticles(text, density = 0.08) {
  const chars = text.split('');
  return chars
    .map(c => {
      if (c === ' ' && Math.random() < density) {
        const p = WIND_PARTICLES[Math.floor(Math.random() * WIND_PARTICLES.length)];
        return ANSI_COLORS.dim + p + ANSI_COLORS.reset;
      }
      return c;
    })
    .join('');
}

// Live Terminal Wind Animations
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function animateGust(text = 'Breeze flowing through terminal...', options = {}) {
  const { palette = 'zephyr', duration = 1200 } = options;
  const clean = stripAnsi(text);
  const totalSteps = 24;
  const delay = Math.max(20, Math.floor(duration / totalSteps));

  const gustSymbols = ['~', '≈', '༄', '💨', '🍃'];

  for (let step = 1; step <= totalSteps; step++) {
    const visibleChars = Math.floor((step / totalSteps) * clean.length);
    const head = clean.substring(0, visibleChars);
    const particle = step < totalSteps ? gustSymbols[step % gustSymbols.length] : '';
    const trail = step < totalSteps ? ' ' + applyWindGradient(particle + ' ~ ~', palette) : '';

    const coloredHead = applyWindGradient(head, palette);
    process.stdout.write('\r\x1b[K' + coloredHead + trail);
    await sleep(delay);
  }
  process.stdout.write('\n');
}

async function animateBreezeWave(text = 'Antigravity Wind Runner Active', options = {}) {
  const { iterations = 3, speed = 40 } = options;
  const clean = stripAnsi(text);
  const len = clean.length;
  if (len === 0) return;

  const palettesList = ['zephyr', 'aurora', 'gale', 'breeze', 'mist'];

  for (let iter = 0; iter < iterations; iter++) {
    for (let shift = 0; shift < len + 10; shift++) {
      let output = '';
      for (let i = 0; i < len; i++) {
        const dist = Math.abs(i - shift);
        if (dist < 4) {
          output += ANSI_COLORS.brightWhite + ANSI_COLORS.bold + clean[i] + ANSI_COLORS.reset;
        } else if (dist < 8) {
          output += applyWindGradient(clean[i], 'zephyr');
        } else {
          output += ANSI_COLORS.dim + clean[i] + ANSI_COLORS.reset;
        }
      }
      process.stdout.write('\r\x1b[K༄ ' + output + ' ༄');
      await sleep(speed);
    }
  }
  process.stdout.write('\r\x1b[K' + applyWindGradient('🍃 ' + clean + ' ✨', 'zephyr') + '\n');
}

async function animateSwirl(text = 'Swirling cyclone gust...', options = {}) {
  const { duration = 1400 } = options;
  const clean = stripAnsi(text);
  const swirlFrames = ['◜', '◝', '◞', '◟'];
  const totalFrames = 18;
  const delay = Math.floor(duration / totalFrames);

  for (let f = 0; f < totalFrames; f++) {
    const symbol = swirlFrames[f % swirlFrames.length];
    const trail = ' '.repeat(f % 4);
    const gradientName = f % 2 === 0 ? 'cyclone' : 'zephyr';
    process.stdout.write(
      '\r\x1b[K' +
      applyWindGradient(symbol + ' 🌪️ ' + trail + clean, gradientName)
    );
    await sleep(delay);
  }
  process.stdout.write(
    '\r\x1b[K' + applyWindGradient('༄  ' + clean + ' (settled)', 'breeze') + '\n'
  );
}

async function dissolveInWind(text = 'Scattered by the mountain wind...', options = {}) {
  const clean = stripAnsi(text);
  const chars = clean.split('');
  const steps = 15;
  let current = [...chars];

  for (let step = 0; step < steps; step++) {
    const scattered = current.map(ch => {
      if (ch === ' ') return ' ';
      if (Math.random() < 0.18) {
        const p = WIND_PARTICLES[Math.floor(Math.random() * WIND_PARTICLES.length)];
        return ANSI_COLORS.dim + p + ANSI_COLORS.reset;
      }
      if (Math.random() < 0.12) return ' ';
      return ch;
    });

    process.stdout.write('\r\x1b[K' + applyWindGradient(scattered.join(''), 'mist'));
    await sleep(70);
    current = scattered.map(c => (stripAnsi(c).length > 0 ? c : ' '));
  }
  process.stdout.write('\r\x1b[K' + ANSI_COLORS.dim + '... [dispersed into the breeze] ...' + ANSI_COLORS.reset + '\n');
}

async function runWindShowcase() {
  console.clear();
  console.log(getWindHeader());
  console.log();
  printWindBanner('W I N D   E F F E C T S   S H O W C A S E', 'Explore All 7 Wind Palettes & Live Kinetic Animations', 'zephyr');

  console.log(ANSI_COLORS.bold + '1. 🍃 7 TRUECOLOR WIND PALETTES:' + ANSI_COLORS.reset);
  console.log('   ' + zephyrText('• Zephyr  : Morning sky to seafoam aquamarine (Sky → Aqua → Pure White)'));
  console.log('   ' + breezeText('• Breeze  : Glacial mountain air (Frost White → Sky Teal → Azure)'));
  console.log('   ' + galeText('• Gale    : High altitude stormy ocean winds (Storm Blue → Electric Cyan)'));
  console.log('   ' + auroraText('• Aurora  : Northern light windstreams (Mint Aurora → Solar Pale Gold)'));
  console.log('   ' + mistText('• Mist    : Whispering valley fog (Lavender Breeze → Soft Sky)'));
  console.log('   ' + cycloneText('• Cyclone : Thunder vortex (Dark Thunder → Electric Azure → Lightning)'));
  console.log('   ' + rustleText('• Rustle  : Autumn canopy rustling (Amber Leaf → Golden Glow → Mint)'));
  console.log();

  console.log(ANSI_COLORS.bold + '2. 💨 WIND BOXES & PANELS:' + ANSI_COLORS.reset);
  printWindBox(
    '✦ Antigravity CLI  : /agy -d\n✦ Winget Upgrades  : /wing -u\n✦ NPM Global Sync  : /npm -u\n✦ Python TTE Bridge: wind tte waves',
    'AIRFLOW SHORTCUT MATRIX',
    'zephyr'
  );
  console.log();

  console.log(ANSI_COLORS.bold + '3. 🌬️ LIVE WIND KINETIC ANIMATIONS:' + ANSI_COLORS.reset);
  console.log(ANSI_COLORS.dim + '   Running Wind Gust Animation:' + ANSI_COLORS.reset);
  await animateGust('   ༄ A sudden gust of wind sweeps across your terminal...', { palette: 'zephyr', duration: 1000 });
  console.log();

  console.log(ANSI_COLORS.dim + '   Running Wind Wave Animation:' + ANSI_COLORS.reset);
  await animateBreezeWave('   🍃 Zephyr Breeze Wave Flowing Across Letters 🍃', { iterations: 1, speed: 25 });
  console.log();

  console.log(ANSI_COLORS.dim + '   Running Vortex Swirl:' + ANSI_COLORS.reset);
  await animateSwirl('   🌪️ Cyclone vortex spinning and settling...', { duration: 1000 });
  console.log();

  console.log(ANSI_COLORS.dim + '   Running Wind Dissolve (Leaf Scatter):' + ANSI_COLORS.reset);
  await dissolveInWind('   🍂 Leaves carried away by autumn winds into the horizon...', {});
  console.log();

  console.log(zephyrText('✔ Wind showcase complete! All airflow systems operational.'));
  console.log();
}

module.exports = {
  ...require('./wind-palettes'),
  WIND_PARTICLES,
  WIND_ASCII_LOGO,
  WIND_HEADER_COMPACT,
  getWindHeader,
  printWindBanner,
  printWindBox,
  injectWindParticles,
  animateGust,
  animateBreezeWave,
  animateSwirl,
  dissolveInWind,
  runWindShowcase
};

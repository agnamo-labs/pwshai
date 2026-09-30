// Wind-themed Truecolor (24-bit RGB) and ANSI color gradient palettes

const ANSI_COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',

  // Standard foregrounds
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright wind foregrounds
  brightCyan: '\x1b[96m',
  brightBlue: '\x1b[94m',
  brightWhite: '\x1b[97m',
  brightGreen: '\x1b[92m',

  // Backgrounds
  bgCyan: '\x1b[46m',
  bgBlue: '\x1b[44m',
  bgDark: '\x1b[40m'
};

const PALETTES = {
  // Fresh morning zephyr: Soft Sky -> Aquamarine -> Pure Breeze White
  zephyr: [
    { r: 0, g: 198, b: 255 },
    { r: 79, g: 172, b: 254 },
    { r: 168, g: 237, b: 234 },
    { r: 254, g: 214, b: 227 }
  ],
  // Cool mountain breeze: Frost White -> Glacial Teal -> Azure
  breeze: [
    { r: 224, g: 234, b: 252 },
    { r: 207, g: 222, b: 243 },
    { r: 112, g: 225, b: 245 },
    { r: 0, g: 140, b: 255 }
  ],
  // High-altitude gale: Deep Storm Blue -> Electric Cyan -> Icy Mist
  gale: [
    { r: 19, g: 84, b: 122 },
    { r: 43, g: 140, b: 180 },
    { r: 128, g: 208, b: 199 },
    { r: 255, g: 255, b: 255 }
  ],
  // Northern Lights Wind: Mint Aurora -> Solar Sky -> Pale Gold
  aurora: [
    { r: 112, g: 225, b: 245 },
    { r: 132, g: 250, b: 176 },
    { r: 143, g: 211, b: 244 },
    { r: 255, g: 209, b: 148 }
  ],
  // Whispering Valley Mist: Lavender breeze -> Sky Blue
  mist: [
    { r: 224, g: 195, b: 252 },
    { r: 170, g: 205, b: 252 },
    { r: 142, g: 197, b: 252 }
  ],
  // Electric Cyclone: Dark Thunder -> Electric Azure -> Lightning White
  cyclone: [
    { r: 35, g: 37, b: 38 },
    { r: 65, g: 117, b: 164 },
    { r: 0, g: 210, b: 255 },
    { r: 255, g: 255, b: 255 }
  ],
  // Autumn Wind: Rustling Amber -> Golden Leaf -> Mint
  rustle: [
    { r: 255, g: 154, b: 68 },
    { r: 252, g: 227, b: 138 },
    { r: 142, g: 236, b: 180 }
  ]
};

function stripAnsi(str) {
  return typeof str === 'string' ? str.replace(/\x1b\[[0-9;]*m/g, '') : '';
}

function interpolateRgb(stops, progress) {
  const p = Math.max(0, Math.min(1, progress));
  if (stops.length === 1) return stops[0];

  const totalSegments = stops.length - 1;
  const segment = Math.min(Math.floor(p * totalSegments), totalSegments - 1);
  const segmentProgress = (p - segment / totalSegments) * totalSegments;

  const start = stops[segment];
  const end = stops[segment + 1];

  return {
    r: Math.round(start.r + (end.r - start.r) * segmentProgress),
    g: Math.round(start.g + (end.g - start.g) * segmentProgress),
    b: Math.round(start.b + (end.b - start.b) * segmentProgress)
  };
}

function applyWindGradient(text, paletteName = 'zephyr') {
  const stops = PALETTES[paletteName] || PALETTES.zephyr;
  const clean = stripAnsi(text);
  const chars = clean.split('');
  if (chars.length === 0) return '';

  return (
    chars
      .map((char, index) => {
        if (char === '\n' || char === '\r') return char;
        const progress = chars.length > 1 ? index / (chars.length - 1) : 0;
        const { r, g, b } = interpolateRgb(stops, progress);
        return `\x1b[38;2;${r};${g};${b}m${char}`;
      })
      .join('') + ANSI_COLORS.reset
  );
}

function zephyrText(text) { return applyWindGradient(text, 'zephyr'); }
function breezeText(text) { return applyWindGradient(text, 'breeze'); }
function galeText(text) { return applyWindGradient(text, 'gale'); }
function auroraText(text) { return applyWindGradient(text, 'aurora'); }
function mistText(text) { return applyWindGradient(text, 'mist'); }
function cycloneText(text) { return applyWindGradient(text, 'cyclone'); }
function rustleText(text) { return applyWindGradient(text, 'rustle'); }

module.exports = {
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
};

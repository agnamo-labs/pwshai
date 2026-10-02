// Rich text effect renderer with pure ANSI fallbacks + optional library support

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgCyan: "\x1b[46m",
  bgBlue: "\x1b[44m"
};

function rainbowText(text) {
  const rainbowCodes = [
    "\x1b[38;5;196m",
    "\x1b[38;5;208m",
    "\x1b[38;5;226m",
    "\x1b[38;5;118m",
    "\x1b[38;5;45m",
    "\x1b[38;5;129m"
  ];
  return text
    .split("")
    .map((char, i) => rainbowCodes[i % rainbowCodes.length] + char)
    .join("") + colors.reset;
}

function neonGradient(text) {
  const codes = [
    "\x1b[38;5;51m",
    "\x1b[38;5;45m",
    "\x1b[38;5;39m",
    "\x1b[38;5;33m",
    "\x1b[38;5;27m",
    "\x1b[38;5;21m"
  ];
  return text
    .split("")
    .map((char, i) => codes[i % codes.length] + char)
    .join("") + colors.reset;
}

function printBanner(title = "LOCAL SLASH COMMANDS") {
  const line = "━".repeat(60);
  console.log(neonGradient("┏" + line + "┓"));
  console.log(
    neonGradient("┃ ") +
    colors.bold +
    colors.cyan +
    "⚡ " + title.padEnd(55) +
    colors.reset +
    neonGradient("┃")
  );
  console.log(
    neonGradient("┃ ") +
    colors.dim +
    "Trigger shortcuts instantly via /<cmd> or npm run <cmd>".padEnd(57) +
    colors.reset +
    neonGradient("┃")
  );
  console.log(neonGradient("┗" + line + "┛"));
  console.log();
}

function printBox(content, title = "") {
  const lines = content.split("\n");
  const maxLen = Math.max(...lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, "").length), title.length + 4, 40);
  const border = "─".repeat(maxLen + 2);

  console.log(colors.cyan + "┌" + (title ? ` ${title} ` : "").padEnd(maxLen + 2, "─") + "┐" + colors.reset);
  for (const rawLine of lines) {
    const visibleLen = rawLine.replace(/\x1b\[[0-9;]*m/g, "").length;
    const padding = " ".repeat(Math.max(0, maxLen - visibleLen));
    console.log(colors.cyan + "│ " + colors.reset + rawLine + padding + colors.cyan + " │" + colors.reset);
  }
  console.log(colors.cyan + "└" + border + "┘" + colors.reset);
}

function runEffectsDemo() {
  console.clear();
  printBanner("TEXT EFFECTS SUITE");

  console.log(colors.bold + "1. Rainbow Text Effect:" + colors.reset);
  console.log("   " + rainbowText("✦ Antigravity CLI ✦ Model Downloader ✦ Winget Upgrade ✦ NPM Update ✦"));
  console.log();

  console.log(colors.bold + "2. Cyberpunk Neon Gradient:" + colors.reset);
  console.log("   " + neonGradient("=========================================================="));
  console.log("   " + neonGradient(">>> ALL LOCAL SYSTEM SHORTCUTS LOADED & READY <<<"));
  console.log("   " + neonGradient("=========================================================="));
  console.log();

  console.log(colors.bold + "3. Python TerminalTextEffects (TTE) Integration:" + colors.reset);
  console.log(colors.dim + "   You can pipe any text into Python's 'tte' engine:" + colors.reset);
  console.log(colors.yellow + "   echo \"Antigravity\" | python -m terminaltexteffects matrix" + colors.reset);
  console.log(colors.yellow + "   echo \"Updating system\" | python -m terminaltexteffects decrypt" + colors.reset);
  console.log(colors.yellow + "   echo \"Done\" | python -m terminaltexteffects fireworks" + colors.reset);
  console.log();
}

module.exports = {
  colors,
  rainbowText,
  neonGradient,
  printBanner,
  printBox,
  runEffectsDemo
};

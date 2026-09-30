// Wind configuration loader, user overrides, and default preset commands

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_COMMANDS = [
  {
    trigger: '/agy -d',
    aliases: ['agy -d', '/agy', 'agy:danger'],
    description: 'Run Antigravity CLI with dangerously-skip-permissions enabled',
    command: 'agy',
    args: ['--dangerously-skip-permissions'],
    category: 'Antigravity'
  },
  {
    trigger: '/npm -u',
    aliases: ['npm -u', '/npm', 'npm:update'],
    description: 'Update all global npm packages and local dependencies',
    command: 'npm',
    args: ['update', '-g'],
    category: 'Package Management'
  },
  {
    trigger: '/wing -u',
    aliases: ['wing -u', '/winget -u', '/wing', 'wing:update'],
    description: 'Run Windows Package Manager (winget) upgrade for all packages',
    command: 'winget',
    args: ['upgrade', '--all', '--include-unknown', '--accept-source-agreements', '--accept-package-agreements'],
    category: 'Package Management'
  },
  {
    trigger: '/pip -u',
    aliases: ['pip -u', '/pip'],
    description: 'Upgrade pip and terminal text effect tools',
    command: 'python',
    args: ['-m', 'pip', 'install', '--upgrade', 'pip', 'terminaltexteffects'],
    category: 'Package Management'
  },
  {
    trigger: '/effects',
    aliases: ['/texteffects', '/tte', 'effects', 'wind:effects'],
    description: 'Launch wind text effects showcase and kinetic terminal animations',
    command: 'node',
    args: ['bin/cli.js', 'effects'],
    category: 'Visuals & Text Effects'
  },
  {
    trigger: '/doctor',
    aliases: ['doctor', 'wind:doctor', '/check'],
    description: 'Run wind environment health diagnostics',
    command: 'node',
    args: ['bin/cli.js', 'doctor'],
    category: 'Diagnostics'
  },
  {
    trigger: '/sync',
    aliases: ['sync', '/asana-sync'],
    description: 'Run Asana project sync script',
    command: 'python',
    args: [path.join(os.homedir(), 'main.py')],
    category: 'Projects'
  },
  {
    trigger: '/sync -v',
    aliases: ['sync -v', '/validate'],
    description: 'Validate Asana project connection without writing data',
    command: 'python',
    args: [path.join(os.homedir(), 'main.py'), '--validate'],
    category: 'Projects'
  },
  {
    trigger: '/help',
    aliases: ['/list', '/?', 'help', 'list'],
    description: 'Display this interactive wind slash command cheatsheet',
    command: 'node',
    args: ['bin/cli.js', 'list'],
    category: 'Help'
  }
];

function getUserConfigPath() {
  return path.join(os.homedir(), '.wind-commands.json');
}

function findConfigFile(customPath) {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  const localConfig = path.join(process.cwd(), 'wind.config.json');
  if (fs.existsSync(localConfig)) return localConfig;

  const localCommands = path.join(process.cwd(), 'commands.json');
  if (fs.existsSync(localCommands)) return localCommands;

  const pkgCommands = path.join(__dirname, '..', 'commands.json');
  if (fs.existsSync(pkgCommands)) return pkgCommands;

  const userConfig = getUserConfigPath();
  if (fs.existsSync(userConfig)) return userConfig;

  return null;
}

function loadConfig(customPath) {
  const configFile = findConfigFile(customPath);
  let loaded = [];

  if (configFile) {
    try {
      const raw = fs.readFileSync(configFile, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.commands)) {
        loaded = data.commands;
      }
    } catch (e) {
      console.error('Warning: Could not parse config file:', e.message);
    }
  }

  // Merge user custom commands with default presets (custom commands override defaults)
  const mergedMap = new Map();
  for (const cmd of DEFAULT_COMMANDS) {
    mergedMap.set(cmd.trigger.toLowerCase(), { ...cmd });
  }
  for (const cmd of loaded) {
    if (cmd && cmd.trigger) {
      mergedMap.set(cmd.trigger.toLowerCase(), { ...cmd });
    }
  }

  return Array.from(mergedMap.values());
}

function saveUserCommand(newCmd) {
  const userPath = getUserConfigPath();
  let existing = [];
  if (fs.existsSync(userPath)) {
    try {
      const raw = fs.readFileSync(userPath, 'utf-8');
      const data = JSON.parse(raw);
      existing = Array.isArray(data.commands) ? data.commands : [];
    } catch (e) {
      existing = [];
    }
  }

  const filtered = existing.filter(c => c.trigger.toLowerCase() !== newCmd.trigger.toLowerCase());
  filtered.push(newCmd);

  fs.writeFileSync(userPath, JSON.stringify({ commands: filtered }, null, 2), 'utf-8');
  return userPath;
}

function removeUserCommand(trigger) {
  const userPath = getUserConfigPath();
  if (!fs.existsSync(userPath)) return false;

  try {
    const raw = fs.readFileSync(userPath, 'utf-8');
    const data = JSON.parse(raw);
    const before = (data.commands || []).length;
    const filtered = (data.commands || []).filter(
      c => c.trigger.toLowerCase() !== trigger.toLowerCase() && !c.aliases?.includes(trigger)
    );
    if (filtered.length < before) {
      fs.writeFileSync(userPath, JSON.stringify({ commands: filtered }, null, 2), 'utf-8');
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

module.exports = {
  DEFAULT_COMMANDS,
  getUserConfigPath,
  findConfigFile,
  loadConfig,
  saveUserCommand,
  removeUserCommand
};

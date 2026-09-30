# ⚡ pwshai

> **Supercharged AI-powered PowerShell Typeahead, Terminal Text Effects, Theme Engine, and Modular Slash Command Suite.**

`pwshai` transforms your native PowerShell into an intelligent terminal environment with AI ghost-text completions, hotkey generators, terminal animations, appearance presets, and developer slash commands.

---

## 🚀 Quick Install

Install globally via npm:

```bash
npm install -g pwshai
```

Run the automated installer to configure your PowerShell profiles:

```bash
pwshai install
```

Reload your current session:

```powershell
. $PROFILE
```

---

## ⚡ Features & Slash Commands

### 🎨 Appearance & Themes
- `/theme [preset]` — Switch theme presets (`blue`, `dark`, `matrix`, `neon`, `dracula`, `default`)

### 🤖 AI Engine & Hotkeys
- `/provider <name>` — Set AI provider (`gemini`, `openai`, `claude`, `deepseek`, `opencode`, `kimi`, `local`)
- `/opencode` / `/claude` / `/chatgpt` / `/openai` — Direct provider shortcuts
- `/models` — Display local Ollama and available AI models
- `/keys` — Manage and test API keys (`/keys -stored`, `/keys -test`, `/keys -add <NAME> <VALUE>`)
- `/gen <prompt>` — Generate PowerShell commands from natural language
- `/ai-on` / `/ai-off` — Toggle AI hotkeys
- **`Ctrl + G`** — Inline Single-Line AI Command Generator
- **`Ctrl + Space`** — Multi-Candidate AI Autocomplete Picker
- **`F2`** — Toggle Prediction View Style (`InlineView` ghost text vs `ListView` popup menu)

### 🛠️ Developer Shortcuts & Updaters
- `/agy [-d|yolo]` — Launch Antigravity CLI (`-d` / `yolo` runs with `--dangerously-skip-permissions`)
- `/npm [-u]` — NPM manager (`-u` updates all global packages)
- `/wing [-u]` — Windows winget manager (`-u` upgrades all system packages)
- `/pip [-u]` — Python pip manager (`-u` upgrades pip & terminaltexteffects)
- `/sync [-v]` — Asana to Supabase sync runner (`-v` validates connections)
- `/codexx` — Launch Codex X Shell environment
- `/eb` — Eternal Buckets shortcut

### 🎬 Terminal Text Effects & Animations
- `/effects [effect]` — Launch terminal text effects (`glitch`, `matrix`, `waves`, `rain`, `beams`, `scatter`, `decrypt`)
- `/glitch [text]` — Hyperbolized glitch animation effect
- `/blow` / `/wave` — Wind and breeze wave text animations
- `/swirl` / `/dissolve` — Vortex swirl and leaf dispersal animations

### 🧭 Navigation & System Utilities
- `/fzf` / `/fuzzy` — Interactive FZF history search
- `/z <directory>` — Smart directory history jumping
- `/ports` — List active listening TCP network ports & owning processes
- `/ip` — Show local network interfaces and public IP
- `/find <pattern>` — Quick recursive file search
- `/history` / `/clear-history` — Search and manage command history
- `/sysinfo` — Hardware, memory, and uptime summary
- `/doctor` — Run environment diagnostic check
- `/reload` — Reload PowerShell profile & slash commands
- `/help` / `/slash` — Display interactive command cheatsheet

---

## 📦 Publishing Updates

```bash
npm version patch # or minor
npm publish
```

---

## 📄 License
MIT © Gabe Maher

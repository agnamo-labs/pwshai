# `pwshai` — Application, Surface & Function Objectives

## 1. Core Application Objective

`pwshai` is the **AI Swiss Army Knife for the PowerShell and Windows developer environment**: a generalist CLI utility, system & workspace cleaner, cross-ecosystem package manager, connection & credential verifier, kinetic terminal theme engine, and CODICE-powered AI shell accelerator.

Its purpose is to make every daily engineering workflow faster and lower-friction by combining into one modular suite:
- **System Cleaning & Workspace Hygiene:** Command history scrubbing (`/clear-history`, `/history`), recursive file discovery (`/find`), fuzzy search (`/fzf`), smart directory jumping (`/z`), active TCP port/process inspection (`/ports`, `/ip`, `/sysinfo`), and multi-format document extraction/normalization for vector and RAG pipelines (`/prep -vector-extract`).
- **Unified Package & Toolchain Management:** Single-command global and local upgrades across Node (`npm`), Windows Package Manager (`winget`), Python (`pip`), and local LLM toolchains (`ollama`, `llama.cpp`, `huggingface-cli`).
- **Connection Verification & Environment Diagnostics:** Secure credential storage across Windows Registry User environment variables (`HKCU\Environment`), `~/.hermes/.env`, and `~/.pwshai/.env`; live HTTP endpoint probing across `codice.luxnet.cc`, AI providers, and local runtimes (`/keys -test`); and automated health checks for CLI binaries and PowerShell modules (`/doctor`).
- **CODICE-Driven AI Typeahead & Probabilistic Recommendations:** Live model, provider, capability, and pricing discovery sourced dynamically from `https://codice.luxnet.cc/api/v1/*` (with zero hardcoded model lists), powering natural-language PowerShell command synthesis (`/gen`, `Ctrl+G`), `PSReadLine` inline/list prediction (`F2`), and multi-candidate AI autocomplete (`Ctrl+Space`) ranked by a Python probability engine (`scripts/recommend_prob.py`) backed by a single lightweight SQLite preference database (`~/.pwshai/preferences.db`).

---

## 2. Core Components & Function Objectives

### 2.1 CLI Control Plane, Config & Executor (`bin/cli.js`, `lib/config.js`, `lib/executor.js`, `commands.json`)
- **CLI Entrypoint & Subcommands (`bin/cli.js`):**
  - `pwshai` (no args) -> `showInteractiveMenu()`: Launch searchable autocomplete TUI over all core actions and slash commands.
  - `pwshai install` | `setup` -> `install()`, `getTargetDirectories()`, `getTargetProfiles()`: Discover all WindowsPowerShell 5.1 and PowerShell 7+ profile paths (including OneDrive and custom profiles), sync `SlashCommands.ps1`, `glitch_effect.py`, `recommend_prob.py`, and `extractor.py`, initialize `~/.pwshai/preferences.db`, and configure `PSReadLine`, `CompletionPredictor`, `PSFzf`, `ZLocation`, `F2`, `Ctrl+G`, and `Ctrl+Space`.
  - `pwshai status` -> `status()`: Display active installation status across all detected PowerShell profile paths.
  - `pwshai doctor` | `check` | `/doctor` -> `doctor()` / `runDoctor()`.
  - `pwshai list` | `ls` | `help` | `--help` | `-h` | `/help` | `/list` | `/?` | `?` -> `printHelpMenu()`: Display categorized slash command cheatsheet.
  - `pwshai config` | `/config` | `/settings` -> `showConfigWizard()`: Display active settings and live CODICE model catalog summary.
  - `pwshai /model --pull` | `/pull-model` -> `pullModel()`: Interactively select and download GGUF/HuggingFace models sourced from `codice.luxnet.cc`.
  - `pwshai [run] /<trigger> [...args]`: Match any trigger or alias from `loadRegisteredCommands()` and execute it with trailing user arguments.
  - `pwshai effects` | `blow` | `wave` | `swirl` | `dissolve` | `tte <effect> [text]`: Direct CLI entrypoints for kinetic wind and TTE text animations.
- **Configuration Loader (`lib/config.js`):**
  - `DEFAULT_COMMANDS`, `getUserConfigPath()`, `findConfigFile(customPath)` (`./wind.config.json` -> `./commands.json` -> package `commands.json` -> `~/.wind-commands.json`), `loadConfig()`, `saveUserCommand(newCmd)`, `removeUserCommand(trigger)`.
- **Process Executor (`lib/executor.js`):**
  - `executeCommand(commandStr, args, options)` & `formatDuration(ns)`: Spawn commands with high-precision airflow timing, resolving `bin/*` and `scripts/*` paths relative to package root, dot-sourcing `SlashCommands.ps1` for `Invoke-Slash*` handlers, and forwarding trailing arguments.

### 2.2 Connection Verification, Key Vault & System Doctor (`bin/keys.js`, `lib/doctor.js`, `Invoke-SlashKeys`, `Invoke-SlashKey`, `Invoke-SlashDoctor`)
- **Key Vault Management (`bin/keys.js`, `Invoke-SlashKeys`, `Invoke-SlashKey`):**
  - `loadKeys()`, `saveKeys()`, `manageKeys()` (`bin/keys.js`): Interactive key manager for `~/.hermes/.env` and user environment variables.
  - `Invoke-SlashKeys` (`/keys [-stored|-test|-list|-add <KEY> <VAL>]`) & `Invoke-SlashKey` (`/key [newKey]`): Inspect masked keys across Windows User Registry environment variables and `.env` files, add new provider keys, and test live provider connectivity (`/keys -test`) against `https://codice.luxnet.cc/api/v1/providers` and every configured provider endpoint.
- **Environment Diagnostics (`lib/doctor.js`, `Invoke-SlashDoctor`):**
  - `checkTool(name, command)` & `runDoctor()` (`lib/doctor.js`) / `Invoke-SlashDoctor` (`/doctor`): Audit Node.js, NPM, Winget, Python, `agy`, `fzf`, `TerminalTextEffects`, active config path, `glitch_effect.py`, `recommend_prob.py`, `~/.pwshai/preferences.db`, and PowerShell modules (`PSReadLine`, `CompletionPredictor`, `PSFzf`, `ZLocation`).

### 2.3 Cleaning, Package Management & Generalist Developer Utilities (`scripts/SlashCommands.ps1`, `scripts/extractor.py`, `scripts/install_local_ai.ps1`)
- **Package & Toolchain Updaters:**
  - `Invoke-SlashNpm` (`/npm [-u|update|...]`): Upgrade all global npm packages or pass through npm arguments.
  - `Invoke-SlashWing` (`/wing [-u]`, `/winget [-u]`): Upgrade all Windows packages with automatic agreement flags or pass through winget arguments.
  - `Invoke-SlashPip` (`/pip [-u]`): Upgrade `pip` and `terminaltexteffects` or pass through pip arguments.
  - `scripts/install_local_ai.ps1` (`/model --install-local`, `/install-local`, `/install-ai`): Install and update `huggingface_hub[cli]`, `hf-transfer`, `llama-cpp-python`, and `ollama`.
- **Workspace Cleaning & Vector Extraction (`scripts/extractor.py`):**
  - `convert_and_extract(src_dir, dest_dir)` (`/prep -vector-extract`, `/vector -prep`, `/prep`): Walk `src_dir`, copy `.md`, `.pdf`, `.txt`, convert code/config files (`TEXT_EXTENSIONS`), `.docx` (`docx2txt`), and `.html`/`.htm` (`markdownify`) into clean text artifacts under `dest_dir` (`vector-prep-extract_<timestamp>`).
- **Navigation, History Hygiene & System Telemetry (`scripts/SlashCommands.ps1`):**
  - `Invoke-SlashPorts` (`/ports`), `Invoke-SlashIp` (`/ip`), `Invoke-SlashSysinfo` (`/sysinfo`), `Invoke-SlashFind` (`/find <pattern>`), `Invoke-SlashHistory` (`/history [search]`), `Invoke-SlashClearHistory` (`/clear-history`), `Invoke-SlashFzf` (`/fzf`, `/fuzzy`), `Invoke-SlashZ` (`/z <dir>`), `Invoke-SlashReload` (`/reload`), `Invoke-SlashHelp` (`/help`, `/slash`, `/list`).
- **Developer Harness Bridges (`scripts/SlashCommands.ps1`):**
  - `Invoke-SlashAgy` (`/agy [-d|yolo]`, `/yolo`): Launch Antigravity CLI with optional `--dangerously-skip-permissions`.
  - `Invoke-SlashCodexx` (`/codexx`, `/codex`): Launch Codex X Shell (`X:\AI\codex\bin\codex-x.ps1` or `codex` on PATH).
  - `Invoke-SlashEb` (`/eb`, `/eternal-buckets`): Launch Eternal Buckets CLI (`~/.eternal-buckets/bin/eb.ps1` or `eb` on PATH).
  - `Invoke-SlashSync` (`/sync [-v|--validate]`) & `Invoke-SlashValidate` (`/validate`): Discover and execute workspace/Supabase sync and connection validation pipelines with real verification logic (zero no-op print stubs).

### 2.4 CODICE Catalog Integration, AI Engine & Probabilistic Typeahead (`lib/codice.js`, `scripts/SlashCommands.ps1`, `scripts/recommend_prob.py`)
- **CODICE Model & Provider Source (`Get-CodiceCatalog`, `lib/codice.js`, `Invoke-SlashModels`, `Invoke-SlashProvider`):**
  - Pull live provider profiles (`https://codice.luxnet.cc/api/v1/profiles`), provider status (`/api/v1/providers`), and model listings (`/api/v1/models/list`, `/api/v1/table`, `/api/v1/providers/{provider}`) with a 24-hour local cache at `~/.pwshai/codice-cache.json`.
  - Use CODICE's `auth_env_var`, `provider`, capability flags (`t` tools, `v` vision, `r` reasoning, `ow` open-weights), context window (`ctx`), and pricing (`in`, `out`) across `/models`, `/provider`, `/config`, `/model --pull`, and direct shortcuts (`Invoke-SlashOpencode` `/opencode`, `Invoke-SlashClaude` `/claude`, `Invoke-SlashChatgpt` `/chatgpt` `/openai`).
- **Multi-Provider AI Execution (`Invoke-AIProviderEngine`, `Invoke-SlashGen`, `Invoke-SlashAiOn`, `Invoke-SlashAiOff`):**
  - Dispatch natural-language command synthesis (`/gen`, `Ctrl+G`) and multi-candidate line completion (`Ctrl+Space`) across all configured providers (`gemini`, `openai`, `claude`, `deepseek`, `opencode`, `kimi`, `wiro`, `nitemcp`, `local` Ollama) using each provider's wire format and CODICE model metadata.
- **Probabilistic Preference Engine (`scripts/recommend_prob.py` & `~/.pwshai/preferences.db`):**
  - Maintain a **single SQLite database** (`~/.pwshai/preferences.db`) with tables `command_history`, `prefix_frequencies`, `bigrams`, and `ai_feedback`.
  - Expose CLI commands `record --cmd <str> --cwd <path> [--accepted-from <history|ai|fzf>]`, `rank --prefix <str> --cwd <path> [--candidates-json <json>] [--limit <n>]`, and `stats`.
  - Combine prefix frequency, working-directory affinity, exponential recency decay, Markov bigram transition probability ($P(c_t \mid c_{t-1})$), and AI acceptance feedback to rank `Ctrl+Space` and `F2` / `fzf` recommendations.

### 2.5 Theme & Kinetic Visual Engine (`Invoke-ApplyTheme`, `Invoke-SlashTheme`, `lib/wind-palettes.js`, `lib/wind-effects.js`, `lib/tte-bridge.js`, `scripts/glitch_effect.py`)
- **Appearance Presets (`Invoke-ApplyTheme`, `Invoke-SlashTheme` `/theme`):**
  - Switch and persist terminal foreground and `PSReadLine` token/prediction color schemes across `blue`, `dark`, `matrix`, `neon`, `dracula`, and `default`, with `Register-ArgumentCompleter` tab completion for `/theme`, `/provider`, `/keys`, `/agy`, `/npm`, `/wing`, `/winget`, `/pip`, and `/effects`.
- **Truecolor Wind & Glitch Animations (`lib/wind-palettes.js`, `lib/wind-effects.js`, `lib/tte-bridge.js`, `scripts/glitch_effect.py`):**
  - 7 truecolor palettes (`zephyr`, `breeze`, `gale`, `aurora`, `mist`, `cyclone`, `rustle`), ASCII banners/boxes (`getWindHeader`, `printWindBanner`, `printWindBox`, `injectWindParticles`), live kinetic animations (`animateGust` `/blow`, `animateBreezeWave` `/wave`, `animateSwirl` `/swirl`, `dissolveInWind` `/dissolve`, `runWindShowcase` `/effects`), Python `terminaltexteffects` bridge (`isTteAvailable`, `runTteEffect`, `fallbackEffect`), and hyperbolized glitch renderer (`render_effect`, `render_fallback_animation` `/glitch`).

---

## 3. Definition of Success

1. Every registered slash command and CLI subcommand in `pwshai` executes real logic end-to-end with zero stubs, whether invoked inside an interactive PowerShell session or via `pwshai /<command>`.
2. All model, provider, capability, and pricing metadata is pulled dynamically from `https://codice.luxnet.cc/api/v1/*` with zero hardcoded model lists.
3. `fzf`, `F2` (`InlineView` ↔ `ListView`), `PSReadLine` typeahead, and AI-driven recommendations (`Ctrl+G`, `Ctrl+Space`) work seamlessly, ranked by `scripts/recommend_prob.py` against a single SQLite preference database (`~/.pwshai/preferences.db`).

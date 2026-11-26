# `pwshai` — TODO

## Phase 1: Live `codice.luxnet.cc` Model, Provider, Tool & Pricing Integration
- [ ] Create `lib/codice.js` and `Get-CodiceCatalog` in `scripts/SlashCommands.ps1` to pull live provider profiles (`https://codice.luxnet.cc/api/v1/profiles`), provider status (`/api/v1/providers`), and model catalogs (`/api/v1/models/list`, `/api/v1/table`, `/api/v1/providers/{provider}`) with a 24-hour cache at `~/.pwshai/codice-cache.json`.
- [ ] Update `pullModel()` and `showConfigWizard()` in `bin/cli.js` and `Invoke-SlashModels` / `Invoke-SlashProvider` in `scripts/SlashCommands.ps1` to use live CODICE models, `auth_env_var` mappings, capability flags (`t`, `v`, `r`, `ow`), and token pricing (`in`, `out`) instead of static lists.

## Phase 2: Complete All Command Stubs & CLI-to-PowerShell Dispatch
- [ ] Complete `Invoke-AIProviderEngine` in `scripts/SlashCommands.ps1` so every provider (`gemini`, `openai`, `claude`, `deepseek`, `opencode`, `kimi`, `wiro`, `nitemcp`, `local`) executes against its real endpoint and wire format using CODICE metadata and `auth_env_var` key resolution.
- [ ] Complete `Invoke-SlashSync` (`/sync`, `/validate`) and `Invoke-SlashEffects` / `Get-GlitchScriptPath` in `scripts/SlashCommands.ps1` so all commands execute real logic with zero no-op stubs while preserving all existing functions and candidate paths.
- [ ] Update `lib/executor.js`, `bin/cli.js`, and `commands.json` so `Invoke-Slash*` commands dot-source `scripts/SlashCommands.ps1` before running, resolve `bin/*` and `scripts/*` paths relative to package root, and forward trailing CLI arguments (e.g. `pwshai /theme matrix`, `pwshai /gen <prompt>`).
- [ ] Extend `bin/keys.js` and `Invoke-SlashKeys` (`/keys -stored`, `/keys -test`, `/keys -add`) to resolve Windows Registry User environment variables (`HKCU\Environment`) + `~/.hermes/.env` and probe `https://codice.luxnet.cc/api/v1/providers` plus all configured provider endpoints.

## Phase 3: Probabilistic Typeahead (`scripts/recommend_prob.py`), Single SQLite DB (`~/.pwshai/preferences.db`) & `fzf` / `F2`
- [ ] Create `scripts/recommend_prob.py` backed by a **single SQLite database** (`~/.pwshai/preferences.db`) with tables `command_history`, `prefix_frequencies`, `bigrams`, and `ai_feedback`, supporting `record`, `rank`, and `stats` subcommands.
- [ ] Ensure `scripts/SlashCommands.ps1` and `bin/cli.js` (`install()`) bind `F2` (`InlineView` ↔ `ListView` toggle), `PSReadLine` `HistoryAndPlugin` prediction, `PSFzf` (`/fzf`), `Ctrl+G`, and `Ctrl+Space` when loaded.
- [ ] Wire `Ctrl+Space` multi-candidate AI autocomplete to score candidates via `scripts/recommend_prob.py` and present an interactive `fzf` / menu selector before replacing the buffer.

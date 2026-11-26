# `pwshai` — Implementation Plan

## 1. Objective Alignment
All work in this plan executes toward the architecture and success criteria defined in [docs/OBJECTIVE.md](docs/OBJECTIVE.md): operating `pwshai` as the AI Swiss Army Knife for the Windows/PowerShell developer terminal—covering system cleaning, cross-ecosystem package management, connection verification, kinetic terminal themes, and CODICE-driven probabilistic AI typeahead.

---

## 2. Execution Phases

### Phase 1: Live `codice.luxnet.cc` Model & Provider Integration
1. **CODICE Client (`lib/codice.js` & `Get-CodiceCatalog` in `scripts/SlashCommands.ps1`):**
   - Fetch `/api/v1/profiles`, `/api/v1/providers`, `/api/v1/models/list`, and `/api/v1/table` from `https://codice.luxnet.cc`.
   - Cache responses locally at `~/.pwshai/codice-cache.json` with a 24-hour TTL and offline fallback.
2. **Dynamic Model & Provider Surfacing:**
   - Drive `/models` (`Invoke-SlashModels`), `/provider` (`Invoke-SlashProvider`), `/config` (`showConfigWizard`), and `/model --pull` (`pullModel`) directly from the CODICE catalog, displaying capabilities (`t`, `v`, `r`), context windows (`ctx`), and USD/1M token pricing (`in`, `out`).

### Phase 2: Complete All Command Stubs & CLI Dispatch
1. **Complete Multi-Provider AI Execution (`Invoke-AIProviderEngine`):**
   - Preserve existing `local`, `openai`, `deepseek`, and `gemini` handlers while completing real API execution branches for `claude` (Anthropic `/v1/messages` with `ANTHROPIC_API_KEY`), `opencode`, `kimi` (Moonshot `/v1/chat/completions` with `MOONSHOT_API_KEY`), `wiro` (`WIRO_API_KEY`), and `nitemcp` (`NITEMCP_API_KEY`), resolving each provider's `auth_env_var` and default model from CODICE.
2. **Complete Slash Command & CLI Execution (`commands.json`, `bin/cli.js`, `lib/executor.js`, `scripts/SlashCommands.ps1`):**
   - In `lib/executor.js` and `commands.json`, resolve both `bin/*` and `scripts/*` relative to package root (`path.join(__dirname, '..')`) and dot-source `scripts/SlashCommands.ps1` before invoking `Invoke-Slash*` functions so `pwshai /<cmd>` works in `-NoProfile` subshells.
   - Update `bin/cli.js` command matching to match trigger/alias prefixes and forward trailing user arguments to the executed command.
   - Complete `Invoke-SlashSync` (`/sync`, `/validate`) and `Get-GlitchScriptPath` / `Invoke-SlashEffects` so all 31 commands execute real logic without no-op print stubs.
3. **Hardware Env Key Vault & Live Connection Probing (`bin/keys.js`, `Invoke-SlashKeys`):**
   - Read and persist keys across Windows User Registry environment variables (`[Environment]::GetEnvironmentVariable(..., "User")`), `~/.hermes/.env`, and `~/.pwshai/.env`.
   - Extend `/keys -test` to probe `https://codice.luxnet.cc/api/v1/providers`, local Ollama, and every provider for which an API key is configured.

### Phase 3: Probabilistic Typeahead (`scripts/recommend_prob.py`) & Single SQLite DB (`~/.pwshai/preferences.db`)
1. **Single SQLite Preference Database (`~/.pwshai/preferences.db`):**
   - Initialize a single SQLite database (avoiding multi-file DB bloat) with tables:
     - `command_history (id INTEGER PRIMARY KEY, command TEXT, cwd TEXT, exit_code INTEGER, ts INTEGER)`
     - `prefix_frequencies (prefix TEXT, command TEXT, cwd TEXT, hits INTEGER, last_used INTEGER, PRIMARY KEY (prefix, command, cwd))`
     - `bigrams (prev_command TEXT, next_command TEXT, hits INTEGER, last_used INTEGER, PRIMARY KEY (prev_command, next_command))`
     - `ai_feedback (prompt_prefix TEXT, candidate TEXT, accepted INTEGER, ts INTEGER, PRIMARY KEY (prompt_prefix, candidate))`
2. **Python Probability Engine (`scripts/recommend_prob.py`):**
   - Implement `record`, `rank`, and `stats` CLI subcommands computing a composite probability score:
     $$S(c \mid p, \text{cwd}, c_{t-1}) = w_1 P_{\text{prefix}}(c \mid p) + w_2 P_{\text{cwd}}(c \mid \text{cwd}) + w_3 e^{-\lambda \Delta t} + w_4 P_{\text{bigram}}(c \mid c_{t-1}) + w_5 P_{\text{ai}}(c \mid p)$$
3. **`fzf`, `F2`, and `Ctrl+Space` Typeahead Integration:**
   - Ensure `SlashCommands.ps1` binds `F2` (`InlineView` ↔ `ListView`), `PSReadLine` `HistoryAndPlugin` predictions, `PSFzf` (`/fzf`), `Ctrl+G`, and `Ctrl+Space` whenever dot-sourced.
   - Update `Ctrl+Space` to pass AI + history candidates through `scripts/recommend_prob.py rank`, pipe the ranked candidates into `fzf` (or `Out-ConsoleGridView` / numbered prompt fallback), record the user's choice via `recommend_prob.py record`, and replace the buffer line.

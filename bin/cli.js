#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Optional wind effects & library dependencies
let windEffects = null;
let configLib = null;
let executorLib = null;
let tteBridge = null;
let doctorLib = null;

try {
    windEffects = require('../lib/wind-effects');
    configLib = require('../lib/config');
    executorLib = require('../lib/executor');
    tteBridge = require('../lib/tte-bridge');
    doctorLib = require('../lib/doctor');
} catch (e) {}

const rawArgs = process.argv.slice(2);
const first = (rawArgs[0] || '').toLowerCase();

function getTargetDirectories() {
    const home = os.homedir();
    const dirs = new Set();

    dirs.add(path.join(home, 'Documents', 'PowerShell'));
    dirs.add(path.join(home, 'Documents', 'WindowsPowerShell'));
    dirs.add(path.join(home, 'OneDrive', 'Documents', 'PowerShell'));
    dirs.add(path.join(home, 'OneDrive', 'Documents', 'WindowsPowerShell'));

    const customProfileDir = path.join(home, 'powershell-profile');
    if (fs.existsSync(customProfileDir)) {
        dirs.add(customProfileDir);
    }

    if (process.platform === 'win32') {
        try {
            const out = execSync('powershell.exe -NoProfile -NonInteractive -Command "Split-Path $PROFILE"', {
                encoding: 'utf8',
                timeout: 4000,
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
            if (out && fs.existsSync(out)) { dirs.add(out); }
        } catch (e) {}
    }

    try {
        const pwshCmd = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
        const outPwsh = execSync(`${pwshCmd} -NoProfile -NonInteractive -Command "Split-Path $PROFILE"`, {
            encoding: 'utf8',
            timeout: 4000,
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        if (outPwsh && fs.existsSync(outPwsh)) { dirs.add(outPwsh); }
    } catch (e) {}

    return Array.from(dirs);
}

function getTargetProfiles() {
    const dirs = getTargetDirectories();
    const profiles = new Set();
    for (const dir of dirs) {
        profiles.add(path.join(dir, 'Microsoft.PowerShell_profile.ps1'));
    }
    return Array.from(profiles);
}

function install() {
    console.clear();
    const bgBlack = '\x1b[48;2;0;0;0m';
    const cyan = '\x1b[36m';
    const magenta = '\x1b[35m';
    const white = '\x1b[97m';
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    
    console.log(`\n${bgBlack}${bold}${magenta}[+] Installing PWSHAI Orbital Suite...${reset}\n`);
    
    const dirs = getTargetDirectories();
    const profiles = getTargetProfiles();
    const sourceScript = path.join(__dirname, '..', 'scripts', 'SlashCommands.ps1');
    const sourceGlitch = path.join(__dirname, '..', 'scripts', 'glitch_effect.py');

    dirs.forEach((psDir) => {
        if (!fs.existsSync(psDir)) {
            try { fs.mkdirSync(psDir, { recursive: true }); } catch (e) {}
        }
        if (fs.existsSync(psDir)) {
            const targetScript = path.join(psDir, 'SlashCommands.ps1');
            try {
                fs.copyFileSync(sourceScript, targetScript);
                console.log(`${bgBlack}  ${cyan}[*]${reset}${bgBlack} Synced SlashCommands.ps1 to ${cyan}${targetScript}${reset}`);
            } catch (e) {}

            if (fs.existsSync(sourceGlitch)) {
                const targetGlitch = path.join(psDir, 'glitch_effect.py');
                try {
                    fs.copyFileSync(sourceGlitch, targetGlitch);
                    console.log(`${bgBlack}  ${cyan}[*]${reset}${bgBlack} Synced glitch_effect.py to ${cyan}${targetGlitch}${reset}`);
                } catch (e) {}
            }
        }
    });

    profiles.forEach((profilePath) => {
        let profileContent = '';
        if (fs.existsSync(profilePath)) {
            profileContent = fs.readFileSync(profilePath, 'utf8');
        }

        const snippetMarker = '# --- PWSHAI AUTO CONFIG ---';
        if (!profileContent.includes(snippetMarker)) {
            const configBlock = '\n\n' + snippetMarker + '\n' +
'# Ensure PSReadLine is loaded\n' +
'if (-not (Get-Module -Name PSReadLine)) {\n' +
'    Import-Module PSReadLine -ErrorAction SilentlyContinue\n' +
'}\n\n' +
'if ($host.Name -eq "ConsoleHost" -or $host.Name -eq "Visual Studio Code Host" -or $host.UI.RawUI) {\n' +
'    try {\n' +
'        Import-Module CompletionPredictor -ErrorAction SilentlyContinue\n' +
'        try {\n' +
'            Set-PSReadLineOption -PredictionSource HistoryAndPlugin -ErrorAction Stop\n' +
'        } catch {\n' +
'            Set-PSReadLineOption -PredictionSource History -ErrorAction SilentlyContinue\n' +
'        }\n' +
'        Set-PSReadLineOption -PredictionViewStyle InlineView -ErrorAction SilentlyContinue\n' +
'        Set-PSReadLineOption -Colors @{ InlinePrediction = "Cyan" } -ErrorAction SilentlyContinue\n' +
'    } catch {}\n' +
'}\n\n' +
'try {\n' +
'    Import-Module PSFzf -ErrorAction SilentlyContinue\n' +
'    if (Get-Command Set-PsFzfOption -ErrorAction SilentlyContinue) { Set-PsFzfOption -PSReadLine }\n' +
'    Import-Module ZLocation -ErrorAction SilentlyContinue\n' +
'} catch {}\n\n' +
'# Resolve and dot-source SlashCommands.ps1\n' +
'$slashCandidates = @(\n' +
'    (Join-Path $PSScriptRoot "SlashCommands.ps1"),\n' +
'    (Join-Path (Split-Path $PROFILE -ErrorAction SilentlyContinue) "SlashCommands.ps1"),\n' +
'    "$HOME/powershell-profile/SlashCommands.ps1",\n' +
'    "$HOME/OneDrive/Documents/PowerShell/SlashCommands.ps1",\n' +
'    "$HOME/Documents/PowerShell/SlashCommands.ps1",\n' +
'    "$HOME/.config/powershell/SlashCommands.ps1",\n' +
'    (Join-Path (if ($env:APPDATA) { $env:APPDATA } else { "$HOME/.npm-global/lib" }) "npm/node_modules/pwshai/scripts/SlashCommands.ps1")\n' +
')\n' +
'foreach ($sc in $slashCandidates) {\n' +
'    if ($sc -and (Test-Path $sc)) {\n' +
'        . $sc\n' +
'        break\n' +
'    }\n' +
'}\n\n' +
'Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete -ErrorAction SilentlyContinue\n' +
'Set-PSReadLineOption -ShowToolTips -ErrorAction SilentlyContinue\n' +
'Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward -ErrorAction SilentlyContinue\n' +
'Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward -ErrorAction SilentlyContinue\n\n' +
'try {\n' +
'    Set-PSReadLineKeyHandler -Key F2 -Description "Toggle Prediction View Style" -ScriptBlock {\n' +
'        $current = (Get-PSReadLineOption).PredictionViewStyle\n' +
'        if ($current -eq "InlineView") {\n' +
'            Set-PSReadLineOption -PredictionViewStyle ListView\n' +
'        } else {\n' +
'            Set-PSReadLineOption -PredictionViewStyle InlineView\n' +
'        }\n' +
'    }\n' +
'} catch {}\n\n' +
'try {\n' +
'    Set-PSReadLineKeyHandler -Chord "Ctrl+g" -Description "AI Command Generator" -ScriptBlock {\n' +
'        if ($global:AI_ENABLED -eq $false) { return }\n' +
'        $line = $null; $cursor = 0\n' +
'        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)\n' +
'        if ([string]::IsNullOrWhiteSpace($line)) { return }\n' +
'        $res = Invoke-AIProviderEngine -PromptText "Convert to single PowerShell command line: $line" -MaxCandidates 1\n' +
'        if ($res -and $res[0]) {\n' +
'            $bt = [char]96\n' +
'            $pattern = "^$bt{3}(?:powershell|pwsh|sh)?\\s*"\n' +
'            $cleanCmd = ($res[0] -replace $pattern, "") -replace "\\s*$bt{3}$", ""\n' +
'            [Microsoft.PowerShell.PSConsoleReadLine]::Replace(0, $line.Length, $cleanCmd.Trim())\n' +
'        }\n' +
'    }\n' +
'} catch {}\n\n' +
'try {\n' +
'    Set-PSReadLineKeyHandler -Chord "Ctrl+space" -Description "Multi-Candidate AI Autocomplete" -ScriptBlock {\n' +
'        if ($global:AI_ENABLED -eq $false) { return }\n' +
'        $line = $null; $cursor = 0\n' +
'        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)\n' +
'        if ([string]::IsNullOrWhiteSpace($line)) { return }\n' +
'        $candidates = Invoke-AIProviderEngine -PromptText "Complete this PowerShell line: $line" -MaxCandidates 3\n' +
'        if ($candidates -and $candidates.Count -gt 0) {\n' +
'            $bt = [char]96\n' +
'            $pattern = "^$bt{3}(?:powershell|pwsh|sh)?\\s*"\n' +
'            $clean = ($candidates[0] -replace $pattern, "") -replace "\\s*$bt{3}$", ""\n' +
'            [Microsoft.PowerShell.PSConsoleReadLine]::Replace(0, $line.Length, $clean.Trim())\n' +
'        }\n' +
'    }\n' +
'} catch {}\n' +
'# --- END PWSHAI AUTO CONFIG ---\n';

            try {
                fs.appendFileSync(profilePath, configBlock);
                console.log(`${bgBlack}  ${cyan}[*]${reset}${bgBlack} Appended configuration to ${cyan}${profilePath}${reset}`);
            } catch (e) {
                console.warn(`${bgBlack}  ${magenta}[!]${reset}${bgBlack} Could not append to ${profilePath}: ${e.message}${reset}`);
            }
        } else {
            console.log(`${bgBlack}  ${dim}[-] Profile ${profilePath} already configured.${reset}`);
        }
    });

    console.log(`\n${bgBlack}${bold}${cyan}[=] Installation complete!${reset}${bgBlack} Restart PowerShell or run ${bold}${cyan}. $PROFILE${reset}${bgBlack} to activate.\n${reset}`);
}

function status() {
    console.clear();
    const bgBlack = '\x1b[48;2;0;0;0m';
    const cyan = '\x1b[36m';
    const magenta = '\x1b[35m';
    const white = '\x1b[97m';
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    console.log(`\n${bgBlack}${bold}${magenta}┌─── PWSHAI PROFILE STATUS ─────────────┐${reset}`);
    const profiles = getTargetProfiles();
    profiles.forEach((p, idx) => {
        const exists = fs.existsSync(p);
        const icon = exists ? `${cyan}[*]${reset}` : `${magenta}[!]${reset}`;
        const existText = exists ? `${cyan}Installed${reset}` : `${magenta}Not found${reset}`;
        console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${icon} ${bold}Profile ${idx + 1}:${reset}${bgBlack} ${existText}`);
        console.log(`${bgBlack}${magenta}│${reset}${bgBlack}   ${dim}${p}${reset}`);
        if (idx < profiles.length - 1) console.log(`${bgBlack}${magenta}│${reset}`);
    });
    console.log(`${bgBlack}${bold}${magenta}└───────────────────────────────────────┘${reset}\n`);
}

function doctor() {
    console.clear();
    if (doctorLib && doctorLib.runDoctor) {
        doctorLib.runDoctor();
    } else {
        const bgBlack = '\x1b[48;2;0;0;0m';
        const cyan = '\x1b[36m';
        const magenta = '\x1b[35m';
        const white = '\x1b[97m';
        const bold = '\x1b[1m';
        const reset = '\x1b[0m';
        const dim = '\x1b[2m';

        console.log(`\n${bgBlack}${bold}${magenta}┌─── PWSHAI SYSTEM DIAGNOSTICS ─────────┐${reset}`);
        status();
        console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${cyan}Node.js Version:${reset} ${white}${process.version}${reset}`);
        console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${cyan}Platform:${reset}        ${white}${process.platform} ${process.arch}${reset}`);
        try {
            const psVer = execSync('powershell.exe -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"', { encoding: 'utf8' }).trim();
            console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${cyan}PowerShell:${reset}      ${white}${psVer}${reset}`);
        } catch (e) {}
        console.log(`${bgBlack}${bold}${magenta}└───────────────────────────────────────┘${reset}\n`);
    }
}

function loadRegisteredCommands() {
    if (configLib && configLib.loadConfig) {
        return configLib.loadConfig();
    }
    const cmdJsonPath = path.join(__dirname, '..', 'commands.json');
    if (fs.existsSync(cmdJsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(cmdJsonPath, 'utf8'));
            return data.commands || [];
        } catch (e) {}
    }
    return [];
}

function printHelpMenu() {
    console.clear();
    const commands = loadRegisteredCommands();
    const bgBlack = '\x1b[48;2;0;0;0m';
    const cyan = '\x1b[36m';
    const magenta = '\x1b[35m';
    const white = '\x1b[97m';
    const bold = '\x1b[1m';
    const dim = '\x1b[2m';
    const reset = '\x1b[0m';

    console.log(`${bgBlack}${bold}${magenta}┌────────────────────────────────────────────────────────────┐${reset}`);
    console.log(`${bgBlack}${bold}${cyan}│      PWSHAI COMMAND TERMINAL : ORBITAL CONTROL             │${reset}`);
    console.log(`${bgBlack}${bold}${magenta}└────────────────────────────────────────────────────────────┘${reset}\n`);
    
    console.log(`${bgBlack}${bold}${white}[ CORE COMMANDS ]${reset}`);
    console.log(`${bgBlack}  ${cyan}pwshai install${reset}${bgBlack}        - Install & configure PowerShell profiles${reset}`);
    console.log(`${bgBlack}  ${cyan}pwshai status${reset}${bgBlack}         - Display active PowerShell profile status${reset}`);
    console.log(`${bgBlack}  ${cyan}pwshai doctor${reset}${bgBlack}         - Run complete diagnostics check${reset}`);
    console.log(`${bgBlack}  ${cyan}pwshai list${reset}${bgBlack}           - Display this interactive cheatsheet${reset}`);
    console.log(`${bgBlack}  ${cyan}pwshai /<command>${reset}${bgBlack}     - Execute any registered slash shortcut\n${reset}`);

    console.log(`${bgBlack}${bold}${white}[ REGISTERED SLASH COMMANDS ]${reset}`);
    
    const categories = {};
    commands.forEach(cmd => {
        const cat = cmd.category || 'Uncategorized';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(cmd);
    });

    for (const [category, cmds] of Object.entries(categories)) {
        console.log(`${bgBlack}  ${dim}-- ${category} --${reset}`);
        cmds.forEach(cmd => {
            const trigger = (cmd.trigger || '').padEnd(22);
            console.log(`${bgBlack}    ${cyan}${trigger}${reset}${bgBlack} : ${dim}${cmd.description}${reset}`);
        });
        console.log(`${bgBlack}${reset}`);
    }
}

async function pullModel() {
    const prompts = require('prompts');
    const { execSync } = require('child_process');

    const models = [
        { title: 'Gemma 4 E2B', value: 'google/gemma-4-E2B' },
        { title: 'Qwen 3.8 27B Abliterated', value: 'heterodoxin/qwen-3.8-27b-abliterated' },
        { title: 'Qwen3-VL 8B GLM-4.7 Flash Heretic', value: 'mradermacher/Qwen3-VL-8B-GLM-4.7-Flash-Heretic-Uncensored-Thinking-GGUF' },
        { title: 'Ternary Bonsai 8B', value: 'prism-ml/Ternary-Bonsai-8B-gguf' },
        { title: 'Terminus Qwen3 8B i1', value: 'mradermacher/Terminus-Qwen3-8b-i1-GGUF' }
    ];

    const response = await prompts({
        type: 'select',
        name: 'repo',
        message: '🧠 Select a local model to download via HuggingFace CLI:',
        choices: models
    });

    if (response.repo) {
        console.log(`\n\x1b[36m🚀 Downloading ${response.repo}...\x1b[0m`);
        try {
            // Using spawn via executorLib so it looks pretty
            if (executorLib && executorLib.executeCommand) {
                const code = await executorLib.executeCommand('huggingface-cli', ['download', response.repo]);
                if (code !== 0) throw new Error('Command failed with code ' + code);
            } else {
                execSync(`huggingface-cli download ${response.repo}`, { stdio: 'inherit' });
            }
        } catch (e) {
            console.log(`\n\x1b[31m⚠️ Download failed. Ensure huggingface-cli is installed (run /model --install-local).\x1b[0m\n`);
        }
    }
}

async function showConfigWizard() {
    console.clear();
    const bgBlack = '\x1b[48;2;0;0;0m';
    const cyan = '\x1b[36m';
    const magenta = '\x1b[35m';
    const white = '\x1b[97m';
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';

    console.log(`\n${bgBlack}${bold}${magenta}┌─── CONFIGURATION & REGISTRY ───────────┐${reset}`);
    console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${cyan}Active Settings & Local Models:${reset}`);
    console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${reset}`);
    
    // Display the full model paths as requested
    console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${bold}${white}[ Local Model Repositories ]${reset}`);
    const models = [
        { title: 'Gemma 4 E2B', value: 'google/gemma-4-E2B' },
        { title: 'Qwen 3.8 27B Abliterated', value: 'heterodoxin/qwen-3.8-27b-abliterated' },
        { title: 'Qwen3-VL 8B GLM-4.7 Flash Heretic', value: 'mradermacher/Qwen3-VL-8B-GLM-4.7-Flash-Heretic-Uncensored-Thinking-GGUF' },
        { title: 'Ternary Bonsai 8B', value: 'prism-ml/Ternary-Bonsai-8B-gguf' },
        { title: 'Terminus Qwen3 8B i1', value: 'mradermacher/Terminus-Qwen3-8b-i1-GGUF' }
    ];
    
    models.forEach(m => {
        console.log(`${bgBlack}${magenta}│${reset}${bgBlack}   * ${cyan}${m.title.padEnd(35)}${reset}${bgBlack} ${dim}(${m.value})${reset}`);
    });
    
    console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${reset}`);
    console.log(`${bgBlack}${magenta}│${reset}${bgBlack} ${dim}To manage config visually, edit: ~/.wind-commands.json${reset}`);
    console.log(`${bgBlack}${bold}${magenta}└────────────────────────────────────────┘${reset}\n`);
}

async function showInteractiveMenu() {
    console.clear();
    const prompts = require('prompts');
    const commands = loadRegisteredCommands();
    
    // Applying Opencode TUI-like prompt options
    const choices = [
        { title: '[*] Status & Info', value: 'status', description: 'Show current profile install status' },
        { title: '[=] Configuration', value: '/config', description: 'View current settings and local models' },
        { title: '[+] Install Profile', value: 'install', description: 'Configure PSReadLine and slash commands' },
        { title: '[~] Doctor', value: 'doctor', description: 'Run system diagnostics' },
        { title: '[>] UI Effects', value: 'effects', description: 'Launch terminal text effects showcase' },
    ];

    commands.forEach(cmd => {
        choices.push({
            title: `[${cmd.category || 'Misc'}] ${cmd.trigger}`,
            value: cmd.trigger,
            description: cmd.description
        });
    });

    const response = await prompts({
        type: 'autocomplete',
        name: 'command',
        message: 'PWSHAI TERMINAL : Select Command',
        choices: choices,
        suggest: (input, choices) => Promise.resolve(choices.filter(i => i.title.toLowerCase().includes(input.toLowerCase()) || i.description.toLowerCase().includes(input.toLowerCase())))
    });

    if (response.command) {
        // Mock the rawArgs and run again
        rawArgs.length = 0;
        rawArgs.push(...response.command.split(' '));
        const firstOverride = rawArgs[0].toLowerCase();
        
        if (firstOverride === 'status') return status();
        if (firstOverride === 'install') return install();
        if (firstOverride === 'doctor') return doctor();
        if (firstOverride === 'effects') {
            if (windEffects && windEffects.runWindShowcase) {
                return await windEffects.runWindShowcase();
            }
            return;
        }
        if (response.command === '/config') return await showConfigWizard();
        if (response.command === '/model --pull') return await pullModel();

        const matched = commands.find(
            c => c.trigger.toLowerCase() === response.command.toLowerCase() ||
                 (c.aliases && c.aliases.some(a => a.toLowerCase() === response.command.toLowerCase()))
        );

        if (matched && executorLib && executorLib.executeCommand) {
            await executorLib.executeCommand(matched.command, matched.args || [], {
                env: matched.env,
                cwd: matched.cwd
            });
        }
    }
}

async function main() {
    if (rawArgs.length === 0) {
        await showInteractiveMenu();
        return;
    }
    
    if (['help', '--help', '-h', 'list', 'ls', '/help', '/list', '/?', '?'].includes(first)) {
        printHelpMenu();
        return;
    }

    if (first === 'install' || first === 'setup') {
        install();
        return;
    }

    if (first === 'status') {
        status();
        return;
    }

    if (first === 'doctor' || first === 'check' || first === '/doctor') {
        doctor();
        return;
    }

    if (first === '/config' || first === 'config') {
        await showConfigWizard();
        return;
    }

    // Direct command execution from commands.json
    const commands = loadRegisteredCommands();
    let targetInput = rawArgs.join(' ').trim();
    if (first === 'run') {
        targetInput = rawArgs.slice(1).join(' ').trim();
    }

    if (targetInput === '/model --pull' || targetInput === '/pull-model') {
        await pullModel();
        return;
    }

    if (windEffects) {
        if (['effects', 'demo', 'showcase', '/effects', '/texteffects', '/tte'].includes(first)) {
            if (windEffects.runWindShowcase) { await windEffects.runWindShowcase(); return; }
        }
        if (first === 'blow' || first === 'gust') {
            const text = rawArgs.slice(1).join(' ') || 'A brisk zephyr sweeps across the terminal...';
            if (windEffects.animateGust) { await windEffects.animateGust(text, { palette: 'zephyr', duration: 1100 }); return; }
        }
        if (first === 'wave' || first === 'breeze') {
            const text = rawArgs.slice(1).join(' ') || 'Gentle breeze whispering through the canopy...';
            if (windEffects.animateBreezeWave) { await windEffects.animateBreezeWave(text, { iterations: 2, speed: 30 }); return; }
        }
        if (first === 'swirl' || first === 'cyclone' || first === 'vortex') {
            const text = rawArgs.slice(1).join(' ') || 'Cyclone vortex spiraling upwards...';
            if (windEffects.animateSwirl) { await windEffects.animateSwirl(text, { duration: 1200 }); return; }
        }
        if (first === 'dissolve' || first === 'scatter' || first === 'leaves') {
            const text = rawArgs.slice(1).join(' ') || 'Autumn leaves scattering in the gust...';
            if (windEffects.dissolveInWind) { await windEffects.dissolveInWind(text, {}); return; }
        }
        if (first === 'tte' && tteBridge && tteBridge.runTteEffect) {
            const effect = rawArgs[1] || 'waves';
            const text = rawArgs.slice(2).join(' ') || 'Google Antigravity Airflow';
            await tteBridge.runTteEffect(effect, text);
            return;
        }
    }


    const matched = commands.find(
        c => c.trigger.toLowerCase() === targetInput.toLowerCase() ||
             (c.aliases && c.aliases.some(a => a.toLowerCase() === targetInput.toLowerCase()))
    );

    if (matched && executorLib && executorLib.executeCommand) {
        await executorLib.executeCommand(matched.command, matched.args || [], {
            env: matched.env,
            cwd: matched.cwd
        });
        return;
    }

    // Default fallback
    printHelpMenu();
}

main().catch(err => {
    console.error('pwshai Error:', err.message);
    process.exit(1);
});

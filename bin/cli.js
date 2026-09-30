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

        try {
            const outPwsh = execSync('pwsh.exe -NoProfile -NonInteractive -Command "Split-Path $PROFILE"', {
                encoding: 'utf8',
                timeout: 4000,
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
            if (outPwsh && fs.existsSync(outPwsh)) { dirs.add(outPwsh); }
        } catch (e) {}
    }

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
    console.log('⚡ Installing pwshai Supercharged PowerShell AI & Slash Suite...');
    
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
                console.log(`✅ Synced SlashCommands.ps1 to ${targetScript}`);
            } catch (e) {}

            if (fs.existsSync(sourceGlitch)) {
                const targetGlitch = path.join(psDir, 'glitch_effect.py');
                try {
                    fs.copyFileSync(sourceGlitch, targetGlitch);
                    console.log(`✅ Synced glitch_effect.py to ${targetGlitch}`);
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
'    "$env:USERPROFILE\\powershell-profile\\SlashCommands.ps1",\n' +
'    "$env:USERPROFILE\\OneDrive\\Documents\\PowerShell\\SlashCommands.ps1",\n' +
'    "$env:USERPROFILE\\Documents\\PowerShell\\SlashCommands.ps1",\n' +
'    "$env:APPDATA\\npm\\node_modules\\pwshai\\scripts\\SlashCommands.ps1"\n' +
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
                console.log(`✅ Appended pwshai configuration to ${profilePath}`);
            } catch (e) {
                console.warn(`⚠️ Could not append to ${profilePath}: ${e.message}`);
            }
        } else {
            console.log(`ℹ️ Profile ${profilePath} already configured.`);
        }
    });

    console.log('\n🎉 Installation complete! Restart PowerShell or run `. $PROFILE` to activate pwshai.');
}

function status() {
    console.log('=== pwshai Profile Status ===');
    const profiles = getTargetProfiles();
    profiles.forEach(p => {
        console.log(`Profile: ${p} (Exists: ${fs.existsSync(p)})`);
    });
}

function doctor() {
    if (doctorLib && doctorLib.runDoctor) {
        doctorLib.runDoctor();
    } else {
        console.log('=== pwshai Doctor Diagnostics ===');
        status();
        console.log('\nNode.js Version:', process.version);
        console.log('Platform:', process.platform, process.arch);
        try {
            const psVer = execSync('powershell.exe -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"', { encoding: 'utf8' }).trim();
            console.log('PowerShell Version:', psVer);
        } catch (e) {}
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
    const commands = loadRegisteredCommands();
    console.log('\n⚡ ============================================================');
    console.log('       PWSHAI SUPERCHARGED SLASH COMMANDS & AI RUNNER        ');
    console.log('============================================================\n');
    console.log('  Usage:');
    console.log('    pwshai install        - Install & configure PowerShell profiles');
    console.log('    pwshai status         - Display active PowerShell profile status');
    console.log('    pwshai doctor         - Run complete diagnostics check');
    console.log('    pwshai list           - Display this interactive cheatsheet');
    console.log('    pwshai effects        - Launch terminal text effects showcase');
    console.log('    pwshai blow <text>    - Animate wind gust over text');
    console.log('    pwshai wave <text>    - Animate breeze wave over text');
    console.log('    pwshai swirl <text>   - Animate vortex cyclone swirl');
    console.log('    pwshai dissolve <txt> - Animate leaf dispersal in wind');
    console.log('    pwshai /<command>     - Execute any registered slash shortcut\n');

    console.log('  Registered Triggers:');
    commands.forEach(cmd => {
        const trigger = (cmd.trigger || '').padEnd(16);
        console.log(`    ${trigger} : ${cmd.description}`);
    });
    console.log('');
}

async function main() {
    if (rawArgs.length === 0 || ['help', '--help', '-h', 'list', 'ls', '/help', '/list', '/?', '?'].includes(first)) {
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

    // Direct command execution from commands.json
    const commands = loadRegisteredCommands();
    let targetInput = rawArgs.join(' ').trim();
    if (first === 'run') {
        targetInput = rawArgs.slice(1).join(' ').trim();
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

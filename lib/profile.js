// Profile health: audit and repair the PowerShell profiles pwshai lives in.
//
// Why this exists (#pwshai/chord): the profile block that binds the AI
// multi-candidate autocomplete shipped as `-Chord "Ctrl+space"`. PSReadLine only
// accepts System.ConsoleKey names, so every session threw
//   Unrecognized key 'space'. Please use a character literal or a well-known key
//   name from the System.ConsoleKey enumeration.
// inside a `try {} catch {}` — the keybinding died silently, so the feature was
// simply missing and nothing pointed at it.
//
// Two habits follow from that:
//   * repair is idempotent and backs the file up before touching it
//   * doctor reports the facts that would have caught it (shell version, profile
//     path, PSReadLine version, CompletionPredictor, profile load errors)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Chord spellings PSReadLine rejects, mapped to the ConsoleKey name it wants.
const CHORD_FIXES = [
    [/Ctrl\+space\b/g, 'Ctrl+Spacebar'],
    [/Ctrl\+Space(?!bar)\b/g, 'Ctrl+Spacebar'],
    [/Ctrl\+spacebar\b/g, 'Ctrl+Spacebar'],
    [/Ctrl\+SpaceBar\b/g, 'Ctrl+Spacebar'],
];

const SHELLS = [
    { exe: 'powershell.exe', label: 'Windows PowerShell' },
    { exe: 'pwsh.exe', label: 'PowerShell 7' },
];

function runPowerShell(exe, script, { loadProfile = false, timeout = 20000 } = {}) {
    const args = ['-NonInteractive'];
    if (!loadProfile) args.push('-NoProfile');
    args.push('-Command', script);
    try {
        return execFileSync(exe, args, {
            encoding: 'utf-8',
            timeout,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch (e) {
        const out = (e && e.stdout) ? String(e.stdout).trim() : '';
        return out;
    }
}

function probeShell(shell, { loadProfile = false } = {}) {
    const script = [
        '$i = [ordered]@{}',
        '$i.shell = $PSVersionTable.PSVersion.ToString()',
        '$i.edition = $PSVersionTable.PSEdition',
        '$i.profile = [string]$PROFILE',
        '$i.profileExists = [bool](Test-Path -LiteralPath $PROFILE)',
        '$m = Get-Module PSReadLine -ListAvailable | Sort-Object Version -Descending | Select-Object -First 1',
        '$i.psreadline = if ($m) { $m.Version.ToString() } else { "" }',
        '$i.completionPredictor = [bool](Get-Module CompletionPredictor -ListAvailable)',
        '$i.slashFunctions = @(Get-Command Invoke-Slash* -ErrorAction SilentlyContinue).Count',
        '$i.loadErrors = @($Error | ForEach-Object { $_.ToString() } | Select-Object -Unique -First 3)',
        'ConvertTo-Json -InputObject $i -Compress',
    ].join('; ');
    const raw = runPowerShell(shell.exe, script, { loadProfile });
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw.split('\n').pop());
        parsed.label = shell.label;
        parsed.executable = shell.exe;
        parsed.loadErrors = Array.isArray(parsed.loadErrors)
            ? parsed.loadErrors
            : (parsed.loadErrors ? [parsed.loadErrors] : []);
        return parsed;
    } catch {
        return null;
    }
}

// Cheap facts (no profile load) for the shells that actually exist on this box.
function shells() {
    const found = [];
    for (const shell of SHELLS) {
        const info = probeShell(shell, { loadProfile: false });
        if (info && info.shell) found.push(info);
    }
    return found;
}

// Doctor view: same facts plus what the profile does when it actually runs.
function health({ loadProfile = true } = {}) {
    const rows = [];
    for (const shell of SHELLS) {
        const info = probeShell(shell, { loadProfile });
        if (!info || !info.shell) continue;
        const badChords = info.profile && fs.existsSync(info.profile)
            ? countBadChords(fs.readFileSync(info.profile, 'utf-8'))
            : 0;
        rows.push({ ...info, badChords });
    }
    return rows;
}

function countBadChords(text) {
    let count = 0;
    for (const [pattern] of CHORD_FIXES) {
        const matches = String(text).match(pattern);
        if (matches) count += matches.length;
    }
    return count;
}

function applyChordFixes(text) {
    let out = String(text);
    let changed = 0;
    for (const [pattern, replacement] of CHORD_FIXES) {
        out = out.replace(pattern, (match) => {
            if (match === replacement) return match;
            changed += 1;
            return replacement;
        });
    }
    return { text: out, changed };
}

function backupPath(file) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${file}.pwshai-${stamp}.bak`;
}

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);

function replaceAll(haystack, needle, replacement) {
    return haystack.split(needle).join(replacement);
}

// A profile here is a chain, not a file: the pwsh 7 profile dot-sources
// "$env:USERPROFILE\powershell-profile\Microsoft.PowerShell_profile.ps1", and that
// file is where the AI autocomplete block actually lives. Repairing only $PROFILE
// fixed the wrapper and left the broken chord behind, so the chain is followed.
function expandProfilePath(raw, fromFile) {
    let value = String(raw).trim();
    const quotes = ['"', "'"];
    if (value.length >= 2 && quotes.includes(value[0]) && value[value.length - 1] === value[0]) {
        value = value.slice(1, -1);
    }
    if (!value) return null;
    const home = process.env.USERPROFILE || process.env.HOME || '';
    value = replaceAll(value, '$env:USERPROFILE', home);
    value = replaceAll(value, '${env:USERPROFILE}', home);
    value = replaceAll(value, '%USERPROFILE%', home);
    value = replaceAll(value, '$HOME', home);
    value = replaceAll(value, '$PSScriptRoot', path.dirname(fromFile));
    if (value.startsWith('~')) value = home + value.slice(1);
    if (!path.isAbsolute(value)) value = path.resolve(path.dirname(fromFile), value);
    return value;
}

function dotSourcedFiles(file, depth = 0, seen = new Set()) {
    if (depth > 3 || seen.has(file.toLowerCase())) return [];
    seen.add(file.toLowerCase());
    let text;
    try {
        text = fs.readFileSync(file, 'utf-8');
    } catch {
        return [];
    }
    const found = [];
    for (let line of text.split(NL)) {
        line = replaceAll(line, CR, '');
        const trimmed = line.trimStart();
        // Only a leading dot-source (". path") pulls another profile file in.
        if (!trimmed.startsWith('.') || trimmed.startsWith('..')) continue;
        const rest = trimmed.slice(1).trim();
        if (!rest || !/\.ps(m|1|d1)\b/i.test(rest)) continue;
        const target = expandProfilePath(rest.split(' #')[0], file);
        if (!target) continue;
        found.push(target);
        found.push(...dotSourcedFiles(target, depth + 1, seen));
    }
    return found;
}

// Audit + optionally repair every file in every shell's dot-source chain.
// Idempotent: a second run reports `ok` and writes nothing.
function repairProfiles({ write = false } = {}) {
    const byFile = new Map();
    for (const shell of shells()) {
        const profilePath = shell.profile ? String(shell.profile) : '';
        if (!profilePath) continue;
        const chain = [profilePath, ...dotSourcedFiles(profilePath)];
        for (const file of chain) {
            const key = file.toLowerCase();
            const existing = byFile.get(key) || { profile: file, shells: [], status: 'ok' };
            if (!existing.shells.includes(shell.label)) existing.shells.push(shell.label);
            byFile.set(key, existing);
        }
    }

    const results = [];
    for (const row of byFile.values()) {
        const file = row.profile;
        if (!fs.existsSync(file)) {
            results.push({ ...row, status: 'missing' });
            continue;
        }
        let original;
        try {
            original = fs.readFileSync(file, 'utf-8');
        } catch (e) {
            results.push({ ...row, status: 'unreadable', detail: e.message });
            continue;
        }
        const { text, changed } = applyChordFixes(original);
        if (!changed) {
            results.push({ ...row, status: 'ok' });
            continue;
        }
        if (!write) {
            results.push({ ...row, status: 'would-repair', changed });
            continue;
        }
        try {
            fs.copyFileSync(file, backupPath(file));
            fs.writeFileSync(file, text, 'utf-8');
            results.push({ ...row, status: 'repaired', changed });
        } catch (e) {
            results.push({ ...row, status: 'failed', detail: e.message });
        }
    }
    return results;
}

// The Windows PowerShell 5.1 inbox PSReadLine is 2.0.0, which has no
// -PredictionSource parameter at all: the shipped profile block then throws
// "A parameter cannot be found that matches parameter name 'PredictionSource'"
// on every session. That is what silently removed the prediction features for
// anyone whose terminal profile still resolves to 5.1.
const PSREADLINE_MIN = '2.2.6';

function shellExists(exe) {
    try {
        execFileSync(exe, ['-NoProfile', '-NonInteractive', '-Command', '1'], {
            timeout: 10000, windowsHide: true, stdio: 'ignore',
        });
        return true;
    } catch {
        return false;
    }
}

function versionAtLeast(have, want) {
    const a = String(have || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const b = String(want || '0').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x > y) return true;
        if (x < y) return false;
    }
    return true;
}

function probeModule(exe, module) {
    const script = [
        '$m = Get-Module ' + module + ' -ListAvailable | Sort-Object Version -Descending | Select-Object -First 1',
        '$p = Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue',
        '$o = [ordered]@{}',
        '$o.version = if ($m) { $m.Version.ToString() } else { "" }',
        '$o.ok = [bool]$m',
        '$o.canPredict = [bool]($p -and $p.Parameters.ContainsKey("PredictionSource"))',
        '$o | ConvertTo-Json -Compress',
    ].join('; ');
    const raw = runPowerShell(exe, script, { timeout: 20000 });
    if (!raw) return { version: '', ok: false, canPredict: false };
    try {
        return JSON.parse(raw.split(NL).pop());
    } catch {
        return { version: '', ok: false, canPredict: false };
    }
}

function installModule(exe, module, extra) {
    const script = [
        'try {',
        '  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
        '  if (-not (Get-PackageProvider -Name NuGet -ListAvailable -ErrorAction SilentlyContinue)) {',
        '    Install-PackageProvider -Name NuGet -Force -Scope CurrentUser -Confirm:$false -ErrorAction Stop | Out-Null',
        '  }',
        '  Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue',
        '  Install-Module ' + module + ' -Scope CurrentUser -Force -AllowClobber -Confirm:$false -ErrorAction Stop ' + (extra || ''),
        '  "installed"',
        '} catch { "failed: " + $_.Exception.Message }',
    ].join('; ');
    try {
        const out = execFileSync(exe, ['-NonInteractive', '-NoProfile', '-Command', script], {
            encoding: 'utf-8', timeout: 180000, windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim().split(NL).pop();
        return out || 'skipped';
    } catch (e) {
        return 'failed: ' + ((e && e.message) || 'unknown');
    }
}

// Old PSReadLine cannot accept the prediction switches at all: upgrade it for the
// current user so the profile block stops throwing on every session.
function ensurePSReadLine({ write = false } = {}) {
    const results = [];
    for (const shell of SHELLS) {
        if (!shellExists(shell.exe)) continue;
        const state = probeModule(shell.exe, 'PSReadLine');
        const modern = state.ok && versionAtLeast(state.version, PSREADLINE_MIN);
        if (modern) {
            results.push({ shell: shell.label, status: 'ok', version: state.version, canPredict: state.canPredict });
            continue;
        }
        if (!write) {
            results.push({ shell: shell.label, status: 'old', version: state.version, canPredict: state.canPredict });
            continue;
        }
        const status = installModule(shell.exe, 'PSReadLine',
            "-MinimumVersion '" + PSREADLINE_MIN + "' -SkipPublisherCheck");
        results.push({ shell: shell.label, status, version: state.version, canPredict: state.canPredict });
    }
    return results;
}

// CompletionPredictor is a PowerShell 7 module in practice: 5.1 will not list it
// even with the files present, so the status is reported per shell instead of one
// "installed" that lies to half the machine.
function ensureCompletionPredictor({ write = false } = {}) {
    const results = [];
    for (const shell of SHELLS) {
        if (!shellExists(shell.exe)) continue;
        const state = probeModule(shell.exe, 'CompletionPredictor');
        if (state.ok) {
            results.push({ shell: shell.label, status: 'present', version: state.version });
            continue;
        }
        if (!write) {
            results.push({ shell: shell.label, status: 'missing' });
            continue;
        }
        const status = installModule(shell.exe, 'CompletionPredictor');
        results.push({ shell: shell.label, status });
    }
    if (!results.length) return { status: 'skipped', results: [] };
    const good = results.find((r) => r.status === 'present' || r.status === 'installed');
    if (good) return { status: good.status, results };
    const failed = results.find((r) => String(r.status).startsWith('failed'));
    return {
        status: 'failed',
        detail: failed ? String(failed.status).replace(/^failed:\s*/, '') : 'not installed',
        results,
    };
}

module.exports = {
    shells,
    health,
    repairProfiles,
    ensurePSReadLine,
    ensureCompletionPredictor,
    countBadChords,
    applyChordFixes,
};

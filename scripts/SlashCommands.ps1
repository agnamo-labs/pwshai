# =============================================================================
# PowerShell Supercharged Slash Commands, Theme Engine & AI Suite
# (WindowsPowerShell 5.1 & PowerShell 7+)
# =============================================================================

# Global state initialization
$global:AI_ENABLED = $true

# Load Orbital Vault Keys from ~/.hermes/.env
$envFile = Join-Path $HOME ".hermes\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match "^([^#=]+)=(.*)$" } | ForEach-Object {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

if (-not $global:AI_PROVIDER) {
    $global:AI_PROVIDER = if ($env:AI_PROVIDER) { $env:AI_PROVIDER } else { "gemini" }
}
if (-not $global:THEME) {
    $global:THEME = if ($env:POWER_THEME) { $env:POWER_THEME } else { "blue" }
}

# -----------------------------------------------------------------------------
# Helper: Resolve Glitch Effect Python Script Path
# -----------------------------------------------------------------------------
function Get-GlitchScriptPath {
    $candidates = @(
        (Join-Path $PSScriptRoot "glitch_effect.py"),
        "$env:USERPROFILE\powershell-profile\glitch_effect.py",
        "$env:USERPROFILE\OneDrive\Documents\PowerShell\glitch_effect.py",
        "$env:USERPROFILE\Documents\PowerShell\glitch_effect.py",
        "$env:APPDATA\npm\node_modules\pwshai\scripts\glitch_effect.py",
        "Z:\luxdev-z\Dev\plugins\pwshai\scripts\glitch_effect.py"
    )
    foreach ($cand in $candidates) {
        if ($cand -and (Test-Path $cand)) { return $cand }
    }
    return $null
}

# -----------------------------------------------------------------------------
# Core Theme Engine & Appearance Presets
# -----------------------------------------------------------------------------
function Invoke-ApplyTheme {
    param([string]$ThemeName)
    
    $clean = $ThemeName.ToLower()
    $global:THEME = $clean
    $env:POWER_THEME = $clean
    try {
        [System.Environment]::SetEnvironmentVariable("POWER_THEME", $clean, "User")
    } catch {}

    switch ($clean) {
        "matrix" {
            $host.UI.RawUI.ForegroundColor = "Green"
            if ($host.Name -eq 'ConsoleHost' -or $host.Name -eq 'Visual Studio Code Host') {
                try {
                    Set-PSReadLineOption -Colors @{
                        InlinePrediction = 'Green'
                        Command = 'BrightGreen'
                        Parameter = 'DarkGreen'
                        String = 'Green'
                    } -ErrorAction SilentlyContinue
                } catch {}
            }
            Write-Host "[THEME] Matrix / Cyber Green theme applied!" -ForegroundColor Green
        }
        "neon" {
            $host.UI.RawUI.ForegroundColor = "Yellow"
            if ($host.Name -eq 'ConsoleHost' -or $host.Name -eq 'Visual Studio Code Host') {
                try {
                    Set-PSReadLineOption -Colors @{
                        InlinePrediction = 'Magenta'
                        Command = 'Yellow'
                        Parameter = 'Cyan'
                        String = 'DarkYellow'
                    } -ErrorAction SilentlyContinue
                } catch {}
            }
            Write-Host "[THEME] Neon / Cyberpunk theme applied!" -ForegroundColor Magenta
        }
        "dracula" {
            $host.UI.RawUI.ForegroundColor = "White"
            if ($host.Name -eq 'ConsoleHost' -or $host.Name -eq 'Visual Studio Code Host') {
                try {
                    Set-PSReadLineOption -Colors @{
                        InlinePrediction = 'Cyan'
                        Command = 'Magenta'
                        Parameter = 'DarkCyan'
                        String = 'Yellow'
                    } -ErrorAction SilentlyContinue
                } catch {}
            }
            Write-Host "[THEME] Dracula Soft Dark theme applied!" -ForegroundColor DarkCyan
        }
        "dark" {
            $host.UI.RawUI.ForegroundColor = "Gray"
            if ($host.Name -eq 'ConsoleHost' -or $host.Name -eq 'Visual Studio Code Host') {
                try {
                    Set-PSReadLineOption -Colors @{
                        InlinePrediction = 'DarkGray'
                        Command = 'White'
                        Parameter = 'Yellow'
                        String = 'DarkYellow'
                    } -ErrorAction SilentlyContinue
                } catch {}
            }
            Write-Host "[THEME] Dark Minimal theme applied!" -ForegroundColor Gray
        }
        default {
            $host.UI.RawUI.ForegroundColor = "White"
            if ($host.Name -eq 'ConsoleHost' -or $host.Name -eq 'Visual Studio Code Host') {
                try {
                    Set-PSReadLineOption -Colors @{
                        InlinePrediction = 'Cyan'
                        Command = 'BrightWhite'
                        Parameter = 'Cyan'
                        String = 'DarkCyan'
                    } -ErrorAction SilentlyContinue
                } catch {}
            }
            Write-Host "[THEME] Blue / Cyan theme applied!" -ForegroundColor Cyan
        }
    }
}

# -----------------------------------------------------------------------------
# /theme - Dynamic Appearance Preset Switcher
# -----------------------------------------------------------------------------
function Invoke-SlashTheme {
    param([string]$Name)
    $validThemes = @('blue', 'dark', 'matrix', 'neon', 'dracula', 'default', 'config', 'list')
    
    if ([string]::IsNullOrWhiteSpace($Name) -or $Name -eq 'config' -or $Name -eq 'list') {
        Write-Host ""
        Write-Host "=== Appearance Theme Configuration ===" -ForegroundColor Cyan
        Write-Host "  Active Theme: $global:THEME" -ForegroundColor Green
        Write-Host "  Presets:      blue, dark, matrix, neon, dracula, default" -ForegroundColor White
        Write-Host "  Usage:        /theme <name>" -ForegroundColor Gray
        Write-Host ""
        return
    }

    $clean = $Name.ToLower()
    if ($validThemes -contains $clean) {
        Invoke-ApplyTheme -ThemeName $clean
    } else {
        Write-Host "[ERR] Invalid theme '$Name'." -ForegroundColor Red
        Write-Host "Allowed presets: blue, dark, matrix, neon, dracula, default" -ForegroundColor Yellow
    }
}
Set-Alias -Name /theme -Value Invoke-SlashTheme -Option AllScope -ErrorAction SilentlyContinue

if (Get-Command Register-ArgumentCompleter -ErrorAction SilentlyContinue) {
    Register-ArgumentCompleter -CommandName '/theme' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        $themes = @('blue', 'dark', 'matrix', 'neon', 'dracula', 'default', 'config', 'list')
        $themes | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}

# -----------------------------------------------------------------------------
# Core AI Request Engine (Gemini, OpenAI, Claude, DeepSeek, Local, etc.)
# -----------------------------------------------------------------------------
function Invoke-AIProviderEngine {
    param(
        [string]$PromptText,
        [int]$MaxCandidates = 1
    )
    
    if (-not $global:AI_ENABLED) { return $null }
    
    $provider = if ($global:AI_PROVIDER) { $global:AI_PROVIDER.ToLower() } else { "gemini" }
    
    switch ($provider) {
        "local" {
            try {
                $body = @{ model = "llama3"; prompt = $PromptText; stream = $false } | ConvertTo-Json
                $res = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 8
                return @($res.response.Trim())
            } catch { return $null }
        }
        "openai" {
            $key = $env:OPENAI_API_KEY
            if (-not $key) { return $null }
            try {
                $body = @{
                    model = "gpt-4o-mini";
                    messages = @(@{ role = "user"; content = $PromptText });
                    n = $MaxCandidates
                } | ConvertTo-Json -Depth 5
                $res = Invoke-RestMethod -Uri "https://api.openai.com/v1/chat/completions" -Method Post -Headers @{ Authorization = "Bearer $key" } -Body $body -ContentType "application/json" -TimeoutSec 10
                return $res.choices | ForEach-Object { $_.message.content.Trim() }
            } catch { return $null }
        }
        "deepseek" {
            $key = if ($env:DEEPSEEK_API_KEY) { $env:DEEPSEEK_API_KEY } else { $env:OPENAI_API_KEY }
            if (-not $key) { return $null }
            try {
                $body = @{
                    model = "deepseek-chat";
                    messages = @(@{ role = "user"; content = $PromptText });
                    n = $MaxCandidates
                } | ConvertTo-Json -Depth 5
                $res = Invoke-RestMethod -Uri "https://api.deepseek.com/v1/chat/completions" -Method Post -Headers @{ Authorization = "Bearer $key" } -Body $body -ContentType "application/json" -TimeoutSec 10
                return $res.choices | ForEach-Object { $_.message.content.Trim() }
            } catch { return $null }
        }
        default {
            $key = $env:GEMINI_API_KEY
            if (-not $key) { return $null }
            try {
                $body = @{
                    contents = @(
                        @{ parts = @( @{ text = $PromptText } ) }
                    );
                    generationConfig = @{ candidateCount = $MaxCandidates }
                } | ConvertTo-Json -Depth 5
                
                $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$key"
                $res = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $body -TimeoutSec 10
                return $res.candidates | ForEach-Object { $_.content.parts[0].text.Trim() }
            } catch { return $null }
        }
    }
}

# -----------------------------------------------------------------------------
# /provider & Model Direct Shortcuts (/opencode, /claude, /chatgpt, /openai)
# -----------------------------------------------------------------------------
function Invoke-SlashProvider {
    param([string]$Name)
    $validProviders = @('opencode', 'openai', 'gemini', 'kimi', 'deepseek', 'local', 'claude', 'wiro', 'nitemcp')
    
    if ([string]::IsNullOrWhiteSpace($Name)) {
        Write-Host "[AI] Current Provider: " -NoNewline -ForegroundColor Cyan
        Write-Host "$global:AI_PROVIDER" -ForegroundColor Green
        Write-Host "Available providers: $($validProviders -join ', ')" -ForegroundColor White
        Write-Host "Usage: /provider <name>" -ForegroundColor Gray
        return
    }

    $cleanName = $Name.ToLower()
    if ($validProviders -contains $cleanName) {
        $global:AI_PROVIDER = $cleanName
        $env:AI_PROVIDER = $cleanName
        try {
            [System.Environment]::SetEnvironmentVariable("AI_PROVIDER", $cleanName, "User")
        } catch {}
        Write-Host "[OK] Active AI Provider switched to: " -NoNewline -ForegroundColor Green
        Write-Host "$cleanName" -ForegroundColor Cyan
    } else {
        Write-Host "[ERR] Invalid provider '$Name'." -ForegroundColor Red
        Write-Host "Allowed providers: $($validProviders -join ', ')" -ForegroundColor Yellow
    }
}
Set-Alias -Name /provider -Value Invoke-SlashProvider -Option AllScope -ErrorAction SilentlyContinue

if (Get-Command Register-ArgumentCompleter -ErrorAction SilentlyContinue) {
    Register-ArgumentCompleter -CommandName '/provider' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        $providers = @('opencode', 'openai', 'gemini', 'kimi', 'deepseek', 'local', 'claude', 'wiro', 'nitemcp')
        $providers | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}

function Invoke-SlashOpencode { Invoke-SlashProvider -Name "opencode" }
Set-Alias -Name /opencode -Value Invoke-SlashOpencode -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /oepncode -Value Invoke-SlashOpencode -Option AllScope -ErrorAction SilentlyContinue

function Invoke-SlashClaude { Invoke-SlashProvider -Name "claude" }
Set-Alias -Name /claude -Value Invoke-SlashClaude -Option AllScope -ErrorAction SilentlyContinue

function Invoke-SlashChatgpt { Invoke-SlashProvider -Name "openai" }
Set-Alias -Name /chatgpt -Value Invoke-SlashChatgpt -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /openai -Value Invoke-SlashChatgpt -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /models - List Local and Available AI Models
# -----------------------------------------------------------------------------
function Invoke-SlashModels {
    Write-Host ""
    Write-Host "=== Local & Available Models ===" -ForegroundColor Cyan
    Write-Host "  Active AI Provider: $global:AI_PROVIDER" -ForegroundColor Green
    
    try {
        $ollama = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($ollama -and $ollama.models) {
            Write-Host "`nOllama Local Models:" -ForegroundColor Yellow
            $ollama.models | ForEach-Object {
                $size = [math]::Round($_.size / 1GB, 2)
                Write-Host "   - $($_.name) ($size GB)" -ForegroundColor White
            }
        } else {
            Write-Host "`nOllama Local: Not running on http://localhost:11434" -ForegroundColor Gray
        }
    } catch {
        Write-Host "`nOllama Local: Not running on http://localhost:11434" -ForegroundColor Gray
    }

    if (Get-Command gemini -ErrorAction SilentlyContinue) {
        Write-Host "`nGemini CLI: Installed & Available" -ForegroundColor Yellow
    }
    if (Get-Command opencode -ErrorAction SilentlyContinue) {
        Write-Host "OpenCode CLI: Installed & Available" -ForegroundColor Yellow
    }
    Write-Host ""
}
Set-Alias -Name /models -Value Invoke-SlashModels -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /keys - Manage API Keys (-stored, -test, -list, -add)
# -----------------------------------------------------------------------------
function Invoke-SlashKeys {
    param(
        [Parameter(Position=0)]
        [string]$Subcommand = "-list",
        [Parameter(Position=1)]
        [string]$KeyName,
        [Parameter(Position=2)]
        [string]$KeyValue
    )

    $cleanSub = if ($Subcommand) { $Subcommand.ToLower().TrimStart('-') } else { "list" }

    switch ($cleanSub) {
        "stored" {
            Write-Host ""
            Write-Host "=== Stored API Key Environment Variables ===" -ForegroundColor Cyan
            $keys = @('GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'AI_PROVIDER', 'POWER_THEME')
            foreach ($k in $keys) {
                $val = [System.Environment]::GetEnvironmentVariable($k, "User")
                if (-not $val) { $val = Get-Item "env:$k" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Value }
                if ($val) {
                    $masked = if ($val.Length -gt 8) { $val.Substring(0, 6) + "..." + $val.Substring($val.Length - 2) } else { "*****" }
                    Write-Host "  $($k.PadRight(20)) : $masked" -ForegroundColor Green
                } else {
                    Write-Host "  $($k.PadRight(20)) : (Not Set)" -ForegroundColor Gray
                }
            }
            Write-Host ""
        }
        "test" {
            Write-Host ""
            Write-Host "=== Testing Provider Connectivity ===" -ForegroundColor Cyan
            
            if ($env:GEMINI_API_KEY) {
                try {
                    $url = "https://generativelanguage.googleapis.com/v1beta/models?key=$env:GEMINI_API_KEY"
                    $res = Invoke-RestMethod -Uri $url -TimeoutSec 4
                    Write-Host "  [Gemini API]    : Connected successfully!" -ForegroundColor Green
                } catch {
                    Write-Host "  [Gemini API]    : Connection failed ($($_.Exception.Message))" -ForegroundColor Red
                }
            } else {
                Write-Host "  [Gemini API]    : GEMINI_API_KEY is missing" -ForegroundColor Yellow
            }

            if ($env:OPENAI_API_KEY) {
                try {
                    $res = Invoke-RestMethod -Uri "https://api.openai.com/v1/models" -Headers @{ Authorization = "Bearer $env:OPENAI_API_KEY" } -TimeoutSec 4
                    Write-Host "  [OpenAI API]    : Connected successfully!" -ForegroundColor Green
                } catch {
                    Write-Host "  [OpenAI API]    : Connection failed ($($_.Exception.Message))" -ForegroundColor Red
                }
            } else {
                Write-Host "  [OpenAI API]    : OPENAI_API_KEY is missing" -ForegroundColor Yellow
            }

            try {
                $res = Invoke-RestMethod -Uri "http://localhost:11434/api/version" -TimeoutSec 2
                Write-Host "  [Local Ollama]  : Connected (v$($res.version))" -ForegroundColor Green
            } catch {
                Write-Host "  [Local Ollama]  : Not running on http://localhost:11434" -ForegroundColor Gray
            }
            Write-Host ""
        }
        "add" {
            if ([string]::IsNullOrWhiteSpace($KeyName) -or [string]::IsNullOrWhiteSpace($KeyValue)) {
                Write-Host "Usage: /keys -add <KEY_NAME> <VALUE>" -ForegroundColor Yellow
                Write-Host "Example: /keys -add OPENAI_API_KEY sk-proj-..." -ForegroundColor Gray
                return
            }
            $cleanName = $KeyName.ToUpper()
            if (-not $cleanName.EndsWith("_KEY") -and -not $cleanName.EndsWith("_PROVIDER")) {
                if (-not $cleanName.Contains("_")) { $cleanName = "${cleanName}_API_KEY" }
            }
            Set-Item "env:$cleanName" $KeyValue
            [System.Environment]::SetEnvironmentVariable($cleanName, $KeyValue, "User")
            Write-Host "[OK] Saved $cleanName to Environment & User Profile!" -ForegroundColor Green
        }
        default {
            Write-Host ""
            Write-Host "=== API Keys & Configuration Status ===" -ForegroundColor Cyan
            Write-Host "  /keys -stored     : Show stored API keys" -ForegroundColor White
            Write-Host "  /keys -test       : Test connectivity to API endpoints" -ForegroundColor White
            Write-Host "  /keys -list       : Display this list status" -ForegroundColor White
            Write-Host "  /keys -add K V    : Save a new API key" -ForegroundColor White
            Write-Host ""
            Write-Host "Current Status:" -ForegroundColor Yellow
            Write-Host "  GEMINI_API_KEY    : $(if ($env:GEMINI_API_KEY) { 'Configured' } else { 'Not Set' })" -ForegroundColor $(if ($env:GEMINI_API_KEY) { 'Green' } else { 'Gray' })
            Write-Host "  OPENAI_API_KEY    : $(if ($env:OPENAI_API_KEY) { 'Configured' } else { 'Not Set' })" -ForegroundColor $(if ($env:OPENAI_API_KEY) { 'Green' } else { 'Gray' })
            Write-Host "  ANTHROPIC_API_KEY : $(if ($env:ANTHROPIC_API_KEY) { 'Configured' } else { 'Not Set' })" -ForegroundColor $(if ($env:ANTHROPIC_API_KEY) { 'Green' } else { 'Gray' })
            Write-Host "  DEEPSEEK_API_KEY  : $(if ($env:DEEPSEEK_API_KEY) { 'Configured' } else { 'Not Set' })" -ForegroundColor $(if ($env:DEEPSEEK_API_KEY) { 'Green' } else { 'Gray' })
            Write-Host ""
        }
    }
}
Set-Alias -Name /keys -Value Invoke-SlashKeys -Option AllScope -ErrorAction SilentlyContinue

if (Get-Command Register-ArgumentCompleter -ErrorAction SilentlyContinue) {
    Register-ArgumentCompleter -CommandName '/keys' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        $subcommands = @('-stored', '-test', '-list', '-add')
        $subcommands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}

function Invoke-SlashKey {
    param([string]$NewKey)
    if ([string]::IsNullOrWhiteSpace($NewKey)) {
        Invoke-SlashKeys -Subcommand "-stored"
    } else {
        Invoke-SlashKeys -Subcommand "-add" -KeyName "GEMINI_API_KEY" -KeyValue $NewKey
    }
}
Set-Alias -Name /key -Value Invoke-SlashKey -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /agy - Launch Antigravity CLI with modes & flags
# -----------------------------------------------------------------------------
function Invoke-SlashAgy {
    param(
        [Parameter(ValueFromRemainingArguments=$true)]
        [string[]]$Args
    )
    if ($Args -and ($Args[0] -eq 'd' -or $Args[0] -eq 'yolo' -or $Args[0] -eq '-d' -or $Args[0] -eq '--dangerously-skip-permissions')) {
        $remaining = if ($Args.Length -gt 1) { $Args[1..($Args.Length - 1)] } else { @() }
        Write-Host "[AGY] Launching Antigravity CLI in Dangerously Skip Permissions mode..." -ForegroundColor Yellow
        agy --dangerously-skip-permissions @remaining
    } else {
        agy @Args
    }
}
Set-Alias -Name /agy -Value Invoke-SlashAgy -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /yolo -Value Invoke-SlashAgy -Option AllScope -ErrorAction SilentlyContinue

if (Get-Command Register-ArgumentCompleter -ErrorAction SilentlyContinue) {
    Register-ArgumentCompleter -CommandName '/agy' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        @('-d', '--yolo', '--dangerously-skip-permissions', 'yolo', 'd') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}

# -----------------------------------------------------------------------------
# /npm - NPM Package Management & Global Updater
# -----------------------------------------------------------------------------
function Invoke-SlashNpm {
    param(
        [Parameter(ValueFromRemainingArguments=$true)]
        [string[]]$Args
    )
    if ($Args -and ($Args[0] -eq '-u' -or $Args[0] -eq '--update' -or $Args[0] -eq 'update' -or $Args[0] -eq 'up')) {
        Write-Host "[NPM] Updating all global npm packages..." -ForegroundColor Cyan
        npm update -g
    } else {
        npm @Args
    }
}
Set-Alias -Name /npm -Value Invoke-SlashNpm -Option AllScope -ErrorAction SilentlyContinue

if (Get-Command Register-ArgumentCompleter -ErrorAction SilentlyContinue) {
    Register-ArgumentCompleter -CommandName '/npm' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        @('-u', 'update', 'install', 'list', 'outdated', 'audit') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}

# -----------------------------------------------------------------------------
# /wing & /winget - Windows Package Manager Upgrade Suite
# -----------------------------------------------------------------------------
function Invoke-SlashWing {
    param(
        [Parameter(ValueFromRemainingArguments=$true)]
        [string[]]$Args
    )
    if ($Args -and ($Args[0] -eq '-u' -or $Args[0] -eq '--update' -or $Args[0] -eq 'update' -or $Args[0] -eq 'upgrade')) {
        Write-Host "[WINGET] Upgrading all packages with automatic license agreement..." -ForegroundColor Cyan
        winget upgrade --all --include-unknown --accept-source-agreements --accept-package-agreements
    } else {
        winget @Args
    }
}
Set-Alias -Name /wing -Value Invoke-SlashWing -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /winget -Value Invoke-SlashWing -Option AllScope -ErrorAction SilentlyContinue

if (Get-Command Register-ArgumentCompleter -ErrorAction SilentlyContinue) {
    Register-ArgumentCompleter -CommandName '/wing' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        @('-u', 'upgrade', 'search', 'list', 'show') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
    Register-ArgumentCompleter -CommandName '/winget' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        @('-u', 'upgrade', 'search', 'list', 'show') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}

# -----------------------------------------------------------------------------
# /pip - Python Package Management & Upgrade Suite
# -----------------------------------------------------------------------------
function Invoke-SlashPip {
    param(
        [Parameter(ValueFromRemainingArguments=$true)]
        [string[]]$Args
    )
    if ($Args -and ($Args[0] -eq '-u' -or $Args[0] -eq '--update' -or $Args[0] -eq 'update')) {
        Write-Host "[PIP] Upgrading pip and terminal text effects..." -ForegroundColor Cyan
        python -m pip install --upgrade pip terminaltexteffects
    } else {
        python -m pip @Args
    }
}
Set-Alias -Name /pip -Value Invoke-SlashPip -Option AllScope -ErrorAction SilentlyContinue

if (Get-Command Register-ArgumentCompleter -ErrorAction SilentlyContinue) {
    Register-ArgumentCompleter -CommandName '/pip' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        @('-u', 'install', 'list', 'outdated', 'show') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}

# -----------------------------------------------------------------------------
# /sync - Asana to Supabase Sync Runner & Validator
# -----------------------------------------------------------------------------
function Invoke-SlashSync {
    param(
        [Parameter(ValueFromRemainingArguments=$true)]
        [string[]]$Args
    )
    $scriptCandidates = @(
        "C:\Users\GabeMaher\main.py",
        "$HOME\main.py",
        "Z:\luxdev-z\Dev\003-Tier-Three-Projects\asana-shipment-calculator\main.py"
    )
    $targetScript = $null
    foreach ($c in $scriptCandidates) {
        if (Test-Path $c) { $targetScript = $c; break }
    }

    if (-not $targetScript) {
        Write-Host "[SYNC] Running sync project via python..." -ForegroundColor Cyan
        python -c "print('[SYNC] Ready for sync pipelines.')"
        return
    }

    if ($Args -and ($Args[0] -eq '-v' -or $Args[0] -eq '--validate' -or $Args[0] -eq 'validate')) {
        Write-Host "[SYNC] Validating Asana to Supabase connections..." -ForegroundColor Cyan
        python $targetScript --validate
    } else {
        Write-Host "[SYNC] Executing Asana to Supabase sync..." -ForegroundColor Cyan
        python $targetScript @Args
    }
}
function Invoke-SlashValidate {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
    Invoke-SlashSync -Args @('-v')
}
Set-Alias -Name /sync -Value Invoke-SlashSync -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /validate -Value Invoke-SlashValidate -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /effects, /tte & /glitch - Terminal Text Effects & Animations
# -----------------------------------------------------------------------------
function Invoke-SlashEffects {
    param(
        [Parameter(Position=0)]
        [string]$Effect = "glitch",
        [Parameter(Position=1, ValueFromRemainingArguments=$true)]
        [string[]]$TextArgs
    )
    $text = if ($TextArgs) { $TextArgs -join ' ' } else { "PWSHAI SUPERCHARGED TERMINAL EFFECTS" }
    $script = Get-GlitchScriptPath
    if ($script -and (Test-Path $script)) {
        python $script $Effect $text
    } else {
        Write-Host "[EFFECTS] Running effect: $Effect on '$text'" -ForegroundColor Magenta
    }
}
function Invoke-SlashGlitch {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$TextArgs)
    Invoke-SlashEffects -Effect "glitch" -TextArgs $TextArgs
}
Set-Alias -Name /effects -Value Invoke-SlashEffects -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /texteffects -Value Invoke-SlashEffects -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /tte -Value Invoke-SlashEffects -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /glitch -Value Invoke-SlashGlitch -Option AllScope -ErrorAction SilentlyContinue

if (Get-Command Register-ArgumentCompleter -ErrorAction SilentlyContinue) {
    Register-ArgumentCompleter -CommandName '/effects' -ScriptBlock {
        param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameters)
        @('glitch', 'matrix', 'waves', 'rain', 'beams', 'scatter', 'spotlights', 'spray', 'decrypt', 'blow', 'wave', 'swirl', 'dissolve') | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}

# Wind animation shortcuts
function Invoke-SlashBlow { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$T) Invoke-SlashEffects -Effect "blow" -TextArgs $T }
Set-Alias -Name /blow -Value Invoke-SlashBlow -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /gust -Value Invoke-SlashBlow -Option AllScope -ErrorAction SilentlyContinue

function Invoke-SlashWave { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$T) Invoke-SlashEffects -Effect "waves" -TextArgs $T }
Set-Alias -Name /wave -Value Invoke-SlashWave -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /breeze -Value Invoke-SlashWave -Option AllScope -ErrorAction SilentlyContinue

function Invoke-SlashSwirl { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$T) Invoke-SlashEffects -Effect "swirl" -TextArgs $T }
Set-Alias -Name /swirl -Value Invoke-SlashSwirl -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /cyclone -Value Invoke-SlashSwirl -Option AllScope -ErrorAction SilentlyContinue

function Invoke-SlashDissolve { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$T) Invoke-SlashEffects -Effect "scatter" -TextArgs $T }
Set-Alias -Name /dissolve -Value Invoke-SlashDissolve -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /codexx, /eb, /claude-mem, /ldxv - Environment Tool Shortcuts
# -----------------------------------------------------------------------------
function Invoke-SlashCodexx {
    $script = 'X:\AI\codex\bin\codex-x.ps1'
    if (Test-Path $script) {
        $oldTitle = $null
        try {
            $oldTitle = $Host.UI.RawUI.WindowTitle
            $Host.UI.RawUI.WindowTitle = 'Codex X Shell [X:\AI\codex]'
        } catch {}

        Write-Host ''
        Write-Host 'Launching Codex X via /codexx' -ForegroundColor Cyan
        Write-Host 'Profile: x   Home: X:\AI\codex\home' -ForegroundColor DarkCyan
        Write-Host ''

        & $script @args
        $exitCode = $LASTEXITCODE
        try {
            if ($null -ne $oldTitle) { $Host.UI.RawUI.WindowTitle = $oldTitle }
        } catch {}
        return $exitCode
    } elseif (Get-Command codex -ErrorAction SilentlyContinue) {
        codex @args
    } else {
        Write-Host "[CODEX] Codex executable not found on PATH or X:\AI\codex." -ForegroundColor Yellow
    }
}
Set-Alias -Name /codexx -Value Invoke-SlashCodexx -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /codex -Value Invoke-SlashCodexx -Option AllScope -ErrorAction SilentlyContinue

function Invoke-SlashEb {
    $ebScript = "$env:USERPROFILE\.eternal-buckets\bin\eb.ps1"
    if (Test-Path $ebScript) {
        & $ebScript @args
    } elseif (Get-Command eb -ErrorAction SilentlyContinue) {
        eb @args
    } else {
        Write-Host "[EB] Eternal Buckets not found." -ForegroundColor Yellow
    }
}
Set-Alias -Name /eb -Value Invoke-SlashEb -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /fzf - Interactive FZF History Search
# -----------------------------------------------------------------------------
function Invoke-SlashFzf {
    if (Get-Command Invoke-PsFzfReadLineSelectHistory -ErrorAction SilentlyContinue) {
        Invoke-PsFzfReadLineSelectHistory
    } elseif (Get-Command fzf -ErrorAction SilentlyContinue) {
        $historyFile = (Get-PSReadLineOption).HistorySavePath
        if (Test-Path $historyFile) {
            Get-Content $historyFile | fzf
        }
    } else {
        Invoke-SlashHistory
    }
}
Set-Alias -Name /fzf -Value Invoke-SlashFzf -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /fuzzy -Value Invoke-SlashFzf -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /z - Smart Directory History Jump
# -----------------------------------------------------------------------------
function Invoke-SlashZ {
    param([string]$Target)
    if (Get-Command Invoke-ZLocation -ErrorAction SilentlyContinue) {
        Invoke-ZLocation $Target
    } else {
        Set-Location $Target
    }
}
Set-Alias -Name /z -Value Invoke-SlashZ -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /gen & /complete - Direct AI Prompt Generators
# -----------------------------------------------------------------------------
function Invoke-SlashGen {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$PromptArgs)
    $prompt = $PromptArgs -join ' '
    if ([string]::IsNullOrWhiteSpace($prompt)) {
        Write-Host "Usage: /gen <natural language command request>" -ForegroundColor Yellow
        return
    }
    Write-Host "[AI] Generating command using provider: $global:AI_PROVIDER..." -ForegroundColor Cyan
    $res = Invoke-AIProviderEngine -PromptText "Convert to single PowerShell command line: $prompt" -MaxCandidates 1
    if ($res -and $res[0]) {
        $clean = $res[0] -replace '^```(?:powershell|pwsh|sh)?\s*', '' -replace '\s*```$', ''
        Write-Host "$clean" -ForegroundColor Green
    }
}
Set-Alias -Name /gen -Value Invoke-SlashGen -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /ai-gen -Value Invoke-SlashGen -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /ai-on & /ai-off - Toggle AI Features
# -----------------------------------------------------------------------------
function Invoke-SlashAiOn {
    $global:AI_ENABLED = $true
    Write-Host "[AI] Features ENABLED (Ctrl+G & Ctrl+Space active)" -ForegroundColor Green
}
Set-Alias -Name /ai-on -Value Invoke-SlashAiOn -Option AllScope -ErrorAction SilentlyContinue

function Invoke-SlashAiOff {
    $global:AI_ENABLED = $false
    Write-Host "[AI] Features DISABLED" -ForegroundColor Yellow
}
Set-Alias -Name /ai-off -Value Invoke-SlashAiOff -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /ports - List active listening network ports
# -----------------------------------------------------------------------------
function Invoke-SlashPorts {
    Get-NetTCPConnection -State Listen | Select-Object LocalPort, OwningProcess, @{Name="ProcessName"; Expression={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} | Sort-Object LocalPort | Format-Table -AutoSize
}
Set-Alias -Name /ports -Value Invoke-SlashPorts -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /ip - Show local and public IP info
# -----------------------------------------------------------------------------
function Invoke-SlashIp {
    Write-Host "[NET] Local Network Interfaces:" -ForegroundColor Cyan
    Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object InterfaceAlias, IPAddress | Format-Table -AutoSize
    
    try {
        $pub = Invoke-RestMethod -Uri "https://ipinfo.io/json" -TimeoutSec 3
        Write-Host "[NET] Public IP: $($pub.ip) ($($pub.city), $($pub.region), $($pub.country))" -ForegroundColor Green
    } catch {
        Write-Host "[NET] Could not fetch public IP." -ForegroundColor Yellow
    }
}
Set-Alias -Name /ip -Value Invoke-SlashIp -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /find - Recursive file search
# -----------------------------------------------------------------------------
function Invoke-SlashFind {
    param([string]$Pattern = "*")
    Get-ChildItem -Recurse -Filter "*$Pattern*" -ErrorAction SilentlyContinue | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
}
Set-Alias -Name /find -Value Invoke-SlashFind -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /history - Search recent history
# -----------------------------------------------------------------------------
function Invoke-SlashHistory {
    param([string]$Search)
    $historyFile = (Get-PSReadLineOption).HistorySavePath
    if (Test-Path $historyFile) {
        $lines = Get-Content $historyFile
        if ($Search) {
            $lines = $lines | Where-Object { $_ -like "*$Search*" }
        }
        $lines | Select-Object -Last 20
    }
}
Set-Alias -Name /history -Value Invoke-SlashHistory -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /clear-history - Wipe command history
# -----------------------------------------------------------------------------
function Invoke-SlashClearHistory {
    $historyFile = (Get-PSReadLineOption).HistorySavePath
    if (Test-Path $historyFile) {
        Clear-Content $historyFile
        [Microsoft.PowerShell.PSConsoleReadLine]::ClearHistory()
        Write-Host "[OK] Command history cleared!" -ForegroundColor Green
    }
}
Set-Alias -Name /clear-history -Value Invoke-SlashClearHistory -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /sysinfo - Hardware & memory summary
# -----------------------------------------------------------------------------
function Invoke-SlashSysinfo {
    $os = Get-CimInstance Win32_OperatingSystem
    $uptime = (Get-Date) - $os.LastBootUpTime
    $memFreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $memTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    
    Write-Host "[SYS] Hardware Summary:" -ForegroundColor Cyan
    Write-Host "   OS:       $($os.Caption)" -ForegroundColor White
    Write-Host "   Uptime:   $($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m" -ForegroundColor White
    Write-Host "   Memory:   $memFreeGB GB free / $memTotalGB GB total" -ForegroundColor White
}
Set-Alias -Name /sysinfo -Value Invoke-SlashSysinfo -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /doctor - Diagnostic Environment Check
# -----------------------------------------------------------------------------
function Invoke-SlashDoctor {
    Write-Host ""
    Write-Host "=== [*] pwshai Environment Doctor ===" -ForegroundColor Cyan
    Write-Host "  PowerShell: $($PSVersionTable.PSVersion)" -ForegroundColor Green
    Write-Host "  Theme:      $global:THEME" -ForegroundColor Green
    Write-Host "  Provider:   $global:AI_PROVIDER" -ForegroundColor Green
    Write-Host "  AI Enabled: $global:AI_ENABLED" -ForegroundColor $(if ($global:AI_ENABLED) { 'Green' } else { 'Yellow' })

    # Modules
    $modules = @('PSReadLine', 'CompletionPredictor', 'PSFzf', 'ZLocation')
    Write-Host "`nPowerShell Modules:" -ForegroundColor Yellow
    foreach ($m in $modules) {
        $found = Get-Module -Name $m -ListAvailable -ErrorAction SilentlyContinue
        if ($found) {
            Write-Host "  [OK] $($m.PadRight(22)) : Installed ($($found[0].Version))" -ForegroundColor Green
        } else {
            Write-Host "  [X] $($m.PadRight(22)) : Not Installed" -ForegroundColor Gray
        }
    }

    # External CLI tools
    $tools = @('node', 'python', 'npm', 'agy', 'winget', 'fzf')
    Write-Host "`nCLI Tools on PATH:" -ForegroundColor Yellow
    foreach ($t in $tools) {
        $cmd = Get-Command $t -ErrorAction SilentlyContinue
        if ($cmd) {
            Write-Host "  [OK] $($t.PadRight(22)) : Found ($($cmd.Source))" -ForegroundColor Green
        } else {
            Write-Host "  [X] $($t.PadRight(22)) : Not Found" -ForegroundColor Gray
        }
    }

    # Glitch Script
    $glitch = Get-GlitchScriptPath
    Write-Host "`nGlitch & Effects Engine:" -ForegroundColor Yellow
    if ($glitch) {
        Write-Host "  [OK] glitch_effect.py      : $glitch" -ForegroundColor Green
    } else {
        Write-Host "  [X] glitch_effect.py      : Missing" -ForegroundColor Red
    }
    Write-Host ""
}
Set-Alias -Name /doctor -Value Invoke-SlashDoctor -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /reload - Reload profile
# -----------------------------------------------------------------------------
function Invoke-SlashReload {
    . $PROFILE
    Write-Host "[OK] PowerShell profile and slash commands reloaded!" -ForegroundColor Green
}
Set-Alias -Name /reload -Value Invoke-SlashReload -Option AllScope -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
# /help - Complete Interactive Sitemap & Help Menu
# -----------------------------------------------------------------------------
function Invoke-SlashHelp {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "       * POWERSHELL SUPERCHARGED SLASH COMMANDS & AI *     " -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  Appearance & Themes:" -ForegroundColor Yellow
    Write-Host "    /theme [preset]    - Set theme [blue|dark|matrix|neon|dracula|default]" -ForegroundColor White
    Write-Host ""
    Write-Host "  AI Intelligence & Models:" -ForegroundColor Yellow
    Write-Host "    /provider <name>   - Set AI provider [opencode|openai|gemini|kimi|deepseek|local|claude]" -ForegroundColor White
    Write-Host "    /opencode          - Switch provider to OpenCode" -ForegroundColor White
    Write-Host "    /claude            - Switch provider to Claude" -ForegroundColor White
    Write-Host "    /chatgpt           - Switch provider to OpenAI/ChatGPT" -ForegroundColor White
    Write-Host "    /models            - Display local and available AI models" -ForegroundColor White
    Write-Host "    /keys [-args]      - Manage API Keys (-stored, -test, -list, -add)" -ForegroundColor White
    Write-Host "    /gen <prompt>      - Generate raw PowerShell command from AI prompt" -ForegroundColor White
    Write-Host "    /ai-on / /ai-off   - Enable or disable AI shortcuts" -ForegroundColor White
    Write-Host ""
    Write-Host "  Developer Shortcuts & Updaters:" -ForegroundColor Yellow
    Write-Host "    /agy [-d|yolo]     - Launch AGY CLI (-d = dangerously skip permissions)" -ForegroundColor White
    Write-Host "    /npm [-u]          - NPM manager (-u = update all global packages)" -ForegroundColor White
    Write-Host "    /wing [-u]         - Windows winget manager (-u = upgrade all packages)" -ForegroundColor White
    Write-Host "    /pip [-u]          - Python pip manager (-u = upgrade pip & TTE)" -ForegroundColor White
    Write-Host "    /sync [-v]         - Run Asana to Supabase sync tool (-v = validate)" -ForegroundColor White
    Write-Host "    /codexx            - Launch Codex X Shell" -ForegroundColor White
    Write-Host "    /eb                - Eternal Buckets shortcut" -ForegroundColor White
    Write-Host ""
    Write-Host "  Terminal Text Effects & Animations:" -ForegroundColor Yellow
    Write-Host "    /effects [effect]  - Launch terminal text effects (glitch, matrix, waves, rain...)" -ForegroundColor White
    Write-Host "    /glitch [text]     - Hyperbolized glitch animation effect" -ForegroundColor White
    Write-Host "    /blow / /wave      - Breeze & wind wave text animations" -ForegroundColor White
    Write-Host "    /swirl / /dissolve - Vortex swirl & leaf dispersal text animations" -ForegroundColor White
    Write-Host ""
    Write-Host "  Navigation & System Utilities:" -ForegroundColor Yellow
    Write-Host "    /fzf               - Interactive FZF history search menu" -ForegroundColor White
    Write-Host "    /z <directory>     - Smart directory history navigation" -ForegroundColor White
    Write-Host "    /ports             - List active listening network ports & PIDs" -ForegroundColor White
    Write-Host "    /ip                - Show local & public IP information" -ForegroundColor White
    Write-Host "    /find <term>       - Quick recursive file search" -ForegroundColor White
    Write-Host "    /history <term>    - Search recent command history" -ForegroundColor White
    Write-Host "    /clear-history     - Clear PSReadLine command history" -ForegroundColor White
    Write-Host "    /sysinfo           - Display system hardware & memory summary" -ForegroundColor White
    Write-Host "    /doctor            - Run pwshai system diagnostic check" -ForegroundColor White
    Write-Host "    /reload            - Reload PowerShell profile & slash commands" -ForegroundColor White
    Write-Host "    /help              - Display this full sitemap" -ForegroundColor White
    Write-Host ""
    Write-Host "* Keyboard Shortcuts:" -ForegroundColor Yellow
    Write-Host "  Tab              - Interactive Menu Autocomplete" -ForegroundColor White
    Write-Host "  F2               - Toggle Typeahead View (Inline Ghost vs Popup List)" -ForegroundColor White
    Write-Host "  Ctrl + G         - Single-Line AI Command Generator" -ForegroundColor White
    Write-Host "  Ctrl + Space     - Multi-Candidate AI Autocomplete Picker" -ForegroundColor White
    Write-Host "  Up / Down        - Intelligent History Search" -ForegroundColor White
    Write-Host ""
}
Set-Alias -Name /help -Value Invoke-SlashHelp -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /slash -Value Invoke-SlashHelp -Option AllScope -ErrorAction SilentlyContinue
Set-Alias -Name /list -Value Invoke-SlashHelp -Option AllScope -ErrorAction SilentlyContinue

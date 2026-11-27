#Requires -Version 5.1
<#
.SYNOPSIS
    Agnamo SYS — Windows diagnostics collectors shared by pwshai, bingo and ldxv.

.DESCRIPTION
    One implementation, three front-ends. Everything here is read-only: nothing is
    stopped, deleted or reconfigured. Each collector returns objects (pipe them) and
    every one accepts -Json for machine consumption, so a Python or Node wrapper can
    shell out once and parse.

    Collectors
      Get-AgnamoLog      Critical/Error/Warning events from System, Application (and
                         optionally Security), with provider and message body.
      Get-AgnamoApp      Interactive apps (processes with a window), plus a session
                         map, plus an "invisible" audit: processes owned by the
                         interactive user that live in session 0 and can therefore
                         never draw a window. That audit is the detector for the
                         bug class where a background/S4U task launches a browser or
                         GUI helper into the services session and steals a
                         ProcessSingleton from the real desktop.
      Get-AgnamoService  Services (state, start mode, path) and scheduled tasks
                         (logon type, action) with a background-task audit: tasks
                         whose LogonType is S4U/Password run in session 0 whether or
                         not the user is logged on, which is exactly how a GUI child
                         ends up invisible.
      Get-AgnamoSysReport  One object combining the three, for a status line.

.EXAMPLE
    Get-AgnamoLog -Hours 6 | Format-Table TimeCreated,Level,Provider,Id

.EXAMPLE
    Get-AgnamoApp | Where-Object Invisible | Format-Table

.EXAMPLE
    Get-AgnamoSysReport -Json
#>

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'SilentlyContinue'

# StrictMode 2.0 raises on an undefined variable, so script state is declared here.
$script:AgnamoOwnSession = $null

function _AgnamoJ {
    # Convert to JSON without the leading/trailing noise, PS 5.1 friendly.
    param([Parameter(ValueFromPipeline = $true)] $InputObject, [int] $Depth = 6)
    process {
        if ($null -eq $InputObject) { return 'null' }
        if ($InputObject -is [string]) { return $InputObject }
        return ($InputObject | ConvertTo-Json -Depth $Depth -Compress)
    }
}

function _AgnamoOwnSession {
    if (-not $script:AgnamoOwnSession) {
        $script:AgnamoOwnSession = [int]$PID
        try { $script:AgnamoOwnSession = [int](Get-Process -Id $PID).SessionId } catch { }
    }
    return $script:AgnamoOwnSession
}

# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
function Get-AgnamoLog {
    [CmdletBinding()]
    param(
        [string[]] $LogName = @('System', 'Application'),
        [ValidateSet('Critical', 'Error', 'Warning', 'Information', 'Verbose', 'All')]
        [string[]] $Level = @('Critical', 'Error', 'Warning'),
        [int] $Hours = 24,
        [int] $Limit = 60,
        [switch] $Json
    )
    $start = (Get-Date).AddHours(-1 * [Math]::Abs($Hours))
    $wanted = @{}
    if ($Level -notcontains 'All') {
        foreach ($l in $Level) { $wanted[$l] = $true }
    }

    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($log in $LogName) {
        $events = Get-WinEvent -FilterHashtable @{ LogName = $log; StartTime = $start } -ErrorAction SilentlyContinue |
            Sort-Object TimeCreated -Descending
        $kept = 0
        foreach ($event in $events) {
            $levelName = [string]$event.LevelDisplayName
            if (-not $levelName) { $levelName = 'Information' }
            if ($wanted.Count -gt 0 -and -not $wanted.ContainsKey($levelName)) { continue }
            $message = $event.Message
            if ($message) {
                $message = ($message -replace '\s+', ' ').Trim()
                if ($message.Length -gt 400) { $message = $message.Substring(0, 400) + '…' }
            }
            $rows.Add([pscustomobject]@{
                TimeCreated = $event.TimeCreated
                LogName     = $log
                Level       = $levelName
                Id          = $event.Id
                Provider    = $event.ProviderName
                Message     = $message
            })
            $kept++
            if ($Limit -gt 0 -and $kept -ge $Limit) { break }
        }
    }

    $result = $rows | Sort-Object TimeCreated -Descending
    if ($Json) { return (_AgnamoJ @{ count = @($result).Count; since = $start; logs = $LogName; events = @($result) }) }
    return $result
}

# ---------------------------------------------------------------------------
# Apps / processes / sessions
# ---------------------------------------------------------------------------
function Get-AgnamoApp {
    [CmdletBinding()]
    param(
        [switch] $All,        # include background processes, not just windowed apps
        [switch] $Json
    )
    $own = _AgnamoOwnSession
    $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
    $alive = @{}
    foreach ($p in $procs) { $alive[[int]$p.ProcessId] = $true }

    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($p in $procs) {
        $hasWindow = $false
        $title = ''
        $proc = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
        if ($proc) {
            $title = [string]$proc.MainWindowTitle
            if ($title) { $hasWindow = $true }
        }
        if (-not $All -and -not $hasWindow) { continue }

        $owner = ''
        try {
            $o = Invoke-CimMethod -InputObject $p -MethodName GetOwner -ErrorAction Stop
            if ($o -and $o.User) { $owner = [string]$o.User }
        } catch { }

        $orphan = -not $alive.ContainsKey([int]$p.ParentProcessId)
        $rows.Add([pscustomobject]@{
            Name        = [string]$p.Name
            Pid         = [int]$p.ProcessId
            ParentPid   = [int]$p.ParentProcessId
            Session     = [int]$p.SessionId
            User        = $owner
            Title       = $title
            HasWindow   = $hasWindow
            Orphan      = $orphan
            # Owned by a human account but parked in session 0: it cannot draw a
            # window, reach the interactive desktop, or hand off a browser session.
            Invisible   = ([int]$p.SessionId -eq 0 -and $owner -and $owner -notmatch '^(SYSTEM|LOCAL SERVICE|NETWORK SERVICE|DWM-|UMFD-|Font Driver)')
        })
    }
    $result = $rows | Sort-Object Session, Name
    if ($Json) {
        return (_AgnamoJ @{
                ownSession = $own
                count      = @($result).Count
                invisible  = @($result | Where-Object { $_.Invisible }).Count
                apps       = @($result)
            })
    }
    return $result
}

# ---------------------------------------------------------------------------
# Services and scheduled tasks (background-context audit)
# ---------------------------------------------------------------------------
function Get-AgnamoService {
    [CmdletBinding()]
    param(
        [switch] $Tasks,             # include scheduled tasks
        [switch] $IncludeMicrosoft,  # include \Microsoft\* tasks (very noisy)
        [switch] $Json
    )
    $services = New-Object System.Collections.Generic.List[object]
    foreach ($s in (Get-CimInstance Win32_Service -ErrorAction SilentlyContinue)) {
        $services.Add([pscustomobject]@{
            Name      = [string]$s.Name
            Display   = [string]$s.DisplayName
            State     = [string]$s.State
            StartMode = [string]$s.StartMode
            Account   = [string]$s.StartName
            Path      = [string]$s.PathName
            Kind      = 'service'
        })
    }

    $taskRows = New-Object System.Collections.Generic.List[object]
    if ($Tasks) {
        # Get-ScheduledTask hands a non-elevated caller objects whose .Xml is null,
        # so the principal -- the one field that decides which logon session the task
        # runs in -- is unreadable that way. `schtasks /query /xml` dumps every task
        # in a single document and needs no elevation.
        $raw = & schtasks.exe /query /xml 2>$null
        $text = (($raw -join "`n") -replace "`0", '')
        foreach ($chunk in [regex]::Split($text, '<Task\s+version') | Select-Object -Skip 1) {
            $nameMatch = [regex]::Match($chunk, '<URI>(.*?)</URI>')
            if (-not $nameMatch.Success) { continue }
            $taskName = $nameMatch.Groups[1].Value
            if (-not $IncludeMicrosoft -and $taskName -like '\Microsoft\*') { continue }
            $enabledMatch = [regex]::Match($chunk, '<Enabled>(true|false)</Enabled>')
            if ($enabledMatch.Success -and $enabledMatch.Groups[1].Value -eq 'false') { continue }
            $logonMatch = [regex]::Match($chunk, '<LogonType>(.*?)</LogonType>')
            $logon = ''
            if ($logonMatch.Success) { $logon = $logonMatch.Groups[1].Value }
            $commandText = ''
            foreach ($m in [regex]::Matches($chunk, '<Command>(.*?)</Command>')) { $commandText = $m.Groups[1].Value; break }
            $argText = ''
            foreach ($m in [regex]::Matches($chunk, '<Arguments>(.*?)</Arguments>')) { $argText = $m.Groups[1].Value; break }
            $action = ("$commandText $argText").Trim() -replace '\s+', ' '
            if ($action.Length -gt 160) { $action = $action.Substring(0, 160) + '…' }
            $taskRows.Add([pscustomobject]@{
                Name      = $taskName
                Display   = ''
                State     = 'Ready'
                StartMode = $logon
                Account   = ''
                Path      = $action
                Kind      = 'task'
                Background = ($logon -eq 'S4U' -or $logon -eq 'Password')
            })
        }
    }

    $all = New-Object System.Collections.Generic.List[object]
    foreach ($item in $services) { $all.Add($item) }
    foreach ($item in $taskRows) { $all.Add($item) }
    if ($Json) {
        return (_AgnamoJ @{
                ownSession          = (_AgnamoOwnSession)
                services            = $services.ToArray()
                tasks               = $taskRows.ToArray()
                backgroundTasks     = @($taskRows | Where-Object { $_.Background }).Count
                runningServices     = @($services | Where-Object { $_.State -eq 'Running' }).Count
            })
    }
    return $all
}

# ---------------------------------------------------------------------------
# One-shot report
# ---------------------------------------------------------------------------
function Get-AgnamoSysReport {
    [CmdletBinding()]
    param([int] $Hours = 24, [switch] $Json)

    $own = _AgnamoOwnSession
    $apps = @(Get-AgnamoApp)
    $svc = Get-AgnamoService -Tasks -Json
    $svcObj = $svc | ConvertFrom-Json
    $logs = @(Get-AgnamoLog -Hours $Hours)

    $report = [pscustomobject]@{
        generatedAt       = (Get-Date).ToString('s')
        ownSession        = $own
        invisibleApps     = @($apps | Where-Object { $_.Invisible }).Count
        invisibleDetail   = @($apps | Where-Object { $_.Invisible } | ForEach-Object { "$($_.Name) (pid $($_.Pid), $($_.User))" })
        windowedApps      = @($apps).Count
        runningServices   = [int]$svcObj.runningServices
        backgroundTasks   = [int]$svcObj.backgroundTasks
        backgroundDetail  = @($svcObj.tasks | Where-Object { $_.Background } | ForEach-Object { $_.Name })
        criticalEvents    = @($logs | Where-Object { $_.Level -eq 'Critical' }).Count
        errorEvents       = @($logs | Where-Object { $_.Level -eq 'Error' }).Count
        warningEvents     = @($logs | Where-Object { $_.Level -eq 'Warning' }).Count
        topProviders      = @($logs | Group-Object Provider | Sort-Object Count -Descending |
            Select-Object -First 5 | ForEach-Object { "$($_.Name) ($($_.Count))" })
    }
    if ($Json) { return (_AgnamoJ $report) }
    return $report
}

# ---------------------------------------------------------------------------
# Disk space: the big files, rolled up by the folder that owns them
# ---------------------------------------------------------------------------
function Get-AgnamoBigFile {
    <#
    .SYNOPSIS
        List files at or above a size, rolled up by grandparent folder.

    .DESCRIPTION
        robocopy in list mode (/L) does the enumeration: it is native, handles
        long paths and junctions (/XJ) and never writes anything. Its stdout is
        parsed as files appear, then each file is attributed to its grandparent
        folder so a flat "biggest files" list becomes "which folder should I
        look at": a 40 GB VM disk and 200 2 GB files score the same either way.

        A full system drive takes minutes; narrow -Root or raise -MinMB when you
        only care about the usual suspects.

    .EXAMPLE
        Get-AgnamoBigFile -Root 'C:\','Z:\' -MinMB 400

    .EXAMPLE
        Get-AgnamoBigFile -Root 'Z:\' -MinMB 100 -Raw | Sort-Object Bytes -Descending | Select-Object -First 20
    #>
    [CmdletBinding()]
    param(
        [string[]] $Root = @('C:\', 'Z:\'),
        [int] $MinMB = 400,
        [int] $Top = 20,
        [switch] $Raw,
        [switch] $Json
    )

    $minBytes = [int64]$MinMB * 1MB
    $nullDir = Join-Path ([IO.Path]::GetTempPath()) 'pwshai-robocopy-null'
    $files = New-Object System.Collections.Generic.List[object]

    foreach ($root in $Root) {
        if (-not $root) { continue }
        if (-not (Test-Path -LiteralPath $root)) {
            Write-Verbose "skipping ${root}: not present"
            continue
        }
        # The argument array (not a command string) keeps robocopy from mangling a
        # trailing backslash, which is the classic `C:\` -> `C:"` quoting failure.
        $argv = @(
            $root, $nullDir,
            '/L', '/S', '/NJH', '/NJS', '/NDL', '/NC', '/NP',
            '/XJ', '/R:0', '/W:0', '/BYTES', '/FP', "/MIN:$minBytes"
        )
        $outFile = Join-Path ([IO.Path]::GetTempPath()) ('pwshai-big-' + [guid]::NewGuid().ToString('N') + '.txt')
        try {
            & robocopy @argv 2>&1 | Out-File -LiteralPath $outFile -Encoding utf8
            foreach ($line in [IO.File]::ReadLines($outFile)) {
                $trimmed = $line.Trim()
                if (-not $trimmed) { continue }

                # robocopy separates the byte count from the path with a tab. Parse on
                # that instead of a regex: the escape-heavy pattern is exactly the kind
                # of thing that gets mangled between editors and shells.
                $split = $trimmed.IndexOf([char]9)
                if ($split -lt 1) { $split = $trimmed.IndexOf(' ') }
                if ($split -lt 1) { continue }

                $sizeText = $trimmed.Substring(0, $split).Trim()
                $pathText = $trimmed.Substring($split + 1).Trim()
                if (-not $pathText) { continue }

                $bytes = [int64]0
                if (-not [int64]::TryParse($sizeText, [ref]$bytes)) { continue }
                # A listed file always has a drive letter and a colon.
                if ($pathText.Length -lt 4 -or $pathText[1] -ne [char]58) { continue }
                if ($bytes -lt $minBytes) { continue }

                # [IO.Path] rather than Split-Path: in Windows PowerShell 5.1
                # -LiteralPath and -Parent live in different parameter sets, so
                # `Split-Path -LiteralPath x -Parent` throws "Parameter set cannot be
                # resolved". .NET has no such split and no wildcard expansion.
                $parentPath = [IO.Path]::GetDirectoryName($pathText)
                if (-not $parentPath) { $parentPath = [IO.Path]::GetPathRoot($pathText) }
                $grand = [IO.Path]::GetDirectoryName($parentPath)
                if (-not $grand) { $grand = $parentPath }
                $files.Add([pscustomobject]@{
                    Bytes  = $bytes
                    MB     = [math]::Round($bytes / 1MB, 1)
                    Path   = $pathText
                    Grand  = $grand
                    Parent = ([IO.Path]::GetFileName($parentPath))
                })
            }
        } finally {
            Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue
        }
    }

    if ($Raw) {
        $rawRows = $files | Sort-Object Bytes -Descending
        if ($Json) { return (_AgnamoJ @{ count = @($rawRows).Count; roots = $Root; minMB = $MinMB; files = @($rawRows) } 5) }
        return $rawRows
    }

    $rollup = New-Object System.Collections.Generic.List[object]
    $byGrand = @{}
    foreach ($file in $files) {
        $key = [string]$file.Grand
        if (-not $byGrand.ContainsKey($key)) { $byGrand[$key] = New-Object System.Collections.Generic.List[object] }
        $byGrand[$key].Add($file)
    }
    foreach ($key in $byGrand.Keys) {
        $group = $byGrand[$key]
        $totalBytes = [int64]0
        foreach ($f in $group) { $totalBytes += [int64]$f.Bytes }
        $children = New-Object System.Collections.Generic.List[object]
        $byParent = @{}
        foreach ($f in $group) {
            $pkey = [string]$f.Parent
            if (-not $byParent.ContainsKey($pkey)) { $byParent[$pkey] = New-Object System.Collections.Generic.List[object] }
            $byParent[$pkey].Add($f)
        }
        foreach ($pkey in $byParent.Keys) {
            $pBytes = [int64]0
            foreach ($f in $byParent[$pkey]) { $pBytes += [int64]$f.Bytes }
            $children.Add([pscustomobject]@{
                Name  = $pkey
                GB    = [math]::Round($pBytes / 1GB, 2)
                MB    = [math]::Round($pBytes / 1MB, 1)
                Files = $byParent[$pkey].Count
            })
        }
        $rollup.Add([pscustomobject]@{
            GB       = [math]::Round($totalBytes / 1GB, 2)
            MB       = [math]::Round($totalBytes / 1MB, 1)
            Files    = $group.Count
            Path     = $key
            Children = @($children | Sort-Object GB -Descending)
        })
    }

    $result = @($rollup | Sort-Object GB -Descending | Select-Object -First ([Math]::Max(1, $Top)))
    if ($Json) {
        return (_AgnamoJ @{
                minMB = $MinMB
                roots = $Root
                totalGB = [math]::Round((($files | Measure-Object -Property Bytes -Sum).Sum / 1GB), 2)
                fileCount = $files.Count
                folders = $result
            } 6)
    }
    return $result
}

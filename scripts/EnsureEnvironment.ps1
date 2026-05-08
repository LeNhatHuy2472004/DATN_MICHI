$ErrorActionPreference = 'Stop'

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"

    $sqlToolDirs = @(
        "$env:ProgramFiles\Microsoft SQL Server\170\Tools\Binn",
        "$env:ProgramFiles\Microsoft SQL Server\160\Tools\Binn",
        "$env:ProgramFiles\Microsoft SQL Server\150\Tools\Binn"
    )

    foreach ($dir in $sqlToolDirs) {
        if (Test-Path $dir) {
            $env:Path = "$env:Path;$dir"
        }
    }
}

function Has-Command([string] $name) {
    return [bool] (Get-Command $name -ErrorAction SilentlyContinue)
}

function Has-DotNetSdk8Plus {
    if (-not (Has-Command 'dotnet')) {
        return $false
    }

    $sdks = & dotnet --list-sdks 2> $null
    foreach ($sdk in $sdks) {
        $major = 0
        [void] [int]::TryParse(($sdk -split '\.')[0], [ref] $major)
        if ($major -ge 8) {
            return $true
        }
    }

    return $false
}

function Has-NodeAndNpm {
    if (-not (Has-Command 'node') -or -not (Has-Command 'npm')) {
        return $false
    }

    $nodeVersion = (& node --version 2> $null) -replace '^v', ''
    $major = 0
    [void] [int]::TryParse(($nodeVersion -split '\.')[0], [ref] $major)

    return $major -ge 20
}

function Get-LocalDbCommand {
    $command = Get-Command 'SqlLocalDB.exe' -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $command = Get-Command 'sqllocaldb' -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    return $null
}

function Ensure-LocalDbInstance {
    Refresh-Path
    $localDb = Get-LocalDbCommand
    if (-not $localDb) {
        return $false
    }

    & $localDb info MSSQLLocalDB 1> $null 2> $null
    if ($LASTEXITCODE -ne 0) {
        & $localDb create MSSQLLocalDB 1> $null
        if ($LASTEXITCODE -ne 0) {
            return $false
        }
    }

    & $localDb start MSSQLLocalDB 1> $null 2> $null
    return $LASTEXITCODE -eq 0
}

function Install-WingetPackage([string] $id, [string] $name) {
    if (-not (Has-Command 'winget')) {
        throw 'winget is not available. Install App Installer from Microsoft Store, then run RunAll.bat again.'
    }

    Write-Host "[INSTALL] $name ($id)"
    & winget install --id $id --exact --source winget --silent --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install $name. Exit code: $LASTEXITCODE"
    }

    Refresh-Path
}

function Install-LocalDb {
    $url = 'https://download.microsoft.com/download/3/8/d/38de7036-2433-4207-8eae-06e247e17b25/SqlLocalDB.msi'
    $installer = Join-Path $env:TEMP 'SqlLocalDB.msi'

    Write-Host '[INSTALL] SQL Server LocalDB'
    Invoke-WebRequest -Uri $url -OutFile $installer

    $process = Start-Process msiexec.exe -ArgumentList @('/i', $installer, '/qn', 'IACCEPTSQLLOCALDBLICENSETERMS=YES') -Wait -PassThru
    if (@(0, 3010) -notcontains $process.ExitCode) {
        throw "Failed to install SQL Server LocalDB. Exit code: $($process.ExitCode)"
    }

    Refresh-Path
}

function Get-BackendDefaultConnectionString {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $settingsPath = Join-Path $repoRoot 'backend\appsettings.json'
    if (-not (Test-Path $settingsPath)) {
        throw "Cannot find backend settings file: $settingsPath"
    }

    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
    $connectionString = $settings.ConnectionStrings.DefaultConnection
    if ([string]::IsNullOrWhiteSpace($connectionString)) {
        throw 'ConnectionStrings:DefaultConnection is missing in backend\appsettings.json.'
    }

    return $connectionString
}

function Get-ConnectionValue([string] $connectionString, [string[]] $keys) {
    foreach ($part in $connectionString -split ';') {
        if ([string]::IsNullOrWhiteSpace($part) -or -not $part.Contains('=')) {
            continue
        }

        $name, $value = $part.Split('=', 2)
        foreach ($key in $keys) {
            if ($name.Trim().Equals($key, [StringComparison]::OrdinalIgnoreCase)) {
                return $value.Trim()
            }
        }
    }

    return $null
}

function Set-ConnectionDatabase([string] $connectionString, [string] $databaseName) {
    $parts = New-Object System.Collections.Generic.List[string]
    $updated = $false

    foreach ($part in $connectionString -split ';') {
        if ([string]::IsNullOrWhiteSpace($part)) {
            continue
        }

        if ($part.Contains('=')) {
            $name, $value = $part.Split('=', 2)
            if ($name.Trim().Equals('Database', [StringComparison]::OrdinalIgnoreCase) -or
                $name.Trim().Equals('Initial Catalog', [StringComparison]::OrdinalIgnoreCase)) {
                $parts.Add("$($name.Trim())=$databaseName")
                $updated = $true
                continue
            }
        }

        $parts.Add($part.Trim())
    }

    if (-not $updated) {
        $parts.Add("Database=$databaseName")
    }

    return ($parts -join ';')
}

function Ensure-ConfiguredDatabase {
    $connectionString = Get-BackendDefaultConnectionString
    $databaseName = Get-ConnectionValue $connectionString @('Database', 'Initial Catalog')
    if ([string]::IsNullOrWhiteSpace($databaseName)) {
        throw 'DefaultConnection must include Database or Initial Catalog.'
    }

    if ($databaseName -notmatch '^[A-Za-z0-9_\-]+$') {
        throw "Database name '$databaseName' contains unsupported characters for automatic creation."
    }

    Add-Type -AssemblyName System.Data
    $masterConnectionString = Set-ConnectionDatabase $connectionString 'master'
    $quotedDatabaseName = '[' + $databaseName.Replace(']', ']]') + ']'

    $connection = New-Object System.Data.SqlClient.SqlConnection($masterConnectionString)
    try {
        $connection.Open()

        $checkCommand = $connection.CreateCommand()
        $checkCommand.CommandText = 'SELECT DB_ID(@DatabaseName)'
        $parameter = $checkCommand.Parameters.Add('@DatabaseName', [System.Data.SqlDbType]::NVarChar, 128)
        $parameter.Value = $databaseName
        $databaseId = $checkCommand.ExecuteScalar()

        if ($null -ne $databaseId -and $databaseId -ne [DBNull]::Value) {
            Write-Host "[OK] Database $databaseName found"
            return
        }

        Write-Host "[CREATE] Database $databaseName"
        $createCommand = $connection.CreateCommand()
        $createCommand.CommandText = "CREATE DATABASE $quotedDatabaseName"
        [void] $createCommand.ExecuteNonQuery()
    }
    finally {
        $connection.Dispose()
    }
}

Refresh-Path
Write-Host '[CHECK] Environment preflight ...'

if (Has-DotNetSdk8Plus) {
    Write-Host '[OK] .NET SDK 8+ found'
} else {
    Install-WingetPackage 'Microsoft.DotNet.SDK.8' '.NET SDK 8'
    if (-not (Has-DotNetSdk8Plus)) {
        throw '.NET SDK 8+ is still missing after installation. Restart this terminal and run RunAll.bat again.'
    }
}

if (Has-NodeAndNpm) {
    Write-Host '[OK] Node.js and npm found'
} else {
    Install-WingetPackage 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    if (-not (Has-NodeAndNpm)) {
        throw 'Node.js/npm is still missing after installation. Restart this terminal and run RunAll.bat again.'
    }
}

if (Ensure-LocalDbInstance) {
    Write-Host '[OK] SQL Server LocalDB MSSQLLocalDB found'
} else {
    Install-LocalDb
    if (-not (Ensure-LocalDbInstance)) {
        throw 'SQL Server LocalDB is still missing after installation. Restart Windows or run RunAll.bat as Administrator.'
    }
}

Ensure-ConfiguredDatabase

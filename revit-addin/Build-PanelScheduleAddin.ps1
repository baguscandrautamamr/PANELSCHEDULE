<#
.SYNOPSIS
    Ambil source terbaru dari GitHub, build add-in Panel Schedule Sync, lalu
    bungkus hasilnya jadi folder + ZIP di Desktop siap dipindah ke PC Revit.

.DESCRIPTION
    Skrip berdiri sendiri: tidak perlu repo yang sudah ter-clone, tidak perlu
    Revit terpasang, dan tidak memakai GitHub Actions. Cukup .NET SDK 8.

    Sumber source, dua jalur otomatis:
      - kalau `git` ada  -> clone/pull branch yang diminta (repo private:
        pertama kali akan minta login GitHub lewat browser)
      - kalau `git` tidak ada -> pakai ZIP source terbaru di folder Downloads
        (unduh manual dari halaman branch di GitHub -> Code -> Download ZIP)

    Folder kerja (default %USERPROFILE%\panelschedule-build) dipakai khusus
    oleh skrip ini; isinya ditimpa tiap kali dijalankan.

.PARAMETER Branch
    Branch yang dibuild. Setelah perubahan di-merge, ganti ke branch utama
    repo (claude/supabase-vercel-setup-2hq9yr).

.PARAMETER RevitVersion
    2025 (default), 2023, atau all.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Desktop\Build-PanelScheduleAddin.ps1"

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Build-PanelScheduleAddin.ps1 -Branch claude/supabase-vercel-setup-2hq9yr -RevitVersion all
#>
[CmdletBinding()]
param(
    [string]$Branch = 'claude/rst-position-rebalance-loads-5wrhrg',

    [ValidateSet('2023', '2025', 'all')]
    [string]$RevitVersion = '2025',

    [string]$WorkDir = "$env:USERPROFILE\panelschedule-build",

    [string]$OutDir = "$env:USERPROFILE\Desktop"
)

$ErrorActionPreference = 'Stop'
$repoUrl = 'https://github.com/baguscandrautamamr/PANELSCHEDULE.git'

function Fail($msg) {
    Write-Host ''
    Write-Host $msg -ForegroundColor Red
    exit 1
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Fail 'dotnet tidak ditemukan. Install .NET SDK 8 dulu: https://dotnet.microsoft.com/download/dotnet/8.0'
}

New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
$src = Join-Path $WorkDir 'repo'

# ---------------------------------------------------------------- ambil source
if (Get-Command git -ErrorAction SilentlyContinue) {
    if (Test-Path (Join-Path $src '.git')) {
        Write-Host "== Update source ($Branch)" -ForegroundColor Cyan
        git -C $src fetch origin $Branch
        if ($LASTEXITCODE -ne 0) { Fail 'git fetch gagal.' }
        git -C $src checkout -B $Branch "origin/$Branch"
        git -C $src reset --hard "origin/$Branch"
    }
    else {
        Write-Host "== Clone source ($Branch)" -ForegroundColor Cyan
        if (Test-Path $src) { Remove-Item $src -Recurse -Force }
        git clone --branch $Branch --single-branch $repoUrl $src
        if ($LASTEXITCODE -ne 0) { Fail 'git clone gagal. Repo private - pastikan login GitHub sudah benar.' }
    }
}
else {
    $zip = Get-ChildItem "$env:USERPROFILE\Downloads\PANELSCHEDULE-*.zip" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $zip) {
        Fail ("git tidak terpasang dan ZIP source tidak ada di Downloads.`n" +
              "Unduh dulu lewat browser (harus login GitHub):`n" +
              "https://github.com/baguscandrautamamr/PANELSCHEDULE/archive/refs/heads/$Branch.zip`n" +
              "Atau pasang git sekali saja supaya otomatis: winget install Git.Git")
    }

    Write-Host ("== Extract " + $zip.Name) -ForegroundColor Cyan
    $tmp = Join-Path $WorkDir 'zip-extract'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    if (Test-Path $src) { Remove-Item $src -Recurse -Force }
    Expand-Archive $zip.FullName -DestinationPath $tmp -Force

    # ZIP dari GitHub membungkus semuanya di satu folder <repo>-<branch>
    $root = Get-ChildItem $tmp -Directory | Select-Object -First 1
    if (-not $root) { Fail 'Isi ZIP tidak seperti yang diharapkan.' }
    Move-Item $root.FullName $src
}

$proj = Join-Path $src 'revit-addin\PanelScheduleSync\PanelScheduleSync.csproj'
$manifest = Join-Path $src 'revit-addin\PanelScheduleSync.addin'
if (-not (Test-Path $proj)) { Fail "Source tidak lengkap - tidak ketemu: $proj" }

# ----------------------------------------------------------------------- build
$tfmByVersion = @{ '2023' = 'net48'; '2025' = 'net8.0-windows' }
if ($RevitVersion -eq 'all') { $versions = @('2023', '2025') } else { $versions = @($RevitVersion) }
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

foreach ($v in $versions) {
    $tfm = $tfmByVersion[$v]
    Write-Host ''
    Write-Host "== Build Revit $v ($tfm)" -ForegroundColor Cyan

    dotnet build $proj -c Release -f $tfm
    if ($LASTEXITCODE -ne 0) { Fail "Build Revit $v gagal - lihat pesan error di atas." }

    $bin = Join-Path $src "revit-addin\PanelScheduleSync\bin\Release\$tfm"
    $pkg = Join-Path $OutDir "PanelScheduleSync-Revit$v-$stamp"
    $dll = Join-Path $pkg 'PanelScheduleSync'

    if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
    New-Item -ItemType Directory -Path $dll -Force | Out-Null

    # build 2023 (net48) ikut membawa System.Text.Json dkk - semua DLL wajib ikut
    Copy-Item (Join-Path $bin '*.dll') $dll
    Copy-Item $manifest $pkg
    Compress-Archive (Join-Path $pkg '*') "$pkg.zip" -Force

    Write-Host "   folder : $pkg" -ForegroundColor Green
    Write-Host "   zip    : $pkg.zip" -ForegroundColor Green
    Get-ChildItem (Join-Path $dll 'PanelScheduleSync.dll') |
        Format-List Name, Length, LastWriteTime
}

Write-Host ''
Write-Host 'Selesai. Di PC yang ada Revit: tutup Revit, lalu extract ZIP-nya ke' -ForegroundColor Green
Write-Host '%AppData%\Autodesk\Revit\Addins\<versi>\ (timpa file lama).' -ForegroundColor Green

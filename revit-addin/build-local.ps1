<#
.SYNOPSIS
    Build add-in Panel Schedule Sync di PC Windows sendiri (tanpa GitHub Actions),
    dan opsional langsung memasangnya ke folder addins Revit.

.DESCRIPTION
    Melakukan hal yang sama dengan workflow "Build Revit Add-in":
    build Release per versi Revit, lalu menyusun folder paket berisi
    PanelScheduleSync.addin + folder DLL.

    Syarat: .NET SDK 8 terpasang (https://dotnet.microsoft.com/download/dotnet/8.0).
    Revit sendiri TIDAK perlu terpasang untuk build - API-nya diambil dari
    package Nice3point.Revit.Api lewat NuGet.

.PARAMETER RevitVersion
    2023, 2025, atau all (default). 2023 = net48, 2025 = net8.0-windows.

.PARAMETER Install
    Copy hasil build ke %AppData%\Autodesk\Revit\Addins\<versi>\.
    Revit harus ditutup dulu - DLL yang sedang dipakai tidak bisa ditimpa.
    Jangan dipakai kalau build-nya di PC yang tidak ada Revit-nya - pakai
    -OutDir lalu pindahkan foldernya ke PC yang ada Revit.

.PARAMETER OutDir
    Folder tujuan tambahan untuk paket hasil build (mis. folder yang mau
    dipindah ke PC lain). Dibuat kalau belum ada.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File revit-addin\build-local.ps1 -RevitVersion 2023 -Install

.EXAMPLE
    # build di PC tanpa Revit, hasilnya ditaruh di folder lain untuk dipindah
    powershell -ExecutionPolicy Bypass -File revit-addin\build-local.ps1 -RevitVersion 2025 -OutDir "C:\Users\Saya\panel schedule"
#>
[CmdletBinding()]
param(
    [ValidateSet('2023', '2025', 'all')]
    [string]$RevitVersion = 'all',

    [switch]$Install,

    [string]$OutDir
)

$ErrorActionPreference = 'Stop'

$tfmByVersion = @{ '2023' = 'net48'; '2025' = 'net8.0-windows' }
if ($RevitVersion -eq 'all') { $versions = @('2023', '2025') } else { $versions = @($RevitVersion) }

$project  = Join-Path $PSScriptRoot 'PanelScheduleSync\PanelScheduleSync.csproj'
$manifest = Join-Path $PSScriptRoot 'PanelScheduleSync.addin'

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw 'dotnet tidak ditemukan. Install .NET SDK 8 dulu: https://dotnet.microsoft.com/download/dotnet/8.0'
}

# DLL yang sedang di-load Revit terkunci: gagalkan lebih awal supaya tidak
# setengah ter-copy
if ($Install -and (Get-Process -Name 'Revit' -ErrorAction SilentlyContinue)) {
    throw 'Revit masih jalan. Tutup Revit dulu, baru jalankan ulang dengan -Install.'
}

foreach ($v in $versions) {
    $tfm = $tfmByVersion[$v]
    Write-Host "== Build Revit $v ($tfm)" -ForegroundColor Cyan

    dotnet build $project -c Release -f $tfm
    if ($LASTEXITCODE -ne 0) { throw "Build Revit $v gagal - lihat pesan error di atas." }

    $binDir = Join-Path $PSScriptRoot "PanelScheduleSync\bin\Release\$tfm"
    $pkgDir = Join-Path $PSScriptRoot "package-$v"
    $dllDir = Join-Path $pkgDir 'PanelScheduleSync'

    if (Test-Path $pkgDir) { Remove-Item $pkgDir -Recurse -Force }
    New-Item -ItemType Directory -Path $dllDir -Force | Out-Null

    # build 2023 (net48) ikut membawa System.Text.Json dkk - semua DLL wajib ikut,
    # bukan cuma PanelScheduleSync.dll
    Copy-Item (Join-Path $binDir '*.dll') $dllDir
    Copy-Item $manifest $pkgDir
    Write-Host "   paket: $pkgDir"

    if ($Install) {
        $target = Join-Path $env:APPDATA "Autodesk\Revit\Addins\$v"
        New-Item -ItemType Directory -Path (Join-Path $target 'PanelScheduleSync') -Force | Out-Null
        Copy-Item (Join-Path $dllDir '*.dll') (Join-Path $target 'PanelScheduleSync') -Force
        Copy-Item $manifest $target -Force
        Write-Host "   terpasang: $target" -ForegroundColor Green
    }

    if ($OutDir) {
        $copyTo = Join-Path $OutDir "PanelScheduleSync-Revit$v"
        if (Test-Path $copyTo) { Remove-Item $copyTo -Recurse -Force }
        New-Item -ItemType Directory -Path $copyTo -Force | Out-Null
        Copy-Item (Join-Path $pkgDir '*') $copyTo -Recurse -Force
        Write-Host "   disalin ke: $copyTo" -ForegroundColor Green
    }
}

Write-Host ''
if ($Install) {
    Write-Host 'Selesai. Buka Revit, cek ribbon tab "Panel Schedule".' -ForegroundColor Green
} else {
    Write-Host 'Selesai. Copy isi folder package-<versi> ke %AppData%\Autodesk\Revit\Addins\<versi>\,' -ForegroundColor Green
    Write-Host 'atau jalankan ulang skrip ini dengan -Install.' -ForegroundColor Green
}

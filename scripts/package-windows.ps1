$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
try {
    $rustInfo = & rustc -vV
    if ($LASTEXITCODE -ne 0 -or $rustInfo -notcontains 'host: x86_64-pc-windows-msvc') {
        throw 'Use the Windows x64 MSVC Rust toolchain to build this archive.'
    }

    $version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
    $dist = Join-Path $root 'dist'
    $name = "MossImage-Layout-Editor-v$version-win32-x64"
    $archive = Join-Path $dist "$name.zip"
    if (Test-Path -LiteralPath $archive) {
        throw "Archive already exists: $archive"
    }
    $env:CARGO_TARGET_DIR = Join-Path $root 'src-tauri/target'
    & cargo build --release --locked --manifest-path src-tauri/Cargo.toml
    if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed.' }

    $staging = Join-Path ([IO.Path]::GetTempPath()) ("mossimage-release-" + [guid]::NewGuid())
    $payload = Join-Path $staging $name
    New-Item -ItemType Directory -Path $dist -Force | Out-Null
    New-Item -ItemType Directory -Path $staging | Out-Null
    try {
        New-Item -ItemType Directory -Path $payload | Out-Null
        Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release/mossimage-layout-editor.exe') -Destination (Join-Path $payload 'MossImage Layout Editor.exe')
        foreach ($file in @('README.md', 'README_ja.md', 'LICENSE', 'docs')) {
            Copy-Item -LiteralPath $file -Destination $payload -Recurse
        }
        $stagedZip = Join-Path $staging "$name.zip"
        & tar.exe -a -cf $stagedZip -C $staging $name
        if ($LASTEXITCODE -ne 0) { throw 'ZIP creation failed.' }
        Copy-Item -LiteralPath $stagedZip -Destination $archive
        Get-Item -LiteralPath $archive
    } finally {
        $resolvedStaging = (Resolve-Path -LiteralPath $staging).Path
        if ($resolvedStaging -eq $staging) {
            Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
        }
    }
} finally {
    Pop-Location
}

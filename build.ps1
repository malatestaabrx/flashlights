$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'module.json') -Raw | ConvertFrom-Json
$archivePath = Join-Path $projectRoot ("flashlights-v{0}.zip" -f $manifest.version)
$assets = @('module.json', 'README.md')
foreach ($directory in @('scripts', 'styles', 'templates')) {
    $assets += Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse | ForEach-Object {
        [System.IO.Path]::GetRelativePath($projectRoot, $_.FullName)
    }
}
Add-Type -AssemblyName System.IO.Compression
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($asset in $assets) {
        $entryName = $manifest.id + '/' + $asset.Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, (Join-Path $projectRoot $asset), $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
    $stream.Dispose()
}
Write-Output $archivePath


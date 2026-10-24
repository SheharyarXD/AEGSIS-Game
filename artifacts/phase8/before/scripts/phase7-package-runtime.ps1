$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'public/assets/environment/premium'))
$archiveRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'art/environment/phase7/runtime-source'))
if (-not $runtimeRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar) -or -not $archiveRoot.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Runtime archive must remain inside the workspace.' }
$beforeBytes = (Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum
$records = @()
foreach ($file in Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File) {
  $relativePath = $file.FullName.Substring($runtimeRoot.Length + 1)
  $developmentFile = $file.Extension -eq '.log' -or ($file.Extension -eq '.glb' -and $file.Name -notlike '*-optimized.glb' -and $file.Name -ne 'aegis-cc0-modules.glb') -or $file.Name -like 'aegis-premium-architecture*' -or ($relativePath.StartsWith('destructible\') -and $file.Name -ne 'fractures-optimized.glb')
  if (-not $developmentFile) { continue }
  $targetPath = [IO.Path]::GetFullPath((Join-Path $archiveRoot $relativePath))
  if (-not $file.FullName.StartsWith($runtimeRoot + [IO.Path]::DirectorySeparatorChar) -or -not $targetPath.StartsWith($archiveRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'An archive path escaped its verified roots.' }
  if (Test-Path -LiteralPath $targetPath) { throw "Archive target already exists: $targetPath" }
  $sourceHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  New-Item -ItemType Directory -Path (Split-Path -Parent $targetPath) -Force | Out-Null
  Move-Item -LiteralPath $file.FullName -Destination $targetPath
  if ((Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash -ne $sourceHash) { throw 'Archive checksum mismatch.' }
  $records += @{path=$relativePath;bytes=$file.Length;sha256=$sourceHash}
}
$afterBytes = (Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum
@{beforeBytes=$beforeBytes;runtimeBytes=$afterBytes;archivedBytes=$beforeBytes-$afterBytes;files=$records;note='Only generated development exports and logs moved. Supplied originals and editable Blender sources are unchanged.'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $projectRoot 'artifacts/phase7/runtime-packaging.json') -Encoding UTF8
Write-Output "Runtime bytes: $beforeBytes -> $afterBytes; verified archived files: $($records.Count)"

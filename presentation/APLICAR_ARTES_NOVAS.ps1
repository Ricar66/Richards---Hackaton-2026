param([Parameter(Mandatory=$true)][string]$RepoPath)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'imagens'
if (!(Test-Path $source)) { throw 'Extraia o ZIP completo; falta a pasta imagens.' }
$repo = (Resolve-Path $RepoPath).Path
Push-Location $repo
try {
  $remote = git remote get-url origin
  if ($remote -notmatch 'Ricar66/Richards---Hackaton-2026') { throw 'Repositorio incorreto.' }
  if ((git branch --show-current) -ne 'main') { throw 'Use a branch main.' }
  if ((git status --porcelain).Length -gt 0) { throw 'Salve suas alteracoes locais antes de prosseguir.' }
  git pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) { throw 'Falha no git pull.' }
  $dest = Join-Path $repo 'presentation/imagens'
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  $files = @(Get-ChildItem -Path $source -Filter '*.png')
  if ($files.Count -ne 10) { throw 'Sao esperadas exatamente 10 imagens.' }
  Copy-Item (Join-Path $source '*.png') -Destination $dest -Force
  $gallery = @('# RICHARDS - 10 imagens cinematicas Full HD', '', 'Artes conceituais geradas por IA. Numeros exibidos sao ficticios; nao divulgar como dados reais.', '')
  foreach ($f in ($files | Sort-Object Name)) {
    $gallery += ('## ' + $f.BaseName)
    $gallery += ''
    $gallery += ('![' + $f.BaseName + '](' + $f.Name + ')')
    $gallery += ''
  }
  $gallery | Out-File -FilePath (Join-Path $dest 'README.md') -Encoding utf8
  git add -- presentation/imagens
  git diff --cached --stat
  git commit -m 'feat(pitch): adiciona 10 novas imagens cinematograficas Full HD'
  if ($LASTEXITCODE -ne 0) { throw 'Falha no commit.' }
  git push origin main
  if ($LASTEXITCODE -ne 0) { throw 'Falha no push; commit local foi preservado.' }
  Write-Host 'Concluido: imagens publicadas em presentation/imagens no GitHub.'
} finally { Pop-Location }

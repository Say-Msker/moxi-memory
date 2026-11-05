# 建库：把模板铺进记忆根目录
# 用法：powershell -ExecutionPolicy Bypass -File .\install.ps1 [-Target <路径>]

param(
  [string]$Target = (Join-Path $env:USERPROFILE ".memory")
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8 = New-Object System.Text.UTF8Encoding($false)

Write-Host "记忆根目录：$Target"

foreach ($d in @("identity","user","sea","skills","decisions","projects","concepts","archive","raw","tools")) {
  $p = Join-Path $Target $d
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null; Write-Host "  建目录 $d" }
}

$copy = @{
  "template\SOUL.md"      = "SOUL.md"
  "template\MEMORY.md"    = "MEMORY.md"
  "template\BOOTSTRAP.md" = "BOOTSTRAP.md"
  "template\index.md"     = "index.md"
  "template\log.md"       = "log.md"
  "template\anchors.md"   = "anchors.md"
  "tools\decay.mjs"       = "tools\decay.mjs"
}

foreach ($k in $copy.Keys) {
  $src = Join-Path $here $k
  $dst = Join-Path $Target $copy[$k]
  if (Test-Path $dst) {
    Write-Host "  已存在，跳过：$($copy[$k])（要覆盖自己删）"
    continue
  }
  $text = Get-Content $src -Raw -Encoding UTF8
  [System.IO.File]::WriteAllText($dst, $text, $utf8)   # 无 BOM
  Write-Host "  写入 $($copy[$k])"
}

Write-Host ""
Write-Host "下一步："
Write-Host "  1. 编辑 $(Join-Path $Target 'SOUL.md')，把 <!-- ... --> 换成你自己的话"
Write-Host "  2. 自检：node `"$(Join-Path $Target 'tools\decay.mjs')`" --lifecycle --dry-run"
Write-Host "  3. 若用 dsh-plugin-memory：确认插件指向该目录，再跑一次 lint"

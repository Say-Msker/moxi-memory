# 推送前扫一遍：密钥、绝对路径、手机号、邮箱
# 用法：powershell -File .\scripts\scan-sensitive.ps1 [-Path .]
# 退出码 1 = 发现可疑内容（别推）

param(
  [string]$Path = "."
)

$ErrorActionPreference = "Stop"
$files = Get-ChildItem -Path $Path -Recurse -File -Include *.md,*.mjs,*.json,*.ps1,*.yml,*.yaml,*.txt |
  Where-Object { $_.FullName -notmatch "\\\.git\\" }

$rules = @(
  @{ name = "密钥";       pattern = "sk-[A-Za-z0-9._\-]{12,}";          },
  @{ name = "用户目录";   pattern = "[A-Za-z]:\\Users\\[A-Za-z0-9._\-]+"; },
  @{ name = "手机号";     pattern = "(?<!\d)1[3-9]\d{9}(?!\d)";        },
  @{ name = "邮箱";       pattern = "[A-Za-z0-9._%\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"; },
  @{ name = "疑似口令";   pattern = "(?i)(token|secret|password|api[_-]?key)\s*[:=]\s*\S{8,}"; }
)

$hits = 0
foreach ($f in $files) {
  $rel = Resolve-Path -Relative $f.FullName
  $line = 0
  foreach ($l in Get-Content $f.FullName -Encoding UTF8) {
    $line++
    foreach ($r in $rules) {
      if ($l -match $r.pattern) {
        Write-Host ("[{0}] {1}:{2}  {3}" -f $r.name, $rel, $line, $l.Trim())
        $hits++
      }
    }
  }
}

if ($hits -gt 0) {
  Write-Host ""
  Write-Host "发现 $hits 处可疑内容，先处理再推。" -ForegroundColor Yellow
  exit 1
}

Write-Host "干净：$($files.Count) 个文件，没有命中规则。" -ForegroundColor Green
exit 0

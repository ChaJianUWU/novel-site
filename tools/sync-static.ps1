# 把 data/kv.json 的最新内容渲染成静态页并推到 GitHub Pages 的 gh-pages 分支。
# 目的：电脑关机时读者仍能打开 https://chajianuwu.github.io/novel-site/
# 由 run-forever.ps1 在检测到 kv.json 变化后调用，也可以手动跑。
param([switch]$Force)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'data\kv.json'))) { $root = 'D:\DFY\novel-site-server' }
Set-Location $root

$kvFile = Join-Path $root 'data\kv.json'
$stampFile = Join-Path $root 'status-static.txt'
$logFile = Join-Path $root 'sync-static.log'

function Log($m) {
  $line = (Get-Date -Format 'MM-dd HH:mm:ss') + ' ' + $m
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

$kvTime = (Get-Item $kvFile).LastWriteTimeUtc
if (-not $Force -and (Test-Path $stampFile)) {
  $prev = (Get-Content $stampFile -Raw).Trim()
  if ($prev -eq $kvTime.Ticks.ToString()) { return }
}
# 防抖：刚写入不到 20 秒就等下一轮
if (-not $Force -and ((Get-Date).ToUniversalTime() - $kvTime).TotalSeconds -lt 20) { return }

Log '开始同步静态镜像'

node tools/build-static.mjs 2>&1 | ForEach-Object { Log ('  ' + $_) }
if (-not (Test-Path (Join-Path $root 'dist\index.html'))) { Log '构建失败，跳过推送'; return }

$tokPath = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\data\novel-site-secrets\github-token.txt'
if (-not (Test-Path $tokPath)) { Log '缺少 GitHub 令牌，跳过推送'; return }
$tok = (Get-Content $tokPath -Raw).Trim()

$tmp = 'D:\DFY\_ghpages'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
Copy-Item -Path (Join-Path $root 'dist\*') -Destination $tmp -Recurse -Force

$git = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path $git)) { $git = 'git' }
Push-Location $tmp
& $git init -q 2>&1 | Out-Null
& $git checkout -q -b gh-pages 2>&1 | Out-Null
& $git add -A 2>&1 | Out-Null
& $git -c user.email='site@local' -c user.name='novel-site' commit -q -m ("static mirror " + (Get-Date -Format 'yyyy-MM-dd HH:mm')) 2>&1 | Out-Null
& $git remote add origin "https://x-access-token:$tok@github.com/ChaJianUWU/novel-site.git" 2>&1 | Out-Null
$out = & $git push -f -q origin gh-pages 2>&1
Pop-Location
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

$err = ($out | Out-String) -replace [regex]::Escape($tok), '***'
if ($LASTEXITCODE -eq 0) {
  Log '推送成功 https://chajianuwu.github.io/novel-site/'
  Set-Content -Path $stampFile -Value $kvTime.Ticks -Encoding UTF8
} else {
  Log ('推送失败: ' + $err)
}

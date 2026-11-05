# 小说站常驻守护 v2
# 本地 node 站点 + serveo 公网隧道
# 每 10 秒探测一次公网真实可用性；连续 2 次不通立即重连同一条保留子域，地址不变
# 状态写入 status.json，公网 /status 页面可直接查看
$ErrorActionPreference = 'SilentlyContinue'
$root = 'D:\DFY\novel-site-server'
$port = 8787
$sub  = 'novelbook'
$log  = Join-Path $root 'tunnel-serveo.log'
$plugin = 'http://127.0.0.1:49679/dsh-novel-share'
$syncKey = 'ea44e1ac8b71e533450b4186'
$lastUrlFile = Join-Path $root 'last-url.txt'
$statusFile = Join-Path $root 'status.json'

Set-Location $root

# 单实例：独占绑定本机端口 8788，抢不到说明已有守护在跑，直接退出
try {
  $script:gate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 8788)
  $script:gate.Start()
} catch {
  exit
}

$script:tunnelStart  = 0
$script:reconnects   = 0
$script:useRandom    = $false
$script:lastOk       = 0
$script:lastFail     = 0
$script:url          = ''
$script:failStreak   = 0
$script:watchdogStart = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())

function Now-Ms { [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) }

function Log($m) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content -Path (Join-Path $root 'keepalive.log') -Value $line -Encoding UTF8
}

function Save-Status {
  $o = [ordered]@{
    url           = $script:url
    tunnelStart   = $script:tunnelStart
    lastOk        = $script:lastOk
    lastFail      = $script:lastFail
    reconnects    = $script:reconnects
    watchdogStart = $script:watchdogStart
    updated       = (Now-Ms)
  }
  try { [IO.File]::WriteAllText($statusFile, ($o | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false)) } catch {}
}

function Ensure-Site {
  $listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listen) {
    Start-Process -FilePath 'node' -ArgumentList 'server.mjs' -WorkingDirectory $root -WindowStyle Hidden
    Log '本地站点已启动'
    Start-Sleep -Seconds 3
  }
}

function Get-PublicUrl {
  if (Test-Path $log) {
    $m = (Get-Content $log -Tail 80 | Select-String -Pattern 'https://[a-z0-9\-]+\.serveousercontent\.com') | Select-Object -Last 1
    if ($m) { return [regex]::Match($m.ToString(), 'https://[a-z0-9\-]+\.serveousercontent\.com').Value }
  }
  if (Test-Path $lastUrlFile) {
    $u = (Get-Content $lastUrlFile -Raw).Trim()
    if ($u) { return $u }
  }
  return ''
}

function Test-Public {
  param([string]$url)
  if (-not $url) { return $false }
  $code = & curl.exe -s --ssl-no-revoke -m 15 -o NUL -w '%{http_code}' "$url/healthz"
  return ("$code".Trim() -eq '200')
}

function Get-TunnelProc {
  Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | Where-Object { $_.CommandLine -match 'serveo\.net' }
}

function Stop-Tunnel {
  Get-TunnelProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }
  Start-Sleep -Seconds 2
}

function Start-Tunnel {
  if ($sub -and -not $script:useRandom) { $remote = "${sub}:80:localhost:$port" } else { $remote = "80:localhost:$port" }
  $cmd = 'ssh -T -i serveo_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -o ConnectTimeout=15 -o ExitOnForwardFailure=yes -R ' + $remote + ' serveo.net >> tunnel-serveo.log 2>&1'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmd -WindowStyle Hidden
  $script:tunnelStart = (Now-Ms)
  Log '公网隧道已启动，等待连通'
  for ($i = 1; $i -le 8; $i++) {
    Start-Sleep -Seconds 3
    $u = Get-PublicUrl
    if ($u -and (Test-Public $u)) {
      $script:url = $u
      $script:lastOk = (Now-Ms)
      $script:failStreak = 0
      Log "公网已连通: $u"
      return
    }
  }
  Log '启动后 24 秒内公网仍未连通，下轮继续'
}

function Ensure-Tunnel {
  if (-not (Get-TunnelProc)) {
    Log '隧道进程不在，拉起'
    $script:tunnelStart = 0
    Start-Tunnel
    return
  }
  $u = Get-PublicUrl
  if (-not $u) { $u = $script:url }
  if ($u -and (Test-Public $u)) {
    $script:url = $u
    $script:lastOk = (Now-Ms)
    if ($script:tunnelStart -eq 0) {
      $tp = Get-TunnelProc | Select-Object -First 1
      if ($tp -and $tp.CreationDate) { $script:tunnelStart = [int64](([DateTimeOffset]$tp.CreationDate).ToUnixTimeMilliseconds()) }
      else { $script:tunnelStart = (Now-Ms) }
    }
    if ($script:failStreak -gt 0) { Log "公网已恢复: $u" }
    $script:failStreak = 0
    return
  }
  $script:lastFail = (Now-Ms)
  $script:failStreak++
  Log "公网不通 $($script:failStreak) 次: $u"
  if ($script:failStreak -ge 2) {
    Stop-Tunnel
    $script:reconnects++
    $script:tunnelStart = 0
    $script:failStreak = 0
    if ($script:reconnects -ge 5 -and -not $script:useRandom) {
      $script:useRandom = $true
      Log '保留子域连续抢不到，改用随机地址（新地址会自动推送）'
    }
    Start-Tunnel
  }
}

function Sync-Url {
  if (-not $script:url) { return }
  $url = $script:url
  $last = if (Test-Path $lastUrlFile) { (Get-Content $lastUrlFile -Raw).Trim() } else { '' }
  if ($url -eq $last) { return }
  $body = @{ provider = 'selfhost'; publicUrl = $url; syncKey = $syncKey } | ConvertTo-Json -Compress
  $tmp = Join-Path $env:TEMP 'plugin-cfg.json'
  try { [IO.File]::WriteAllText($tmp, $body, [Text.UTF8Encoding]::new($false)) } catch { return }
  & curl.exe -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "$plugin/api/deploy-config" | Out-Null
  & curl.exe -s -m 120 -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "$plugin/api/deploy" | Out-Null
  Set-Content -Path $lastUrlFile -Value $url -Encoding UTF8
  Log "公网地址已更新并推送: $url"
}

Log '守护启动 v2（10 秒探测，连续 2 次不通立即重连）'
while ($true) {
  try {
    Ensure-Site
    Ensure-Tunnel
    Sync-Url
    Save-Status
  } catch {
    Log ('循环异常: ' + $_.Exception.Message)
  }
  Start-Sleep -Seconds 10
}

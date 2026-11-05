# 小说站常驻守护
# 作用：本地 Node 站点 + serveo 公网隧道；掉线自动拉起，隧道「假活」（ssh 在但公网 502/超时）也会自动重连
# 固定子域被 serveo 占用时会自动改用随机地址，并把新地址推给插件面板
$ErrorActionPreference = 'SilentlyContinue'
$root = 'D:\DFY\novel-site-server'
$port = 8787
$sub  = 'novelbook'    # 已在 serveo 控制台注册的保留域名；万一抢不到会退回随机地址
$log  = Join-Path $root 'tunnel-serveo.log'
$plugin = 'http://127.0.0.1:49679/dsh-novel-share'
$syncKey = 'ea44e1ac8b71e533450b4186'
$lastUrlFile = Join-Path $root 'last-url.txt'
Set-Location $root

$script:tunnelFail = 0   # 连续公网探测失败次数
$script:reconnects = 0   # 本轮连续强制重连次数
$script:useRandom = $false

function Log($m) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content -Path (Join-Path $root 'keepalive.log') -Value $line -Encoding UTF8
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
  # 以隧道日志最新打印的地址为准（重连后地址可能变），last-url.txt 只作兜底
  if (Test-Path $log) {
    $m = (Get-Content $log -Tail 60 | Select-String -Pattern 'https://[a-z0-9\-]+\.serveousercontent\.com') | Select-Object -Last 1
    if ($m) {
      return [regex]::Match($m.ToString(), 'https://[a-z0-9\-]+\.serveousercontent\.com').Value
    }
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
  $code = & curl.exe -s --ssl-no-revoke -m 20 -o NUL -w '%{http_code}' "$url/healthz"
  return ($code -eq '200')
}

function Get-TunnelProc {
  Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | Where-Object { $_.CommandLine -match 'serveo\.net' }
}

function Stop-Tunnel {
  Get-TunnelProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep -Seconds 2
}

function Start-Tunnel {
  if ($sub -and -not $script:useRandom) { $remote = "${sub}:80:localhost:$port" } else { $remote = "80:localhost:$port" }
  $cmd = 'ssh -T -i serveo_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ConnectTimeout=15 -o ExitOnForwardFailure=yes -R ' + $remote + ' serveo.net >> tunnel-serveo.log 2>&1'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmd -WindowStyle Hidden
  if ($script:useRandom) { Log '公网隧道已启动（固定子域被占，先用随机地址救急）' } else { Log '公网隧道已启动' }
  Start-Sleep -Seconds 12
}

function Ensure-Tunnel {
  if (-not (Get-TunnelProc)) {
    if ($script:tunnelFail -gt 0) { Log "隧道进程不在，重连（上次连续失败 $($script:tunnelFail) 次）" }
    Start-Tunnel
    $script:tunnelFail = 0
    return
  }
  # 进程在，但可能已假活（serveo 那侧回 502）：用公网健康检查确认
  $url = Get-PublicUrl
  if (Test-Public $url) {
    if ($script:tunnelFail -gt 0) { Log "公网已恢复: $url" }
    $script:tunnelFail = 0
    $script:reconnects = 0
    return
  }
  $script:tunnelFail++
  Log "公网探测失败 $($script:tunnelFail) 次: $url"
  if ($script:tunnelFail -ge 2) {
    Log '判定隧道假活，强制重连'
    Stop-Tunnel
    $script:tunnelFail = 0
    $script:reconnects++
    if ($script:reconnects -ge 3 -and -not $script:useRandom) {
      $script:useRandom = $true
      Log '固定子域连续抢不到，改用随机地址（新地址会自动推送）'
    }
    Start-Tunnel
  }
}

function Sync-Url {
  if (-not (Test-Path $log)) { return }
  $m = (Get-Content $log -Tail 40 | Select-String -Pattern 'https://[a-z0-9\-]+\.serveousercontent\.com') | Select-Object -Last 1
  if (-not $m) { return }
  $url = [regex]::Match($m.ToString(), 'https://[a-z0-9\-]+\.serveousercontent\.com').Value
  if (-not $url) { return }
  $last = if (Test-Path $lastUrlFile) { (Get-Content $lastUrlFile -Raw).Trim() } else { '' }
  if ($url -eq $last) { return }
  if (-not (Test-Public $url)) { return }
  $body = @{ provider = 'selfhost'; publicUrl = $url; syncKey = $syncKey } | ConvertTo-Json -Compress
  $tmp = Join-Path $env:TEMP 'plugin-cfg.json'
  [IO.File]::WriteAllText($tmp, $body, [Text.UTF8Encoding]::new($false))
  & curl.exe -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "$plugin/api/deploy-config" | Out-Null
  & curl.exe -s -m 120 -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "$plugin/api/deploy" | Out-Null
  Set-Content -Path $lastUrlFile -Value $url -Encoding UTF8
  Log "公网地址已更新并推送: $url"
}

Log '守护启动（公网健康探测 + 固定子域失败自动换随机地址）'
while ($true) {
  Ensure-Site
  Ensure-Tunnel
  Sync-Url
  Start-Sleep -Seconds 45
}

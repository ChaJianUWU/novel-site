# 小说站常驻守护
# 作用：本地 Node 站点 + serveo 公网隧道，掉线自动拉起；隧道地址变了自动写回插件
$ErrorActionPreference = 'SilentlyContinue'
$root = 'D:\DFY\novel-site-server'
$port = 8787
$sub  = 'novelbook'             # serveo 密钥已注册，固定子域名 https://novelbook.serveo.net
$key  = Join-Path $root 'serveo_key'
$log  = Join-Path $root 'tunnel-serveo.log'
$plugin = 'http://127.0.0.1:49679/dsh-novel-share'
$syncKey = 'ea44e1ac8b71e533450b4186'
$lastUrlFile = Join-Path $root 'last-url.txt'
Set-Location $root

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

function Ensure-Tunnel {
  if (Get-Process ssh -ErrorAction SilentlyContinue) { return }
  if ($sub) { $remote = "${sub}:80:localhost:$port" } else { $remote = "80:localhost:$port" }
  $cmd = 'ssh -T -i serveo_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -R ' + $remote + ' serveo.net >> tunnel-serveo.log 2>&1'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmd -WindowStyle Hidden
  Log '公网隧道已启动'
  Start-Sleep -Seconds 12
}

function Sync-Url {
  if (-not (Test-Path $log)) { return }
  $m = (Get-Content $log -Tail 40 | Select-String -Pattern 'https://[a-z0-9\-]+\.serveousercontent\.com') | Select-Object -Last 1
  if (-not $m) { return }
  $url = [regex]::Match($m.ToString(), 'https://[a-z0-9\-]+\.serveousercontent\.com').Value
  if (-not $url) { return }
  $last = if (Test-Path $lastUrlFile) { (Get-Content $lastUrlFile -Raw).Trim() } else { '' }
  if ($url -eq $last) { return }
  $probe = & curl.exe -s -m 15 -o NUL -w '%{http_code}' "$url/healthz"
  if ($probe -ne '200') { return }
  $body = @{ provider = 'selfhost'; publicUrl = $url; syncKey = $syncKey } | ConvertTo-Json -Compress
  $tmp = Join-Path $env:TEMP 'plugin-cfg.json'
  [IO.File]::WriteAllText($tmp, $body, [Text.UTF8Encoding]::new($false))
  & curl.exe -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "$plugin/api/deploy-config" | Out-Null
  & curl.exe -s -m 120 -X POST -H 'Content-Type: application/json' --data-binary "@$tmp" "$plugin/api/deploy" | Out-Null
  Set-Content -Path $lastUrlFile -Value $url -Encoding UTF8
  Log "公网地址已更新并推送: $url"
}

Log '守护启动'
while ($true) {
  Ensure-Site
  Ensure-Tunnel
  Sync-Url
  Start-Sleep -Seconds 45
}

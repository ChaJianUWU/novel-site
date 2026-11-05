@echo off
chcp 65001 >nul
title 停止小说站
powershell -NoProfile -Command "$p=Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if($p){ $p | ForEach-Object { Stop-Process -Id $_ -Force }; '已停止（端口 8787 已释放）' } else { '没有在跑的服务' }"
echo.
pause

@echo off
chcp 65001 >nul
title 小说站 - 公网隧道
cd /d "%~dp0.."

where ssh >nul 2>nul
if errorlevel 1 (
  echo.
  echo  没有找到 ssh 命令。Windows 10/11 一般自带：设置 ^> 应用 ^> 可选功能 ^> 添加「OpenSSH 客户端」。
  echo  或者改用 docs\上公网.md 里的 cloudflared 方案。
  echo.
  pause
  exit /b 1
)

echo 先确认网站已经在跑（另一个窗口「一键启动.bat」）。
echo 现在开一条免费隧道，稍等几秒会打印一个 https 网址，发给别人就能看。
echo 这个窗口别关；关掉网址就失效。按 Ctrl+C 断开。
echo ------------------------------------------------------------
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:8787 serveo.net
echo.
echo 隧道已断开。
pause

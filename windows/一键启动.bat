@echo off
chcp 65001 >nul
title 小说站 - 本机运行中
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  没有找到 Node.js。
  echo  1^) 打开 https://nodejs.org/zh-cn  下载 LTS 版本
  echo  2^) 一路下一步装完，关掉这个窗口重新双击本文件
  echo.
  pause
  exit /b 1
)

if not exist data mkdir data

echo 地址：http://127.0.0.1:8787
echo 手机同 Wi-Fi 想看：把 127.0.0.1 换成本机内网 IP（下面会打印）
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo   内网地址: %%a
echo.
echo 这个窗口别关，关掉网站就停了。停止请按 Ctrl+C 或双击 停止.bat
echo ------------------------------------------------------------
start "" http://127.0.0.1:8787
node server.mjs
echo.
echo 服务已退出。
pause

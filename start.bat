@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 이상을 설치한 후 다시 실행해 주세요.
  pause
  exit /b 1
)
echo 브라우저에서 http://127.0.0.1:4173 을 열어 주세요.
call npm start
if errorlevel 1 pause

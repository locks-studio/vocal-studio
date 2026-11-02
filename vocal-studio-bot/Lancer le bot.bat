@echo off
cd /d "%~dp0"
rem Le bot a besoin de Node.js. Sans lui, on explique quoi faire au lieu d'une erreur obscure.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe sur ce PC : le bot en a besoin.
  echo Installe la version LTS depuis https://nodejs.org ^(la page s'ouvre^), puis relance ce fichier.
  start "" https://nodejs.org/fr/download
  pause
  exit /b 1
)
if not exist .env (
  echo Il manque le fichier .env : lance "Configurer le bot.bat".
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installation des dependances...
  call npm install
)
rem Tunnel Tailscale : rend le bot joignable par tes amis (adresse https://...ts.net)
if exist "%ProgramFiles%\Tailscale\tailscale.exe" "%ProgramFiles%\Tailscale\tailscale.exe" funnel --bg 8787
node src\index.js
pause

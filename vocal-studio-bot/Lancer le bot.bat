@echo off
cd /d "%~dp0"
if not exist .env (
  echo Il manque le fichier .env : copie .env.example en .env et remplis-le.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installation des dependances...
  call npm install
)
node src\index.js
pause

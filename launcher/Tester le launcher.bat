@echo off
cd /d "%~dp0"
rem Teste le launcher 1999 sur ce PC, sans rien mettre en ligne
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe sur ce PC.
  echo Installe la version LTS depuis https://nodejs.org ^(la page s'ouvre^), puis relance ce fichier.
  start "" https://nodejs.org/fr/download
  pause
  exit /b 1
)
if not exist node_modules\electron (
  echo Installation des dependances du launcher ^(une seule fois^)...
  call npm install
)
node tools\test-local.js
if errorlevel 1 pause

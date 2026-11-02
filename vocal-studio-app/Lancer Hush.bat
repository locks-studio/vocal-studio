@echo off
cd /d "%~dp0"
rem Hush a besoin de Node.js (il fournit npm et npx). Sans lui, on explique quoi faire au lieu d'une erreur obscure.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe sur ce PC : Hush en a besoin pour demarrer.
  echo Installe la version LTS depuis https://nodejs.org ^(la page s'ouvre^), puis relance ce fichier.
  start "" https://nodejs.org/fr/download
  pause
  exit /b 1
)
if not exist node_modules\electron (
  echo Installation des dependances ^(une seule fois, quelques minutes^)...
  call npm install
  if errorlevel 1 (
    echo L'installation a echoue. Verifie ta connexion internet et relance ce fichier.
    pause
    exit /b 1
  )
)
start "" npx electron .

@echo off
rem Lance Hush directement depuis le code (la « preview ») : tu testes les modifs avant de les publier.
rem Quitte d'abord le vrai Hush (clic droit sur son icone pres de l'horloge > Quitter Hush), sinon c'est lui qui s'ouvre.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe : installe la version LTS depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installation des dependances...
  call npm install
)
echo Hush (preview) demarre... Ferme sa fenetre ou fais Ctrl+C ici pour l'arreter.
call npx electron .

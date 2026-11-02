@echo off
chcp 65001 >nul
rem Envoie le code du bot sur le VPS et l'installe (ou le met à jour). Les secrets (.env) ne quittent pas le VPS.
cd /d "%~dp0"
set /p VPS=Adresse IP du VPS : 
set /p DOMAIN=Adresse du serveur (ex. bot.organisationphantom.fr) : 
tar -czf "%TEMP%\hush-bot.tgz" --exclude=node_modules --exclude=.env --exclude=sessions.json --exclude=*.bat src deploy package.json package-lock.json
if errorlevel 1 goto :err
scp "%TEMP%\hush-bot.tgz" deploy/install.sh root@%VPS%:/root/
if errorlevel 1 goto :err
ssh -t root@%VPS% "bash /root/install.sh %DOMAIN% /root/hush-bot.tgz"
if errorlevel 1 goto :err
echo.
echo Termine.
pause
exit /b
:err
echo.
echo Une etape a echoue (voir le message au-dessus).
pause

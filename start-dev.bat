@echo off
title KitchensPlus CRM - Dev Server

:: Set Node.js path
set PATH=C:\Users\Chad b Price\nodejs;%PATH%

:: Start MariaDB if not already running
echo Checking MariaDB...
tasklist /FI "IMAGENAME eq mariadbd.exe" 2>NUL | find /I "mariadbd.exe" >NUL
if errorlevel 1 (
    echo Starting MariaDB...
    start /B "" "C:\Users\Chad b Price\mariadb\bin\mariadbd.exe" --datadir="C:\Users\Chad b Price\mariadb-data" --port=3306 --console
    timeout /t 4 /nobreak >nul
    echo MariaDB started.
) else (
    echo MariaDB already running.
)

:: Start the dev server
echo.
echo Starting KitchensPlus CRM dev server...
echo.
echo ==============================================
echo  Open: http://localhost:3000
echo  Dev Login: http://localhost:3000/api/dev/login
echo ==============================================
echo.

cd /d "C:\Users\Chad b Price\Downloads\kitchensplus-crm"
pnpm dev

pause

@echo off
rem Build app, chay app o cong 3000 (cua so rieng), roi mo ngrok de truy cap tu Internet.
rem Can NGROK_AUTHTOKEN va NGROK_DOMAIN trong file .env.
rem Bo qua buoc build: start-public.cmd nobuild
setlocal
cd /d "%~dp0"

set "PORT=3000"
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
  if "%%a"=="NGROK_AUTHTOKEN" set "NGROK_AUTHTOKEN=%%b"
  if "%%a"=="NGROK_DOMAIN" set "NGROK_DOMAIN=%%b"
  if "%%a"=="PORT" set "PORT=%%b"
)
if not defined NGROK_AUTHTOKEN goto :missing_env
if not defined NGROK_DOMAIN goto :missing_env
set "NGROK_DOMAIN=%NGROK_DOMAIN:https://=%"
set "NGROK_DOMAIN=%NGROK_DOMAIN:/=%"

rem Tim ngrok: trong PATH, hoac thu muc winget cai vao (khi terminal chua nap lai PATH).
set "NGROK=ngrok"
where ngrok >nul 2>nul
if errorlevel 1 set "NGROK=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
if not "%NGROK%"=="ngrok" if not exist "%NGROK%" (
  echo [loi] Khong tim thay ngrok. Cai bang: winget install Ngrok.Ngrok
  exit /b 1
)

netstat -ano | findstr /r /c:"LISTENING" | findstr /c:":%PORT% " >nul
if not errorlevel 1 (
  echo [loi] Cong %PORT% dang bi chiem. Tat "pnpm dev" hoac app dang chay roi thu lai.
  exit /b 1
)

if /i not "%~1"=="nobuild" (
  echo === Build app ===
  call pnpm build
  if errorlevel 1 (
    echo [loi] Build that bai.
    exit /b 1
  )
)

echo === Chay app o cong %PORT% (cua so "for-kids app") ===
start "for-kids app" cmd /k pnpm start

echo Doi app san sang...
for /l %%i in (1,1,30) do (
  curl -s -o nul -f http://localhost:%PORT%/api/health && goto :ready
  timeout /t 1 /nobreak >nul
)
echo [loi] App khong chay sau 30 giay. Xem loi trong cua so "for-kids app".
exit /b 1

:ready
rem ngrok chay o cua so rieng vi giao dien cua no xoa man hinh, se lam mat ma QR.
echo === Mo ngrok (cua so "for-kids ngrok") ===
start "for-kids ngrok" "%NGROK%" http %PORT% --url=%NGROK_DOMAIN% --authtoken=%NGROK_AUTHTOKEN%

echo Doi ngrok ket noi...
for /l %%i in (1,1,20) do (
  curl -s -o nul -f https://%NGROK_DOMAIN%/api/health && goto :tunnel_ready
  timeout /t 1 /nobreak >nul
)
echo [canh bao] Chua vao duoc https://%NGROK_DOMAIN% sau 20 giay. Xem cua so "for-kids ngrok".

:tunnel_ready
echo.
echo === App da chay ===
echo   Trong mang nha: http://localhost:%PORT%
echo   Tu Internet:    https://%NGROK_DOMAIN%
echo.
echo Quet ma QR bang iPad de mo app:
node scripts\qr.mjs https://%NGROK_DOMAIN%
echo Tat: dong cua so "for-kids ngrok" va "for-kids app".
exit /b 0

:missing_env
echo [loi] Thieu NGROK_AUTHTOKEN hoac NGROK_DOMAIN trong .env
echo   Lay o https://dashboard.ngrok.com (Your Authtoken, Domains) roi dien vao .env:
echo     NGROK_AUTHTOKEN=...
echo     NGROK_DOMAIN=ten-cua-ban.ngrok-free.app
exit /b 1

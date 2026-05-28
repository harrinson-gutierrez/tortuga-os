@echo off
REM Carga el entorno MSVC + cargo + nodejs y ejecuta `pnpm tauri dev`.
REM Necesario en Windows porque Rust requiere link.exe MSVC en el PATH.

REM Asegurar que cargo y nodejs/pnpm estén disponibles antes de vcvars
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "PATH=%APPDATA%\npm;%PATH%"
set "PATH=C:\Program Files\nodejs;%PATH%"

REM Añadir directorios de Visual Studio (donde vive vswhere.exe)
set "PATH=C:\Program Files (x86)\Microsoft Visual Studio\Installer;%PATH%"
set "PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE;%PATH%"
set "PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools;%PATH%"

call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 (
  echo ERROR: vcvars64.bat fallo
  exit /b 1
)

REM Verificar que las herramientas están disponibles
where cargo >nul 2>&1
if errorlevel 1 (
  echo ERROR: cargo no encontrado en PATH
  exit /b 1
)
where pnpm >nul 2>&1
if errorlevel 1 (
  echo ERROR: pnpm no encontrado en PATH
  exit /b 1
)
where link.exe >nul 2>&1
if errorlevel 1 (
  echo WARN: link.exe no encontrado (puede causar errores de compilacion)
)

cd /d "%~dp0.."
echo === MSVC env loaded. Running tauri dev... ===
call pnpm --filter @tortuga/desktop tauri dev

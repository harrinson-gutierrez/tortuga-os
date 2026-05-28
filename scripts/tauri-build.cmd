@echo off
REM Carga el entorno MSVC y ejecuta `pnpm tauri build` (release).
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
  echo ERROR: vcvars64.bat fallo
  exit /b 1
)

cd /d "%~dp0.."
echo === MSVC env loaded. Running tauri build... ===
call pnpm --filter @tortuga/sidecar build
call pnpm --filter @tortuga/desktop tauri build

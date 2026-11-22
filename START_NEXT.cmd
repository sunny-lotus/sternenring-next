@echo off
rem STERNENRING NEXT (P1) - local check server. Port 8131 (not 8081 = old game).
setlocal
cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
start "" http://127.0.0.1:8131/
"%NODE_EXE%" tools\serve.cjs --port 8131
pause

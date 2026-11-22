@echo off
rem STERNENRING NEXT - open from a phone on the same Wi-Fi. Port 8132 (not 8081 = old game).
rem HTTP only (not https). The window shows the address to type on the phone: http://192.168.x.x:8132/
rem It also shows when the phone reaches this PC, and when someone tried https by mistake.
rem First time only: Windows may ask to allow Node.js on networks. Allow "Private networks" only.
setlocal
cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
"%NODE_EXE%" tools\serve.cjs --port 8132 --host 0.0.0.0
pause

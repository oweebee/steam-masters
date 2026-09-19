@echo off
del /f /q .git\index.lock 2>nul
git add -A
git commit -m "scaffold initial"
git push -u origin main
pause

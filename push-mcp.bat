@echo off
setlocal
cd /d "%~dp0"

git rev-parse --show-toplevel >nul 2>&1
if errorlevel 1 (
  echo Erreur : ce fichier doit rester a la racine du depot Git.
  goto :failed
)

rem N'inclure aucune modification deja presente dans l'index.
git diff --cached --quiet
if errorlevel 1 (
  echo Erreur : l'index contient deja des changements. Committez-les ou desindexez-les avant ce push.
  goto :failed
)

rem Eviter de pousser accidentellement des commits locaux anterieurs.
set "UPSTREAM="
for /f "delims=" %%U in ('git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2^>nul') do set "UPSTREAM=%%U"
if not defined UPSTREAM (
  echo Erreur : cette branche n'a pas de branche distante associee.
  goto :failed
)

set "AHEAD="
set "BEHIND="
for /f "tokens=1,2" %%A in ('git rev-list --left-right --count %UPSTREAM%...HEAD') do (
  set "BEHIND=%%A"
  set "AHEAD=%%B"
)
if not "%AHEAD%"=="0" (
  echo Erreur : la branche locale contient deja des commits non pousses.
  goto :failed
)
if not "%BEHIND%"=="0" (
  echo Erreur : la branche locale n'est pas a jour avec %UPSTREAM%. Faites un pull/rebase avant.
  goto :failed
)

git add -- .env.example docker-compose.yml .mcp.json MCP.md
if errorlevel 1 (
  echo Erreur pendant l'ajout des quatre fichiers MCP.
  goto :failed
)

echo.
echo Fichiers qui seront commites :
git diff --cached --name-only
echo.
git commit -m "Configure shared MCP access for Claude"
if errorlevel 1 (
  echo Erreur de commit. Les fichiers MCP peuvent rester indexes.
  goto :failed
)

git push
if errorlevel 1 (
  echo Push echoue. Le commit MCP reste local; aucun push force n'a ete tente.
  goto :failed
)

echo.
echo Push MCP termine. Redemarrez ensuite le deploiement Coolify.
pause
exit /b 0

:failed
echo.
pause
exit /b 1

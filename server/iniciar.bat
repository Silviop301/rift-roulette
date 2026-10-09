@echo off
rem Liga o servidor do Rift Roulette e abre o tunel da Cloudflare.
cd /d "%~dp0"
if not exist ".env" (
  echo Falta o arquivo .env com a sua chave da Riot. Veja o LEIAME.md.
  pause
  exit /b 1
)
start "Rift Roulette - servidor" cmd /k node server.mjs
echo.
echo Abrindo o tunel. Procure abaixo um link terminado em .trycloudflare.com
echo Deixe esta janela aberta enquanto quiser o site com a API da Riot.
echo.
cloudflared tunnel --url http://localhost:8787
pause

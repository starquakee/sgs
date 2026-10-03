@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 三国杀 · 十周年单机研习
echo 启动后请访问 http://127.0.0.1:8081/sgs.html
echo 游戏期间请保留此窗口，关闭窗口可停止服务。
if exist "dist-sgs\sgs.html" (
  node scripts/sgs/serve.mjs
) else (
  node scripts/sgs/dev.mjs
)
pause

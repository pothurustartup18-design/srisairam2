@echo off
title School ERP Observability Stack Manager

echo ===================================================
echo   Starting Local Observability Stack (Docker Compose)
echo ===================================================

:: Navigate to the rnd-monitor directory and spin up containers
cd /d "%~dp0..\rnd-monitor"
docker compose up --build -d

echo ===================================================
echo   Observability services are starting up!
echo   - Grafana: http://localhost:3001 (admin / admin)
echo   - Prometheus: http://localhost:9090
echo   - Alertmanager: http://localhost:9093
echo ===================================================
pause

@echo off
chcp 65001 >nul
title PDF Studio Pro - Cross-Platform Server
echo ===============================================================
echo   🚀 PDF Studio Pro (Windows / macOS / Linux / iOS / Android)
echo   💻 เปิดบนเครื่องนี้: http://127.0.0.1:8000
echo   📱 มือถือ/แท็บเล็ตในวง Wi-Fi เดียวกัน: กดปุ่ม "เชื่อมต่อมือถือ/QR" บนหน้าเว็บ
echo ===============================================================
start "" "http://127.0.0.1:8000"
python -m uvicorn app:app --host 0.0.0.0 --port 8000
pause

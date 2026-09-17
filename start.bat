@echo off
echo ========================================
echo   EchoText Ghana - Starting MVP
echo ========================================
echo.

echo [1/2] Starting Backend (FastAPI + WebSocket)...
cd backend
if not exist venv (
    echo Creating Python virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt >nul 2>&1
echo Backend starting at http://localhost:8000
start "EchoText Backend" cmd /c "python main.py"

echo.
echo [2/2] Starting Frontend (React + Vite)...
cd ..\frontend
if not exist node_modules (
    echo Installing Node.js dependencies...
    call npm install
)
echo Frontend starting at http://localhost:3000
start "EchoText Frontend" cmd /c "npm run dev"

echo.
echo ========================================
echo   EchoText Ghana is running!
echo ========================================
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo.
echo   Press any key to open browser...
pause >nul
start http://localhost:3000

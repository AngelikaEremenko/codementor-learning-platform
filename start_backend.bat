@echo off
echo Запуск Django backend через venv...
cd /d "%~dp0"
call venv\Scripts\activate.bat
cd backend
python manage.py runserver
pause

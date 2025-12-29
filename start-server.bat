@echo off
cd /d "D:\Budget App\backend"
call venv\Scripts\activate
python -m waitress --port=5050 wsgi:app

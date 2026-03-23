@echo off
echo Starting ASM Prototype...

echo Starting Backend API (using conda 'asm' environment)...
start cmd /k "cd backend && conda run -n asm python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Frontend Next.js Server...
start cmd /k "cd frontend && npm run dev"

echo Done! Both servers are starting in new windows.

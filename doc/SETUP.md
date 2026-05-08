# SETUP

## Prerequisites

- Node.js 20+
- .NET SDK 8 hoặc 9
- SQL Server LocalDB nếu muốn chuyển từ demo in-memory sang database thật

## Chạy nhanh

```powershell
.\RunAll.bat
```

Sau khi chạy:

- Backend: `http://localhost:5000`
- Swagger: `http://localhost:5000/swagger`
- Frontend: `http://localhost:5173`

## Backend

```powershell
cd backend
dotnet restore
dotnet run --urls=http://localhost:5000
```

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

File `.env` có thể tạo từ `.env.example`. Biến chính:

```text
VITE_API_BASE=http://localhost:5000
```

## Gemini

```powershell
setx GEMINI_API_KEY "your-key"
```

Nếu chưa set key, endpoint AI dùng fallback rule-based để demo không bị gãy.

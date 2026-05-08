# Michi

Website bán quần áo Michi theo `detail_plan.md`.

## Chạy nhanh

```powershell
.\RunAll.bat
```

- Backend: `http://localhost:5000`
- Swagger: `http://localhost:5000/swagger`
- Frontend: `http://localhost:5173`

## Tài khoản demo

```text
Admin:    admin@michi.local    / Admin@123
Staff:    staff@michi.local    / Staff@123
Customer: customer@michi.local / Customer@123
```

## Kiểm tra

```powershell
.\scripts\recheck.bat
```

## Crawl ảnh sản phẩm

Kế hoạch crawl ảnh quần áo thật nằm ở [docs/CRAWL_DATA_PLAN.md](C:/Users/MInhhoangg/Desktop/AI/AI_PLAN/ThienPlanClothesMichi/docs/CRAWL_DATA_PLAN.md).

## Ghi chú

Bản hiện tại là MVP/scaffold chạy được: API dùng `DemoStore` in-memory để chạy nhanh. Các bước production tiếp theo là EF Core migrations thật, refresh token lưu DB, upload ảnh, Gemini call thật và test IPN VNPAY qua ngrok/public URL.

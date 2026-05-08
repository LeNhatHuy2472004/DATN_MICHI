# DATABASE

## SQL Server LocalDB

Project hiện dùng `DemoStore` in-memory để chạy ngay không cần cài database. Connection string LocalDB vẫn được cấu hình sẵn để chuyển sang EF Core migrations ở bước production.

```text
Server: (localdb)\MSSQLLocalDB
Database: MichiClothesDb
Auth: Windows Authentication
Connection String:
Server=(localdb)\MSSQLLocalDB;Database=MichiClothesDb;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true
```

## Tài khoản seed

```text
Admin:    admin@michi.local    / Admin@123
Staff:    staff@michi.local    / Staff@123
Customer: customer@michi.local / Customer@123
```

## VNPAY Sandbox

```text
TmnCode: CRA0CZJY
HashSecret: 1IPM09NUD6Y16TA3DH6UJ0YMK69B0RA3
ReturnUrl: http://localhost:5173/payment/vnpay-return
IpnUrl: http://localhost:5000/api/payments/vnpay/ipn
```

VNPAY IPN gọi từ internet sẽ không truy cập được `localhost`; khi test thật cần dùng ngrok và cập nhật `VnPay:IpnUrl`.

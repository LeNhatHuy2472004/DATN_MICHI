# KẾ HOẠCH DEV — THIENPLAN CLOTHES MICHI (Web bán quần áo)

> **Stack:** React (Vite + TS + Tailwind) · ASP.NET Core 8 Web API · SQL Server (LocalDB)
> **AI:** Google Gemini API (multimodal, free tier)
> **Payment:** Tiền mặt + VNPAY Sandbox
> **Plan version:** 1.2 — 2026-05-07
> **Changelog v1.1:** + Module nhắn tin tư vấn (chat) · VNPAY payment dùng modal/webview · `.bat` script chạy đồng thời FE+BE
> **Changelog v1.2:** ↻ VNPAY chuyển từ modal/iframe → **redirect rồi tự close tab/return về trang gốc** · + Custom loading **logo xoay** (logo auto-generate) toàn site · + Cơ chế **Feature Recheck Checklist** đảm bảo đủ chức năng trước bàn giao

---

## 1. CONTEXT — Tại sao làm & mục tiêu

Đây là project xây dựng **website bán quần áo** end-to-end nhằm phục vụ 2 actor chính:

- **Chủ shop (Administrator)** — toàn quyền cấu hình, CRUD sản phẩm/voucher, phân quyền staff, xem báo cáo.
- **Nhân viên (Staff)** — quyền giới hạn theo cấu hình của Admin (bán hàng tại quầy, thêm hàng, duyệt đơn…).
- **Khách hàng (Customer)** — duyệt sản phẩm, mua hàng (có hoặc không cần đăng ký), trả hàng, dùng voucher, được AI gợi ý phối đồ.

**Mục tiêu kỹ thuật:**

1. Đầy đủ luồng e-commerce cơ bản: catalog → cart → checkout → payment → shipping → return.
2. RBAC linh hoạt cho staff (Admin tự cấp/thu hồi từng quyền).
3. Tích hợp VNPAY sandbox (tận dụng sample `vnpay_cs/` đã có sẵn).
4. AI phối đồ qua Gemini API (USP của shop).
5. UX hạn chế nhập tay — ưu tiên dropdown, autocomplete, suggest.
6. DB chạy local (SQL Server LocalDB / Express), credential lưu trong `docs/DATABASE.md` để dễ bàn giao.
7. **Chat tư vấn realtime** giữa Customer ↔ Staff/Admin (background job poll/push tin nhắn mới).
8. **VNPAY redirect-tab + auto-close** — mở tab mới đến VNPAY, sau khi xử lý xong tab tự đóng và FE quay về trang gốc với kết quả.
9. **One-click run:** script `.bat` chạy đồng thời FE + BE để dev/demo nhanh.
10. **Custom loading logo xoay** — toàn bộ trạng thái loading dùng 1 component thống nhất với logo shop tự generate (SVG).
11. **Feature Recheck mechanism** — checklist tự động + manual đảm bảo không thiếu chức năng trước khi bàn giao.

---

## 2. TECH STACK & VERSIONS

| Layer | Technology | Version | Lý do |
|---|---|---|---|
| Frontend | React + TypeScript | 18.x | Phổ biến, hệ sinh thái mạnh |
| Build | Vite | 5.x | Dev server nhanh |
| Styling | TailwindCSS + shadcn/ui | 3.x | Component đẹp, đơn giản |
| State | Zustand + TanStack Query | latest | Đơn giản hơn Redux |
| Form | React Hook Form + Zod | latest | Validation tốt |
| Routing | React Router | 6.x | |
| Backend | ASP.NET Core Web API | .NET 8 LTS | User chọn, ổn định |
| ORM | EF Core | 8.x | Code-first migrations |
| DB | SQL Server LocalDB | 2022 | User yêu cầu local |
| Auth | JWT Bearer + Refresh token | — | Stateless, phù hợp SPA |
| Mapping | AutoMapper | 13.x | DTO mapping |
| Validation | FluentValidation | 11.x | Server-side rules |
| Logging | Serilog | latest | Structured log → file |
| Payment | VNPAY Sandbox | v2.1.0 | Port từ `vnpay_cs/` |
| AI | Google Gemini API | gemini-2.0-flash | Free tier, multimodal |
| File storage | Local `wwwroot/uploads` | — | Demo, không dùng cloud |
| Realtime chat | ASP.NET Core SignalR + fallback polling | 8.x | Push tin nhắn realtime, polling job dự phòng |
| Chat client | `@microsoft/signalr` | latest | Đồng bộ với BE SignalR |

---

## 3. PROJECT STRUCTURE

```
ThienPlanClothesMichi/
├── plan/                                  ← copy plan này vào đây sau khi approve
│   └── DEV_PLAN.md
├── docs/
│   ├── DATABASE.md                        ← connection string, credentials
│   ├── API.md                             ← endpoint list
│   └── SETUP.md                           ← how to run
├── backend/
│   └── ThienPlan.Api/
│       ├── Controllers/                   ← API endpoints
│       ├── Services/                      ← business logic
│       ├── Repositories/                  ← data access (EF Core)
│       ├── Models/
│       │   ├── Entities/                  ← EF entities
│       │   ├── DTOs/                      ← request/response
│       │   └── Enums/
│       ├── Data/
│       │   ├── AppDbContext.cs
│       │   ├── Migrations/
│       │   └── Seeders/                   ← seed admin, demo data
│       ├── Helpers/
│       │   ├── VnPayLibrary.cs            ← port từ vnpay_cs
│       │   └── JwtHelper.cs
│       ├── Middlewares/                   ← exception, permission
│       ├── Configurations/                ← appsettings
│       ├── wwwroot/uploads/               ← ảnh sản phẩm
│       ├── Program.cs
│       ├── appsettings.json
│       └── appsettings.Development.json
├── frontend/
│   └── thienplan-web/
│       ├── src/
│       │   ├── pages/
│       │   │   ├── customer/              ← shop, product, cart, checkout, profile
│       │   │   └── admin/                 ← dashboard, products, orders, staff, vouchers, reports
│       │   ├── components/
│       │   │   ├── ui/                    ← shadcn components
│       │   │   ├── layout/                ← header, footer, sidebar
│       │   │   └── features/              ← cart, outfit-suggest, voucher-picker
│       │   ├── api/                       ← axios clients per module
│       │   ├── hooks/
│       │   ├── stores/                    ← zustand stores
│       │   ├── types/
│       │   ├── utils/
│       │   └── App.tsx
│       ├── public/
│       ├── .env.example
│       ├── vite.config.ts
│       └── package.json
├── scripts/
│   ├── start-all.bat                      ← chạy đồng thời FE + BE
│   ├── start-be.bat                       ← chỉ BE
│   ├── start-fe.bat                       ← chỉ FE
│   ├── stop-all.bat                       ← kill tất cả process
│   └── recheck.bat                        ← auto feature recheck
├── vnpay_cs/                              ← sample đã có (chỉ tham khảo)
└── vnpayHashkey_code.txt                  ← credentials (đã có)
```

Backend bổ sung folder `Hubs/` cho SignalR:
```
backend/ThienPlan.Api/
├── Hubs/
│   └── ChatHub.cs                         ← SignalR hub realtime chat
└── BackgroundJobs/
    ├── MembershipTierJob.cs
    ├── VoucherExpireJob.cs
    └── ChatRetentionJob.cs                ← dọn tin cũ + đẩy notif offline
```

---

## 4. DATABASE DESIGN

### 4.1 Connection (lưu trong `docs/DATABASE.md`)

```
Server:    (localdb)\\MSSQLLocalDB
Database:  ThienPlanClothesDb
Auth:      Windows Authentication (Trusted_Connection=True)
Connection String:
  Server=(localdb)\\MSSQLLocalDB;Database=ThienPlanClothesDb;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true
```

Seed admin mặc định: `admin@thienplan.local` / `Admin@123` (đổi sau khi bàn giao).

### 4.2 ERD — danh sách bảng

| Bảng | Field chính | Note |
|---|---|---|
| **Users** | Id, Email, PhoneNumber, PasswordHash, FullName, Avatar, RoleId, IsActive, CreatedAt, MembershipTier (enum), TotalSpent12M | Customer + Staff + Admin chung 1 bảng |
| **Roles** | Id, Name (Administrator/Staff/Customer), Description | |
| **Permissions** | Id, Code (e.g. `product.create`, `order.refund`), Name, Module | Master list ~25 permissions |
| **RolePermissions** | RoleId, PermissionId | Permission mặc định theo role |
| **UserPermissions** | UserId, PermissionId, IsGranted | Override per-user (Admin cấp quyền riêng cho từng staff) |
| **RefreshTokens** | Id, UserId, Token, ExpiresAt, RevokedAt | |
| **Categories** | Id, Name, ParentId, Slug, ImageUrl, DisplayOrder | Hierarchy: Áo > Áo thun > … |
| **Products** | Id, Name, Description, CategoryId, Brand, Material, Gender (enum), BasePrice, IsActive, CreatedById, CreatedAt | |
| **ProductVariants** | Id, ProductId, Sku, Color, Size, Price, StockQty, ImageUrl | Mỗi tổ hợp màu+size là 1 variant |
| **ProductImages** | Id, ProductId, Url, IsPrimary, DisplayOrder | |
| **ProductTags** | Id, Name, Type (style/season/occasion) | Phục vụ AI phối đồ |
| **ProductTagMap** | ProductId, TagId | |
| **Carts** | Id, UserId(nullable), GuestToken(nullable), CreatedAt, UpdatedAt | Cart cho cả guest |
| **CartItems** | Id, CartId, ProductVariantId, Quantity, UnitPrice | |
| **Orders** | Id, OrderCode, UserId(nullable), GuestInfo (json: name/phone/address/email), Subtotal, DiscountAmount, ShippingFee, Total, PaymentMethod (enum: Cash/VnPay), PaymentStatus (enum), OrderStatus (enum), ShippingMethod (enum: PickupAtStore/Delivery), ShippingAddress, VoucherId, Note, CreatedAt, CreatedChannel (enum: Online/POS), StaffId(nullable) | Guest checkout: GuestInfo + UserId null |
| **OrderItems** | Id, OrderId, ProductVariantId, ProductName, Sku, UnitPrice, Quantity, LineTotal | Snapshot — không join lại |
| **OrderStatusHistory** | Id, OrderId, FromStatus, ToStatus, ChangedBy, ChangedAt, Note | Audit trail |
| **Returns** | Id, OrderId, Reason, Status (Requested/Approved/Rejected/Refunded), RefundAmount, RefundMethod, CreatedAt, ProcessedById, ProcessedAt | |
| **ReturnItems** | Id, ReturnId, OrderItemId, Quantity, Reason | |
| **Payments** | Id, OrderId, Method, Amount, TxnRef, VnpTransactionNo, BankCode, ResponseCode, RawResponse (json), PaidAt, Status | Lưu raw VNPAY response |
| **Vouchers** | Id, Code, Name, Type (Percent/FixedAmount/FreeShip), Value, MaxDiscount, MinOrderAmount, Quantity, UsedCount, StartAt, ExpireAt, ApplicableTier (Bronze/Silver/Gold/Diamond/All), IsActive | |
| **VoucherUsages** | Id, VoucherId, UserId, OrderId, UsedAt | |
| **Outfits** | Id, Name, CreatedById, CoverImage, Description, IsAiGenerated | |
| **OutfitItems** | OutfitId, ProductId, Role (Top/Bottom/Outerwear/Shoes/Accessory) | |
| **AiSuggestionLogs** | Id, UserId(nullable), AnchorProductId, SuggestedProductIds (json), PromptTokens, CompletionTokens, CreatedAt | Cache + audit chi phí |
| **ChatConversations** | Id, CustomerId(nullable), GuestToken(nullable), AssignedStaffId(nullable), Status (Open/Closed/Pending), Subject, LastMessageAt, CreatedAt | 1 customer = 1 conversation đang mở; guest dùng GuestToken |
| **ChatMessages** | Id, ConversationId, SenderId(nullable), SenderType (Customer/Staff/System/Bot), Content, AttachmentUrl(nullable), IsRead, ReadAt, CreatedAt | |
| **ChatPresence** | UserId, IsOnline, LastSeenAt, ConnectionId(nullable) | Track staff online cho phân phối hội thoại |

### 4.3 Membership tier — auto-update logic

Background job (Hangfire hoặc IHostedService) chạy hàng ngày:

- Tính `TotalSpent12M` = SUM(Total) của Orders đã hoàn tất trong 12 tháng gần nhất.
- Cập nhật `MembershipTier`:
  - `< 2,000,000` → Bronze
  - `2M – 10M` → Silver
  - `10M – 30M` → Gold
  - `≥ 30M` → Diamond
- Threshold lưu trong appsettings để dễ chỉnh.

---

## 5. AUTHENTICATION & AUTHORIZATION

### 5.1 Auth flow

- **JWT Access Token:** TTL 15 phút, claim chứa `userId`, `role`, danh sách `permissions`.
- **Refresh Token:** TTL 7 ngày, lưu DB, rotate khi refresh.
- **Guest:** không cần auth — backend cấp `GuestToken` (cookie) để track cart.

### 5.2 Customer registration — 3 cách

1. **Tự đăng ký** form `/register` (email + password + OTP qua console log demo).
2. **Auto-create khi guest checkout:** sau khi đặt đơn, BE tạo account với email/phone đã nhập → gửi mail kèm link đặt password (mock = log ra console).
3. **Admin/Staff tạo trực tiếp** từ trang khách hàng (POS use case).

### 5.3 Permission matrix (Staff RBAC)

Master permissions (Admin có toàn bộ, Customer = none, Staff cấu hình từng quyền):

| Module | Permissions |
|---|---|
| Product | `product.view`, `product.create`, `product.update`, `product.delete`, `product.import` |
| Order | `order.view`, `order.create_pos`, `order.update_status`, `order.cancel`, `order.refund` |
| Return | `return.view`, `return.approve`, `return.reject`, `return.process_refund` |
| Customer | `customer.view`, `customer.create`, `customer.update` |
| Voucher | `voucher.view`, `voucher.create`, `voucher.update`, `voucher.expire` |
| Staff | `staff.view`, `staff.create`, `staff.update_permissions` (Admin-only thực tế) |
| Report | `report.view_sales`, `report.view_inventory` |
| Inventory | `inventory.view`, `inventory.adjust` |
| Chat | `chat.view`, `chat.reply`, `chat.assign`, `chat.close` |

UI: Trang `/admin/staff/:id` có grid checkbox theo module, Admin tick/untick → save.

Backend dùng custom attribute `[RequirePermission("product.create")]` đọc claim từ JWT.

---

## 6. CORE MODULES — chi tiết luồng

### 6.1 Catalog & Product Management

**Customer side:**
- `/` — Trang chủ: banner, category nổi bật, sản phẩm mới, voucher đang có.
- `/shop` — Listing + filter (category, price range, color, size, gender) + sort + pagination.
- `/product/:slug` — Detail: gallery ảnh, chọn variant (color/size), stock indicator, nút "Add to Cart" + "AI Phối đồ với sản phẩm này".

**Admin/Staff side:**
- `/admin/products` — DataGrid + filter, bulk actions.
- `/admin/products/new` & `/edit/:id` — Form 3 tab:
  1. **Thông tin chung:** name, description (rich text), category (cascade dropdown từ Categories), brand (autocomplete), material (dropdown), gender (radio), tags (multi-select chips).
  2. **Variants:** table inline — color (color picker + name), size (dropdown S/M/L/XL/…), price, stock, SKU (auto-gen).
  3. **Hình ảnh:** drag-drop upload, đặt primary, sắp xếp.
- Validation: ít nhất 1 variant, ít nhất 1 ảnh, price > 0.

### 6.2 Cart & Checkout (Guest + Member)

```
[Customer browses] → [Add to cart] → [Cart icon updates]
        ↓
[GET /api/cart] (gửi GuestToken hoặc Bearer)
        ↓
[Update qty / Remove] → [Apply voucher] → [Checkout]
        ↓
[Form: receiver info + shipping method + payment method]
   - Guest: nhập đầy đủ, optional checkbox "Tạo tài khoản từ thông tin này"
   - Member: prefill từ profile
        ↓
[Submit] → BE tạo Order (status=Pending, paymentStatus=Unpaid)
        ↓
   ├─ Cash + Pickup    → Order Confirmed, đợi lấy tại quầy
   ├─ Cash + Delivery  → Order Confirmed, COD, status=AwaitingShipment
   └─ VNPAY            → redirect VNPAY sandbox (xem 6.4)
```

### 6.3 Order lifecycle (state machine)

```
Pending ──(payment ok)──→ Confirmed ──→ Packing ──→ Shipping ──→ Delivered
   │                          │                                      │
   └─(timeout/admin)→ Cancelled                              (within 7d)
                                                                     ↓
                                                                  Returned (qua flow Return)
```

- Mọi chuyển trạng thái ghi vào `OrderStatusHistory`.
- Admin/Staff (có quyền) bấm nút "Mark as Packing/Shipping/Delivered" — **chỉ thủ công, không có timer auto** (theo lựa chọn user).
- Customer xem timeline trên `/account/orders/:code`.

### 6.4 Payment — Cash + VNPAY

**Cash:**
- POS staff bấm "Confirmed Cash Received" trên trang đơn → `PaymentStatus = Paid`, ghi `Payments` record.

**VNPAY (port từ `vnpay_cs/`):**

1. **Helper file:** copy `VnPayLibrary.cs` từ `vnpay_cs/VNPAY_CS_ASPX/VnPayLibrary.cs` sang `backend/ThienPlan.Api/Helpers/VnPayLibrary.cs`. Sửa namespace, bỏ dependency `System.Web` (HttpUtility → `WebUtility`), giữ HMAC-SHA512.

2. **Config trong `appsettings.json`:**
   ```json
   "VnPay": {
     "Url": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
     "Api": "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
     "TmnCode": "CRA0CZJY",
     "HashSecret": "1IPM09NUD6Y16TA3DH6UJ0YMK69B0RA3",
     "ReturnUrl": "http://localhost:5173/payment/vnpay-return",
     "IpnUrl": "http://localhost:5000/api/payments/vnpay/ipn"
   }
   ```

3. **Endpoints:**
   - `POST /api/payments/vnpay/create-url` — input `{orderId}` → trả `{paymentUrl}`.
   - `GET /api/payments/vnpay/return` (FE redirect ở đây, FE gọi BE verify): BE validate signature, **không** update DB ở đây (UI only).
   - `GET /api/payments/vnpay/ipn` — VNPAY gọi server-to-server, validate signature, check amount khớp Order, update `PaymentStatus = Paid`, trả JSON `{RspCode: "00", Message: "Confirm Success"}`.

4. **FE flow — VNPAY redirect tab mới + auto-close (không dùng iframe):**

   ```
   [Checkout page]
        │ 1. POST /api/payments/vnpay/create-url
        ▼
   [BE returns paymentUrl + txnRef]
        │ 2. window.open(paymentUrl, 'vnpay-tab')   ← tab MỚI
        │ 3. Trang gốc giữ nguyên + bật loading "Đang chờ thanh toán..."
        │ 4. Bật polling: GET /api/orders/:code/payment-status mỗi 2s
        ▼
   [User trả tiền trên VNPAY tab mới]
        │
        ▼
   [VNPAY redirect tab mới về returnUrl: /payment/vnpay-return]
        │ 5. Trang return:
        │    - Render quick "Thanh toán thành công/thất bại"
        │    - Gửi BroadcastChannel('vnpay').postMessage({status, vnpQuery})
        │      (fallback localStorage event nếu trình duyệt cũ)
        │    - setTimeout 1.5s → window.close()  ← TAB TỰ ĐÓNG
        ▼
   [Tab gốc nhận event qua BroadcastChannel]
        │ 6. Stop polling, hiển thị toast result
        │ 7. Navigate /account/orders/:code
   ```

   **Chi tiết kỹ thuật:**
   - Dùng `window.open()` (KHÔNG dùng `window.location.href`) để giữ trang gốc.
   - Trang `/payment/vnpay-return` (FE) tự gọi `GET /api/payments/vnpay/verify-return?...` để xác signature trước khi broadcast.
   - **Cross-tab communication:** ưu tiên `BroadcastChannel` API (modern), fallback `window.localStorage` event (`storage` listener) cho trình duyệt cũ.
   - **Timeout / user đóng tab giữa chừng:** trang gốc poll `/api/orders/:code/payment-status` 2s/lần, sau 5 phút không có kết quả → cho phép user "Hủy thanh toán" hoặc "Tôi đã thanh toán xong" (manual reconcile via IPN).
   - **Window blocked (popup blocker):** detect `if (!newTab || newTab.closed)` → fallback dùng `window.location.href = paymentUrl` (full redirect cũ); sau khi VNPAY redirect về, trang return chuyển hướng `navigate('/account/orders/:code')`.
   - **Authoritative source vẫn là IPN** — UI chỉ phản ánh nhanh, IPN từ VNPAY → backend cập nhật DB là sự thật cuối cùng.

5. **Lý do đổi từ modal/iframe sang redirect tab + auto-close:**
   - VNPAY sandbox set `X-Frame-Options: DENY` → iframe không load được (đã verify trong nhiều case thực tế).
   - UX vẫn giữ "không rời trang gốc" (trang gốc không bao giờ điều hướng).
   - Đơn giản hơn (không cần CSP, không cần postMessage origin check phức tạp).

### 6.5 Returns (trả hàng)

- Trong vòng 7 ngày sau Delivered, customer vào `/account/orders/:code` → "Yêu cầu trả hàng".
- Form: chọn item + quantity + reason (dropdown: Lỗi sản phẩm / Không vừa / Khác hình / Khác) + ảnh upload.
- Tạo `Returns` record status=`Requested`.
- Staff (có `return.approve`) duyệt → status=`Approved` → quyết định `RefundMethod`:
  - Cash → đánh dấu refund manual, status=`Refunded`.
  - VNPAY → gọi VNPAY refund API (`vnp_refund.aspx.cs` trong sample là tham chiếu) hoặc demo: chỉ flag `Refunded`.
- Stock được hoàn lại variant tương ứng.

### 6.6 Voucher

**Loại:**
- `Percent` (giảm % với MaxDiscount cap)
- `FixedAmount` (giảm số tiền cố định)
- `FreeShip` (miễn phí ship)

**Cấu hình:**
- `ApplicableTier`: All / Bronze / Silver / Gold / Diamond.
- `MinOrderAmount`, `Quantity` (tổng), `UsedCount`, `StartAt`, `ExpireAt`.
- Admin có nút "Expire ngay" → set `IsActive=false` + `ExpireAt=now`.

**Customer apply:**
- Trang `/account/vouchers` — list voucher available cho tier của user (BE filter sẵn).
- Tại checkout: input code hoặc chọn từ dropdown gợi ý (chỉ hiện voucher hợp lệ với cart).
- BE validate: tier, min order, expiry, quantity, đã dùng chưa (1 user 1 voucher 1 lần — có thể config).

**Auto rules (cron job):**
- Tự động expire voucher đã `ExpireAt < now`.
- Generate voucher chào mừng cho user mới (Bronze welcome 50k).
- Upgrade tier → tặng voucher (Silver/Gold/Diamond welcome).

### 6.7 Shipping (giả lập)

- 2 phương thức:
  - **PickupAtStore** — phí 0, status nhảy Confirmed → ReadyForPickup → PickedUp.
  - **Delivery** — phí cố định 30,000đ (configurable trong appsettings), status Confirmed → Packing → Shipping → Delivered.
- **Manual update only** (theo lựa chọn user) — Staff/Admin bấm nút trên trang Order detail.
- Mỗi lần update ghi `OrderStatusHistory` với `ChangedBy`, `Note`.
- Customer xem timeline (Order Tracking page).

### 6.8 AI phối đồ (Gemini)

**Use case:** Customer xem 1 sản phẩm → nhấn "Phối đồ với AI" → trang gợi ý 3-5 outfit hoàn chỉnh từ kho hàng shop.

**Flow:**

1. FE gọi `POST /api/ai/outfit-suggest` với `{anchorProductId, gender?, occasion?}`.
2. BE:
   - Lấy anchor product info + ảnh.
   - Lấy candidate pool (filter cùng gender, in-stock, complementary roles — nếu anchor là Top thì candidates là Bottom/Outerwear/Shoes/Accessory).
   - Build prompt cho Gemini `gemini-2.0-flash`:
     ```
     "Bạn là stylist. Sản phẩm chính: {anchor JSON + image_url}.
     Hãy chọn từ danh sách sau ra 3 outfit gợi ý, mỗi outfit gồm 3-4 món đa dạng vai trò.
     Trả về JSON: [{outfitName, items:[{productId, role}], reasoning}].
     Danh sách: {candidates JSON}"
     ```
   - Parse JSON response, log tokens vào `AiSuggestionLogs`.
   - Trả về FE kèm thông tin sản phẩm đầy đủ.
3. FE hiển thị card outfit, cho phép "Add all to cart".

**Cache:** anchor product → 1h cache trong memory để tránh gọi Gemini lặp lại với cùng anchor.

**Config:**
```json
"Gemini": {
  "ApiKey": "<env var GEMINI_API_KEY>",
  "Model": "gemini-2.0-flash",
  "MaxOutfits": 3
}
```

### 6.9 Chat tư vấn (Customer ↔ Staff)

**Mục tiêu:** Customer (đăng nhập hoặc guest) chat trực tiếp với Staff/Admin về sản phẩm, đơn hàng, size — realtime + persisted.

**Kiến trúc — hybrid (realtime + polling fallback):**

1. **Primary: SignalR Hub** (`/hubs/chat`) — push tin nhắn ngay khi có.
2. **Fallback: Background polling job** chạy ngầm phía FE — khi SignalR mất kết nối hoặc tab inactive >30s, FE chuyển sang gọi `GET /api/chat/conversations/:id/messages?since=<lastMessageId>` mỗi 5s. Khi SignalR reconnect, dừng polling.
3. **Server-side background job** (`ChatRetentionJob` — `BackgroundService`):
   - Mỗi 1 phút: scan conversation `Status=Open` không hoạt động > 30 phút → set `Status=Pending` để staff biết cần xử lý.
   - Mỗi đêm: archive tin nhắn > 90 ngày sang bảng cold storage (giữ DB nhẹ).
   - Đẩy notification email/log cho staff khi customer gửi tin lúc không có staff online.

**Customer side:**
- Floating chat bubble góc phải dưới mọi trang (`<ChatWidget />`).
- Click → mở panel: nếu chưa đăng nhập → form mini hỏi tên + sđt (lưu vào `GuestToken` conversation).
- Hiện list tin nhắn + ô input + upload ảnh (drag/drop).
- Hiện badge "Đang tư vấn: Anh A" khi staff được assign.
- Toast notification + badge đếm khi có tin mới và panel đang đóng.

**Staff/Admin side:**
- Trang `/admin/chat` — layout 2 cột:
  - Trái: list conversation (filter Open/Pending/Closed, sort theo `LastMessageAt`), badge số tin chưa đọc.
  - Phải: khung chat của conversation đang chọn — message list, input, action bar (Assign to me, Mark resolved, Close).
- Permission `chat.assign` cho phép gán hội thoại cho staff khác.
- Indicator "Staff đang gõ…" qua SignalR `typing` event.

**Endpoints:**

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | /api/chat/conversations | guest+token / bearer | Tạo / get conversation hiện tại |
| GET | /api/chat/conversations/:id/messages | mixed | Lấy lịch sử (paginate, since param) |
| POST | /api/chat/conversations/:id/messages | mixed | Gửi tin nhắn (REST fallback) |
| POST | /api/chat/conversations/:id/read | mixed | Đánh dấu đã đọc |
| GET | /api/admin/chat/conversations | `chat.view` | List cho staff |
| PATCH | /api/admin/chat/conversations/:id/assign | `chat.assign` | |
| PATCH | /api/admin/chat/conversations/:id/close | `chat.close` | |

**SignalR Hub methods (`ChatHub.cs`):**
- `JoinConversation(conversationId)` — server check quyền truy cập.
- `SendMessage(conversationId, content, attachmentUrl?)`.
- `Typing(conversationId, isTyping)`.
- Server broadcast: `ReceiveMessage`, `MessageRead`, `UserTyping`, `ConversationAssigned`.

**Bảo mật:**
- Customer chỉ join conversation của chính mình (check theo `UserId` hoặc `GuestToken`).
- Staff phải có `chat.view` để join.
- Rate limit: 10 messages / phút / sender (chống spam).
- Sanitize content (HTML escape) để tránh XSS khi render.

### 6.10 Reports (Admin)

- Sales: doanh thu theo ngày/tuần/tháng, top sản phẩm, top customer.
- Inventory: low-stock alert (< 5 units).
- AI usage: tokens spent, suggestions count.

---

## 7. API ENDPOINTS (rút gọn)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | /api/auth/register | guest | Customer self-register |
| POST | /api/auth/login | guest | |
| POST | /api/auth/refresh | — | |
| POST | /api/auth/logout | bearer | |
| GET | /api/products | guest | List + filter |
| GET | /api/products/:slug | guest | Detail |
| POST | /api/products | `product.create` | |
| PUT | /api/products/:id | `product.update` | |
| DELETE | /api/products/:id | `product.delete` | |
| POST | /api/products/:id/images | `product.update` | Upload |
| GET | /api/categories | guest | Tree |
| GET | /api/cart | guest+token | Get current cart |
| POST | /api/cart/items | guest+token | Add |
| PUT | /api/cart/items/:id | guest+token | Update qty |
| DELETE | /api/cart/items/:id | guest+token | |
| POST | /api/orders | guest+token | Tạo đơn |
| GET | /api/orders/:code | mixed | Customer xem đơn của mình; staff xem all |
| GET | /api/orders | `order.view` | List admin |
| PATCH | /api/orders/:id/status | `order.update_status` | |
| POST | /api/orders/:id/cancel | `order.cancel` | |
| POST | /api/payments/vnpay/create-url | bearer/guest | |
| GET | /api/payments/vnpay/ipn | — (signature) | VNPAY callback |
| GET | /api/payments/vnpay/verify-return | — (signature) | FE call sau khi VNPAY redirect về |
| GET | /api/orders/:code/payment-status | mixed | FE polling khi đợi VNPAY |
| POST | /api/payments/cash/confirm | `order.update_status` | |
| POST | /api/returns | bearer | Customer request |
| GET | /api/returns | `return.view` | |
| PATCH | /api/returns/:id/approve | `return.approve` | |
| PATCH | /api/returns/:id/reject | `return.reject` | |
| GET | /api/vouchers/available | bearer | Voucher cho tier hiện tại |
| POST | /api/vouchers/validate | guest+token | Check code tại checkout |
| GET | /api/admin/vouchers | `voucher.view` | |
| POST | /api/admin/vouchers | `voucher.create` | |
| POST | /api/admin/vouchers/:id/expire | `voucher.expire` | |
| GET | /api/admin/staff | `staff.view` | |
| POST | /api/admin/staff | `staff.create` | |
| PUT | /api/admin/staff/:id/permissions | `staff.update_permissions` | |
| POST | /api/ai/outfit-suggest | guest | |
| POST | /api/chat/conversations | guest+token | Tạo/get conversation |
| GET | /api/chat/conversations/:id/messages | mixed | Lấy tin (since=) |
| POST | /api/chat/conversations/:id/messages | mixed | Gửi tin REST fallback |
| GET | /api/admin/chat/conversations | `chat.view` | |
| PATCH | /api/admin/chat/conversations/:id/assign | `chat.assign` | |
| WS | /hubs/chat | mixed | SignalR hub |
| GET | /api/admin/reports/sales | `report.view_sales` | |

Document đầy đủ trong `docs/API.md` (Swagger/OpenAPI sinh tự động qua Swashbuckle).

---

## 8. FRONTEND PAGES

### Customer
- `/` Home
- `/shop` Listing
- `/product/:slug` Detail
- `/cart` Cart
- `/checkout` Checkout (multi-step)
- `/payment/vnpay-return` VNPAY return handler
- `/account` Profile
- `/account/orders` Order history
- `/account/orders/:code` Order detail + timeline + return request
- `/account/vouchers` My vouchers
- `/account/membership` Tier info + benefits
- `/login`, `/register`, `/forgot-password`
- `/outfit-suggest/:productId` AI outfit page
- `<ChatWidget />` floating bubble (mọi trang) + `/account/chat` full-page view

### Admin/Staff (`/admin/*`)
- `/admin` Dashboard (KPI cards, charts)
- `/admin/products` + `/new` + `/edit/:id`
- `/admin/categories`
- `/admin/orders` + `/:id`
- `/admin/returns` + `/:id`
- `/admin/customers` + `/:id`
- `/admin/staff` + `/:id` (permission grid)
- `/admin/vouchers` + `/new` + `/edit/:id`
- `/admin/reports`
- `/admin/pos` (bán tại quầy — quick checkout flow)
- `/admin/chat` (inbox tư vấn — 2 cột conversation list + chat panel)

---

## 9. UI/UX GUIDELINES

**Color palette (đơn giản, sạch):**
- Primary: `#1F2937` (slate-800) — header, button chính
- Accent: `#D97706` (amber-600) — sale tag, CTA phụ
- Background: `#F9FAFB` (gray-50)
- Surface: `#FFFFFF`
- Text: `#111827` / `#6B7280`
- Success `#16A34A`, Danger `#DC2626`, Warning `#F59E0B`

**Typography:** Inter (body) + Playfair Display (headings tùy chọn).

**Components:**
- Dùng shadcn/ui: Button, Input, Select, Combobox, Dialog, Sheet, Toast, DataTable.
- Tất cả input đều có Combobox/Autocomplete khi có >5 option.
- Form layout: label trên, helper text dưới, error state đỏ + icon.

**Hạn chế nhập liệu:**
- Category, brand, material, color, size → dropdown / autocomplete từ DB.
- Address → dropdown Tỉnh/Huyện/Xã (có thể dùng API public của Vietnam, fallback nhập tay).
- Phone → input mask `0xxx xxx xxx`.
- Date → date picker.

**Responsive:** mobile-first (Tailwind breakpoints sm/md/lg/xl).

### 9.1 Brand logo — auto-generate (SVG)

Vì project demo chưa có logo chính thức, tự generate 1 logo đơn giản dạng monogram **"TPC"** (ThienPlan Clothes) để dùng đồng nhất.

**Spec:**
- Format: SVG inline (component React `<BrandLogo size={n} />`).
- Design: hình tròn nền primary `#1F2937`, chữ "TPC" trắng, font Playfair Display Bold; viền accent `#D97706` 2px; có thể bật chế độ chỉ ký tự "T" cho favicon.
- File: `frontend/thienplan-web/src/components/brand/BrandLogo.tsx`.
- Variant: `variant="full" | "mark"` (mark = chỉ icon tròn, full = icon + chữ "ThienPlan Clothes").
- Tự sinh không cần file ảnh — dễ scale, không phụ thuộc asset.

**Sample (rút gọn):**
```tsx
export function BrandLogo({ size = 48, variant = "mark", spinning = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64"
         className={spinning ? "animate-spin-slow" : ""}>
      <circle cx="32" cy="32" r="30" fill="#1F2937" stroke="#D97706" strokeWidth="2" />
      <text x="32" y="40" textAnchor="middle" fontFamily="Playfair Display"
            fontWeight="700" fontSize="22" fill="#FFFFFF">TPC</text>
    </svg>
  );
}
```

Tailwind config thêm `animation: { 'spin-slow': 'spin 1.4s linear infinite' }`.

### 9.2 Custom Loading component — logo xoay

**Yêu cầu:** TẤT CẢ trạng thái loading toàn site (page transition, API pending, button submit, suspense fallback) dùng **một component thống nhất** với logo TPC xoay tròn.

**Component file:** `frontend/thienplan-web/src/components/ui/Loader.tsx`

**Variants:**

| Variant | Use case | Spec |
|---|---|---|
| `<Loader.Page />` | Full-page route loading, suspense fallback | Centered, logo 96px xoay + dòng chữ "Đang tải..." dưới, backdrop trắng |
| `<Loader.Overlay />` | Trên modal/section khi gọi API | Absolute positioned, backdrop blur + logo 64px xoay |
| `<Loader.Inline />` | Trong button, badge | 16-24px, logo xoay không text |
| `<Loader.Skeleton />` | List/card placeholder | Tailwind `animate-pulse` rows (không logo) |

**Implementation:**
```tsx
// Loader.tsx
import { BrandLogo } from "@/components/brand/BrandLogo";

export const Loader = {
  Page: () => (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90">
      <BrandLogo size={96} spinning />
      <p className="mt-4 text-sm text-gray-500 tracking-wide">Đang tải...</p>
    </div>
  ),
  Overlay: ({ message }: { message?: string }) => (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <BrandLogo size={64} spinning />
      {message && <span className="ml-3 text-sm text-gray-600">{message}</span>}
    </div>
  ),
  Inline: ({ size = 20 }: { size?: number }) => (
    <BrandLogo size={size} spinning />
  ),
  Skeleton: ({ rows = 3 }: { rows?: number }) =>
    <div className="space-y-3">{Array.from({length: rows}).map((_,i) => (
      <div key={i} className="h-4 w-full animate-pulse rounded bg-gray-200" />
    ))}</div>,
};
```

**Quy ước sử dụng (BẮT BUỘC):**
- Suspense fallback tại `App.tsx` → `<Loader.Page />`.
- TanStack Query `isPending` → `<Loader.Overlay />` cho khu vực có data.
- Button submitting → `<Loader.Inline />` thay icon + disabled.
- Code review reject nếu thấy dùng `<Spinner>` mặc định, `<CircularProgress>`, hoặc text "Loading..." trần — phải dùng `Loader.*`.

**Lint rule (tùy chọn):** thêm ESLint rule custom hoặc grep CI check `grep -rE "Loading\\.\\.\\.|<Spinner" src/` → fail nếu match.

---

## 10. SETUP & RUN — `docs/SETUP.md`

### Prerequisites
- Node.js 20+
- .NET 8 SDK
- SQL Server 2019/2022 LocalDB hoặc Express
- VS Code / Visual Studio 2022

### Backend
```powershell
cd backend\ThienPlan.Api
dotnet restore
dotnet ef database update    # apply migrations
dotnet run                   # listens on http://localhost:5000
```
- Set env var: `setx GEMINI_API_KEY "your-key"` (restart shell).

### Frontend
```powershell
cd frontend\thienplan-web
npm install
copy .env.example .env       # set VITE_API_BASE=http://localhost:5000
npm run dev                  # listens on http://localhost:5173
```

### Default credentials (sau seed)
```
Admin:    admin@thienplan.local    / Admin@123
Staff:    staff@thienplan.local    / Staff@123
Customer: customer@thienplan.local / Customer@123
```

### One-click run với `.bat` (Windows)

Toàn bộ script đặt trong `scripts/` ở root project.

**`scripts/start-all.bat`** — mở 2 cửa sổ console riêng (BE + FE), tự động restore dependencies lần đầu:

```bat
@echo off
setlocal
set ROOT=%~dp0..
echo === ThienPlan: starting Backend + Frontend ===

REM Backend
start "ThienPlan-BE" cmd /k "cd /d %ROOT%\backend\ThienPlan.Api && (if not exist bin (echo Restoring... && dotnet restore)) && dotnet run --urls=http://localhost:5000"

REM Frontend (chờ 3s cho BE bind port trước khi FE proxy gọi)
timeout /t 3 /nobreak >nul
start "ThienPlan-FE" cmd /k "cd /d %ROOT%\frontend\thienplan-web && (if not exist node_modules (echo Installing... && npm install)) && npm run dev"

echo Both started in separate windows. Close them or run stop-all.bat to stop.
endlocal
```

**`scripts/start-be.bat`** và **`scripts/start-fe.bat`** — chỉ chạy 1 phía (cùng pattern, 1 lệnh).

**`scripts/stop-all.bat`** — kill các process theo title:

```bat
@echo off
taskkill /FI "WINDOWTITLE eq ThienPlan-BE*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq ThienPlan-FE*" /T /F >nul 2>&1
echo Stopped ThienPlan BE/FE.
```

**Cách dùng:** double-click `scripts/start-all.bat` ở File Explorer, hoặc trong terminal:
```powershell
.\scripts\start-all.bat
```

Sau khi chạy:
- Backend: `http://localhost:5000` (Swagger: `/swagger`)
- Frontend: `http://localhost:5173`

---

## 11. PHASE BREAKDOWN — Sprint plan

| Sprint | Tuần | Scope | Deliverable |
|---|---|---|---|
| **0 — Setup** | 1 | Khởi tạo solution, DB schema, migrations, seed data, CI cơ bản, Swagger, **`BrandLogo` + `Loader` component**, **`scripts/start-all.bat`**, khởi tạo `docs/FEATURE_CHECKLIST.md` | DB chạy, API trống nhưng có auth, FE bootstrap với loader sẵn |
| **1 — Auth & RBAC** | 2 | Register/Login/JWT/Refresh, Role+Permission, custom attribute, 3 user mặc định | Đăng nhập 3 vai trò |
| **2 — Catalog** | 3-4 | Product CRUD, Category, Variant, Image upload, Tag, FE listing + detail | Customer browse được, Admin CRUD |
| **3 — Cart & Checkout** | 5 | Guest+member cart, checkout form, tạo Order (Cash + Pickup) | Đặt được đơn cash |
| **4 — VNPAY** | 6 | Port VnPayLibrary, Create-URL + Return + IPN, FE redirect flow | Thanh toán VNPAY sandbox thành công |
| **5 — Order management** | 7 | Order state machine, Admin order page, manual status update, customer tracking | Luồng đơn end-to-end |
| **6 — Returns** | 8 | Return request, approve/reject, refund, stock rollback | |
| **7 — Voucher & Membership** | 9 | Voucher CRUD, tier auto-update job, apply at checkout, voucher list per tier | |
| **8 — Staff RBAC UI** | 10 | Permission grid, staff create/edit, audit | |
| **9 — AI Outfit** | 11 | Gemini integration, prompt, cache, FE outfit page | "Phối đồ AI" hoạt động |
| **10 — Chat tư vấn** | 12 | SignalR Hub, ChatWidget, polling fallback, ChatRetentionJob, admin inbox | Customer ↔ staff realtime |
| **11 — Reports & POS** | 13 | Dashboard, sales/inventory report, POS quick checkout | |
| **12 — Polish + DevX** | 14 | UI consistency, `.bat` scripts hoàn chỉnh, VNPAY redirect+auto-close hoàn chỉnh, docs hoàn thiện | UI mượt |
| **13 — Recheck & Acceptance** | 15 | Hoàn thiện `FEATURE_CHECKLIST.md`, `recheck.bat`, `/admin/_health` page, demo video, cross-module E2E | ✅ Bàn giao |

**Note Sprint 4 (VNPAY):** flow chính = `window.open` tab mới + auto-close qua `BroadcastChannel`. Có fallback full-redirect khi popup blocked. Test các edge: user đóng tab giữa chừng, cookie 3rd-party block, multiple tab đang chờ thanh toán.

---

## 12. VERIFICATION PLAN

### 12.1 Smoke test end-to-end

1. **Auth:** register customer → login → call protected endpoint → refresh token works.
2. **Browse:** list products with filter color=Black, size=M → results match → click detail → variants render.
3. **Guest checkout cash:** add to cart without login → checkout với info giả → order created → admin sees it → mark Confirmed.
4. **Member checkout VNPAY:** login customer → add to cart → checkout VNPAY → on sandbox use test card `9704198526191432198` (NCB) → return success → IPN updates `PaymentStatus=Paid` (verify in DB).
5. **Return flow:** customer requests return → staff approves → stock restored → refund flagged.
6. **Voucher:** admin creates `WELCOME50` (50k fixed, Bronze) → Bronze customer applies at checkout → discount applied → after order, `UsedCount` increments, `VoucherUsages` row created.
7. **Tier upgrade:** seed customer with `TotalSpent12M = 11M` → run tier job → tier becomes Gold → Gold welcome voucher generated.
8. **Staff RBAC:** login staff WITHOUT `product.create` → call POST /api/products → 403; grant permission via admin UI → retry → 200.
9. **AI outfit:** open product detail → click "Phối đồ AI" → 3 outfits render with valid product references → "Add all to cart" works.
10. **Shipping manual:** admin moves order Confirmed → Packing → Shipping → Delivered → customer timeline reflects each step with timestamps.
11. **Chat realtime:** mở 2 trình duyệt (customer + staff) → customer gửi tin → staff nhận trong < 1s qua SignalR → staff reply → customer thấy ngay. Tắt mạng staff 30s → reconnect → tin nhắn được sync (polling fallback). Đóng tab customer → mở lại → vẫn thấy lịch sử chat.
12. **VNPAY redirect tab + auto-close:** click "Thanh toán VNPAY" → tab mới mở dẫn đến VNPAY sandbox, trang gốc giữ nguyên + hiện `<Loader.Overlay message="Đang chờ thanh toán" />` + bắt đầu polling. Nhập NCB test card → VNPAY redirect tab mới về `/payment/vnpay-return` → trang này render "Thanh toán thành công" + countdown 1.5s → tab tự `window.close()` → trang gốc nhận `BroadcastChannel` event → toast success → navigate `/account/orders/:code`. DB ghi `Payments` với `ResponseCode=00`. **Edge:** đóng tab giữa chừng → trang gốc poll 5 phút → cho phép user "Hủy thanh toán" hoặc "Đã thanh toán xong". Popup blocker → fallback redirect cũ.
13. **`.bat` script:** xóa `bin/` BE + `node_modules` FE → double-click `scripts/start-all.bat` → 2 cửa sổ console mở, restore + install + chạy thành công → mở `http://localhost:5173` đăng nhập được. Chạy `stop-all.bat` → 2 process tắt sạch.
14. **Custom Loading logo:** mở mọi trang → trong khi data đang load thấy logo TPC xoay (suspense, route change, API call). Bấm Submit form → button hiện logo xoay nhỏ + disabled. Search trong source `grep "Loading\.\.\." src/` → 0 matches; `grep "<Spinner" src/` → 0 matches.
15. **Feature Recheck:** chạy `scripts/recheck.bat` → exit code 0, 6/6 checks pass. Mở `/admin/_health` → tất cả status xanh. Đối chiếu `docs/FEATURE_CHECKLIST.md` → mọi row F01-F22 = ✅ + có evidence link.

### 12.2 Automated tests (tối thiểu)
- xUnit unit tests cho Services: PaymentService (VNPAY hash), VoucherService (validation), MembershipService (tier calc).
- Integration test cho Auth + Order create (using `WebApplicationFactory` + in-memory DB).
- FE: Vitest cho hooks/utils; Playwright smoke test cho golden path checkout.

### 12.3 Manual checks
- Ảnh upload < 5MB, format jpg/png/webp.
- Concurrency: 2 users mua product cuối cùng → 1 thành công, 1 báo out-of-stock (test bằng SQL transaction + rowversion).
- VNPAY signature mismatch → IPN trả `RspCode: 97`.

---

## 13. FEATURE RECHECK MECHANISM — đảm bảo không thiếu chức năng

Đây là **bộ checklist + quy trình tự kiểm** chạy trước mỗi mốc bàn giao (cuối mỗi sprint + final delivery), đảm bảo không sót yêu cầu trong đề bài gốc.

### 13.1 Master Feature Matrix (`docs/FEATURE_CHECKLIST.md`)

Mỗi yêu cầu gốc → 1 row, có cột Status + Evidence + Owner. File này là **single source of truth**.

| # | Module | Yêu cầu gốc | API endpoint | UI page | Test case ID | Status (☐/◐/✅) | Evidence (PR/screenshot) |
|---|---|---|---|---|---|---|---|
| F01 | Account | 3 role: Administrator/Staff/Customer | /api/auth/* | /login | TC-AUTH-01..05 | ☐ | |
| F02 | Account | Admin phân quyền chi tiết cho Staff | /api/admin/staff/:id/permissions | /admin/staff/:id | TC-RBAC-01..08 | ☐ | |
| F03 | Account | Customer auto-create khi guest checkout | POST /api/orders | /checkout | TC-AUTH-06 | ☐ | |
| F04 | Account | Customer self-register | POST /api/auth/register | /register | TC-AUTH-07 | ☐ | |
| F05 | Product | Đăng hàng đầy đủ thông tin + variants + images | POST /api/products | /admin/products/new | TC-PROD-01..04 | ☐ | |
| F06 | Product | Phân loại (category cây + tag) | /api/categories | /shop filter | TC-PROD-05 | ☐ | |
| F07 | Order | Mua hàng không cần tài khoản (guest) | POST /api/orders (guest) | /checkout | TC-ORDER-01 | ☐ | |
| F08 | Order | Cơ chế trả hàng | /api/returns/* | /account/orders/:code | TC-RETURN-01..03 | ☐ | |
| F09 | Payment | Tiền mặt (xác nhận đủ thu) | POST /api/payments/cash/confirm | /admin/orders/:id | TC-PAY-01 | ☐ | |
| F10 | Payment | VNPAY sandbox redirect tab + auto-close | /api/payments/vnpay/* | /checkout | TC-PAY-02..05 | ☐ | |
| F11 | Shipping | Tại quầy (pickup) | OrderStatus flow | /admin/orders | TC-SHIP-01 | ☐ | |
| F12 | Shipping | Ship giả lập (manual update) | PATCH /api/orders/:id/status | /admin/orders/:id | TC-SHIP-02 | ☐ | |
| F13 | Voucher | Nhiều loại (Percent/FixedAmount/FreeShip) | /api/admin/vouchers | /admin/vouchers/new | TC-VOUCHER-01..03 | ☐ | |
| F14 | Voucher | Theo hạng khách hàng (4 tier auto) | TierJob + ApplicableTier | /account/vouchers | TC-VOUCHER-04..06 | ☐ | |
| F15 | Voucher | Admin chủ động expire | POST /api/admin/vouchers/:id/expire | /admin/vouchers | TC-VOUCHER-07 | ☐ | |
| F16 | AI | Phối đồ AI (Gemini) | POST /api/ai/outfit-suggest | /outfit-suggest/:productId | TC-AI-01..03 | ☐ | |
| F17 | Chat | Nhắn tin tư vấn realtime + background job | /hubs/chat + /api/chat/* | ChatWidget + /admin/chat | TC-CHAT-01..05 | ☐ | |
| F18 | DevX | Script `.bat` chạy đồng thời FE + BE | scripts/start-all.bat | — | TC-DEVX-01 | ☐ | |
| F19 | UI | Loading custom logo xoay toàn site | Loader component | All | TC-UI-01 | ☐ | |
| F20 | UI/UX | Hạn chế nhập tay (dropdown/autocomplete) | — | All forms | TC-UI-02 | ☐ | |
| F21 | DB | Lưu connection string + credentials trong .md | — | docs/DATABASE.md | TC-DOC-01 | ☐ | |
| F22 | Cross | Liên kết & thuận tiện UX giữa các module | — | All | TC-UX-01..05 | ☐ | |

Status: ☐ chưa làm · ◐ đang làm · ✅ done + tested.

### 13.2 Quy trình Recheck — 3 vòng

**Vòng 1 — Self-check sau mỗi sprint** (dev tự làm):
1. Mở `FEATURE_CHECKLIST.md`, mark status các row trong scope sprint.
2. Cho mỗi row đánh ✅ → đính kèm: link commit + screenshot/screen recording + ID test case đã pass.
3. Run `scripts/recheck.bat` (xem 13.3).

**Vòng 2 — Cross-module integration check** (cuối Sprint 11):
- Chạy full E2E flow (mục 12.1) với 1 session: register → browse → chat hỏi tư vấn → AI phối đồ → checkout VNPAY → chờ tab tự đóng → xem timeline order → request return → admin approve → tier upgrade.
- Đảm bảo không có dead-end UX (mỗi action đều có CTA tiếp theo, breadcrumb đúng, link điều hướng đầy đủ).

**Vòng 3 — Final acceptance** (Sprint 12):
- Đối chiếu **từng dòng đề bài gốc** (paste vào đầu `FEATURE_CHECKLIST.md`) với status row tương ứng.
- Yêu cầu mọi row phải ✅; row ◐ hoặc ☐ → block bàn giao.
- Sign-off bởi PO/khách hàng trên file checklist.

### 13.3 Automated recheck — `scripts/recheck.bat`

Script tự kiểm những thứ máy có thể check:

```bat
@echo off
setlocal
set ROOT=%~dp0..
echo === ThienPlan Feature Recheck ===
echo.

echo [1/6] Backend build + tests
pushd %ROOT%\backend\ThienPlan.Api
dotnet build --nologo -v q || goto :fail
dotnet test --nologo -v q || goto :fail
popd

echo [2/6] Frontend typecheck + lint + tests
pushd %ROOT%\frontend\thienplan-web
call npm run typecheck || goto :fail
call npm run lint || goto :fail
call npm run test -- --run || goto :fail
popd

echo [3/6] DB migrations applied
pushd %ROOT%\backend\ThienPlan.Api
dotnet ef migrations list --no-build | findstr /R "Pending" && (echo PENDING MIGRATION & goto :fail)
popd

echo [4/6] Required endpoints registered (grep route table)
findstr /R "vnpay/ipn vnpay/create-url chat/conversations ai/outfit-suggest" %ROOT%\backend\ThienPlan.Api\Controllers\*.cs >nul || goto :fail

echo [5/6] Loader component used everywhere (no banned patterns)
findstr /R /S /C:"Loading..." %ROOT%\frontend\thienplan-web\src\*.tsx && (echo Found banned 'Loading...' string & goto :fail)

echo [6/6] Required docs present
for %%f in (DATABASE.md API.md SETUP.md FEATURE_CHECKLIST.md) do (
  if not exist %ROOT%\docs\%%f (echo Missing docs/%%f & goto :fail)
)

echo.
echo === ALL CHECKS PASSED ===
exit /b 0

:fail
echo.
echo === RECHECK FAILED ===
exit /b 1
endlocal
```

### 13.4 BE-side runtime self-check endpoint

Endpoint `GET /api/_health/features` (dev only) trả JSON liệt kê:
- Số `Permissions` đã seed (kỳ vọng ≥ 25)
- 3 role mặc định có tồn tại không
- `VnPay` config có đầy đủ key không
- Gemini API key có set không
- SignalR hub đã map chưa
- Job đang chạy (membership tier, voucher expire, chat retention)

FE Admin có 1 trang `/admin/_health` hiển thị bảng status các check trên — bấm "Run Recheck" để gọi endpoint này. Nếu có ❌ → highlight + gợi ý fix.

### 13.5 Acceptance gate

Plan chỉ được coi là HOÀN THÀNH khi đồng thời:
- ✅ `recheck.bat` exit 0.
- ✅ Mọi row trong `FEATURE_CHECKLIST.md` = ✅.
- ✅ `/admin/_health` toàn green.
- ✅ Demo video 5-10 phút quay đầy đủ 22 features.

---

## 14. CRITICAL FILES TO REFERENCE

| Mục đích | File path |
|---|---|
| VNPAY library gốc (port từ đây) | `c:\Users\MInhhoangg\Desktop\AI\AI_PLAN\ThienPlanClothesMichi\vnpay_cs\VNPAY_CS_ASPX\VnPayLibrary.cs` |
| VNPAY pay flow tham chiếu | `c:\...\vnpay_cs\VNPAY_CS_ASPX\vnpay_pay.aspx.cs` |
| VNPAY IPN tham chiếu | `c:\...\vnpay_cs\VNPAY_CS_ASPX\vnpay_ipn.aspx.cs` |
| VNPAY return handler tham chiếu | `c:\...\vnpay_cs\VNPAY_CS_ASPX\vnpay_return.aspx.cs` |
| VNPAY refund tham chiếu | `c:\...\vnpay_cs\VNPAY_CS_ASPX\vnpay_refund.aspx.cs` |
| VNPAY credentials | `c:\...\vnpayHashkey_code.txt` (TmnCode=`CRA0CZJY`, HashSecret=`1IPM09NUD6Y16TA3DH6UJ0YMK69B0RA3`) |

---

## 15. RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|---|---|---|
| VNPAY IPN không gọi đến local (firewall) | Payment không update | Dùng ngrok expose `localhost:5000` ra public; cấu hình ngrok URL trong VNPAY merchant config |
| Gemini API rate limit | AI suggest fail | Cache 1h + fallback rule-based (ghép theo tag) |
| Stock race condition | Oversell | EF Core rowversion / SQL transaction `READ COMMITTED SNAPSHOT` |
| JWT secret leak | Account takeover | Đặt trong env var, không commit appsettings.Development.json secret |
| Image upload abuse | Disk full | Validate size/type, giới hạn 5MB, optional resize qua ImageSharp |
| Phân quyền sai | Privilege escalation | Default deny; integration test cho mỗi `[RequirePermission]` endpoint |
| Popup blocker chặn `window.open` VNPAY | User không tới được trang thanh toán | Detect `newTab===null \|\| newTab.closed` → fallback full-redirect (`window.location`); show hướng dẫn tắt blocker |
| `BroadcastChannel` không hoạt động (Safari/Trình duyệt cũ) | Tab gốc không nhận signal đóng tab | Fallback `localStorage` `storage` event để cross-tab signal |
| Tab VNPAY user đóng trước khi xong | UI gốc đứng chờ | Polling `/api/orders/:code/payment-status` 2s × 5 phút; sau đó cho user "Hủy" hoặc "Đã thanh toán xong" để recover |
| SignalR không kết nối (firewall, proxy) | Chat không realtime | Polling fallback mỗi 5s đã thiết kế sẵn; reconnect auto qua `withAutomaticReconnect()` |
| Spam tin chat | DB phình + abuse | Rate limit 10 msg/phút/sender; `ChatRetentionJob` archive > 90d |

---

## 16. DELIVERABLES (cuối project)

- [ ] Source code BE + FE chạy được local theo `docs/SETUP.md`
- [ ] DB migration scripts + seed
- [ ] `docs/DATABASE.md`, `docs/API.md`, `docs/SETUP.md`, `docs/FEATURE_CHECKLIST.md` (toàn ✅)
- [ ] Swagger UI tại `http://localhost:5000/swagger`
- [ ] Postman collection (export)
- [ ] `scripts/start-all.bat`, `scripts/stop-all.bat`, `scripts/recheck.bat` (recheck exit 0)
- [ ] `/admin/_health` page xanh toàn bộ
- [ ] README screenshots (12 ảnh: home, shop, detail, cart, checkout, vnpay-tab, order timeline, AI outfit, admin dashboard, staff permissions, chat widget, loading logo)
- [ ] Demo video (5-10 phút end-to-end, đi qua đủ 22 features F01-F22)

---

## 17. OPEN ITEMS (cần xác nhận trước khi sprint 0 bắt đầu)

- [ ] Confirm có dùng Hangfire không, hay tự code `BackgroundService` cho tier-update + voucher-expire jobs (Plan default: tự code `BackgroundService` để không thêm dependency).
- [ ] Confirm domain ngrok cho VNPAY IPN test (hoặc bỏ test IPN, chỉ test return URL).
- [ ] Mức ngưỡng membership tier (2M/10M/30M) có hợp lý không hay cần điều chỉnh.

---

**End of plan — sẵn sàng bắt đầu Sprint 0 sau khi user approve.**

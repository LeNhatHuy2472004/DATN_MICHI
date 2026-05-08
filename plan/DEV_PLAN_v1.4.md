# KẾ HOẠCH DEV — THIENPLAN CLOTHES MICHI (Web bán quần áo)

> **Stack:** React (Vite + TS + Tailwind) · ASP.NET Core 8 Web API · SQL Server (LocalDB)
> **AI:** Google Gemini API (multimodal, free tier)
> **Payment:** Tiền mặt + VNPAY Sandbox
> **Plan version:** 1.4 — 2026-05-07
> **Changelog v1.1:** + Module nhắn tin tư vấn (chat) · VNPAY payment dùng modal/webview · `.bat` script chạy đồng thời FE+BE
> **Changelog v1.2:** ↻ VNPAY chuyển từ modal/iframe → **redirect rồi tự close tab/return về trang gốc** · + Custom loading **logo xoay** (logo auto-generate) toàn site · + Cơ chế **Feature Recheck Checklist** đảm bảo đủ chức năng trước bàn giao
> **Changelog v1.3:** ↻ **Redesign UI: monochrome đen/xám/trắng** · + **Button system đồng bộ** (5 variant + 4 size duy nhất, cấm tự custom) · 🐛 Fix `start-all.bat` không chạy FE · 🐛 Fix CORS BE chặn FE
> **Changelog v1.4:** ↻ **Unified login** (1 form duy nhất, role-based redirect — bỏ CTA "Đăng nhập quản trị") · + **One-shot seed** (chỉ chạy 1 lần qua bảng `SeedMarkers`, đã xóa thì KHÔNG re-seed) · + Folder `assets/seed/products/` chứa ảnh demo + manifest mapping

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
│   ├── _run-be.cmd                        ← worker BE (called by start-all)
│   ├── _run-fe.cmd                        ← worker FE (called by start-all)
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

## 9. UI/UX GUIDELINES — MONOCHROME REDESIGN

**Triết lý thiết kế:** tối giản, sạch, "fashion editorial" — chỉ dùng **đen + xám + trắng**, không dùng màu rực. Toàn bộ điểm nhấn đến từ typography, spacing, contrast và ảnh sản phẩm. KHÔNG dùng amber/blue/red sắc nét. Hai màu duy nhất được phép có sắc là `text-emerald-700` (success ✅) và `text-rose-700` (danger ❌) — nhưng CHỈ trong icon/badge nhỏ, không dùng làm background button.

### 9.1 Color tokens (Tailwind config — `tailwind.config.ts`)

```ts
extend: {
  colors: {
    ink: {
      950: "#0A0A0A",   // pure black-ish — text trên trắng, button primary background
      900: "#171717",   // header, h1
      700: "#404040",   // h2-h3, button secondary
      500: "#737373",   // body muted, placeholder
      400: "#A3A3A3",   // disabled text, divider strong
      300: "#D4D4D4",   // border default
      200: "#E5E5E5",   // border subtle, skeleton
      100: "#F5F5F5",   // surface alt (card hover, table stripe)
      50:  "#FAFAFA",   // page background
      0:   "#FFFFFF",   // surface
    },
    feedback: {                     // CHỈ dùng cho icon/badge text — không làm button BG
      success: "#047857",
      danger:  "#BE123C",
    },
  }
}
```

**Bảng dùng màu (BẮT BUỘC):**

| Vai trò | Token | Hex |
|---|---|---|
| Page BG | `bg-ink-50` | #FAFAFA |
| Surface card | `bg-ink-0` | #FFFFFF |
| Surface alt (hover row, table stripe) | `bg-ink-100` | #F5F5F5 |
| Border subtle | `border-ink-200` | #E5E5E5 |
| Border default | `border-ink-300` | #D4D4D4 |
| Divider strong | `border-ink-400` | #A3A3A3 |
| Text primary | `text-ink-900` | #171717 |
| Text secondary | `text-ink-700` | #404040 |
| Text muted | `text-ink-500` | #737373 |
| Text on dark | `text-ink-0` | #FFFFFF |
| Primary button BG | `bg-ink-950` | #0A0A0A |
| Primary button hover | `bg-ink-900` | #171717 |

**Cấm:** dùng class màu Tailwind raw (`bg-blue-500`, `text-amber-600`, `border-red-300`, `slate-*`, `gray-*`) trong file `.tsx`. Lint rule (eslint-plugin-tailwindcss + custom) reject.

### 9.2 Button system — ĐỒNG BỘ, không tự custom

Toàn bộ project chỉ tồn tại **1 component button duy nhất**: `<Button />` ở `frontend/thienplan-web/src/components/ui/Button.tsx`. Không ai được viết `<button className="...">` thuần trong page (lint rule cấm).

**Variants (5 — không thêm):**

| Variant | Use case | Style |
|---|---|---|
| `primary` | CTA chính (Add to cart, Checkout, Save) | `bg-ink-950 text-ink-0 hover:bg-ink-900` |
| `secondary` | Action phụ (Cancel, Back) | `bg-ink-0 text-ink-900 border border-ink-300 hover:bg-ink-100` |
| `ghost` | Action mờ (Edit nhỏ, More) | `bg-transparent text-ink-700 hover:bg-ink-100` |
| `danger` | Delete, Reject, Cancel order | `bg-ink-0 text-ink-900 border border-ink-900 hover:bg-ink-900 hover:text-ink-0` (đảo cực, không dùng đỏ rực) |
| `link` | Inline text link trong câu | `bg-transparent text-ink-900 underline underline-offset-4 hover:text-ink-700` |

**Sizes (4 — không thêm):** `sm` (h-8, px-3, text-xs) · `md` (h-10, px-4, text-sm) — DEFAULT · `lg` (h-12, px-6, text-base) · `icon` (h-10 w-10, square).

**States chuẩn (mọi variant đều có):**
- Default
- Hover (như bảng trên)
- Focus: `focus-visible:ring-2 ring-ink-900 ring-offset-2 ring-offset-ink-0`
- Active: scale-[0.98]
- Disabled: `opacity-50 cursor-not-allowed`, không hover effect
- Loading: `<Loader.Inline />` thay leading icon, disabled, giữ nguyên width (không nhảy layout)

**Border radius:** đồng nhất `rounded-md` (6px) cho mọi button. Không dùng `rounded-full` trừ icon button.

**Font weight:** đồng nhất `font-medium` cho text trong button.

**Icon:** dùng `lucide-react` size 16 (sm/md) hoặc 18 (lg). Icon-only button bắt buộc có `aria-label`.

**Implementation (rút gọn):**
```tsx
import { cva } from "class-variance-authority";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all " +
  "focus-visible:outline-none focus-visible:ring-2 ring-ink-900 ring-offset-2 ring-offset-ink-0 " +
  "active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
  {
    variants: {
      variant: {
        primary:   "bg-ink-950 text-ink-0 hover:bg-ink-900",
        secondary: "bg-ink-0 text-ink-900 border border-ink-300 hover:bg-ink-100",
        ghost:     "bg-transparent text-ink-700 hover:bg-ink-100",
        danger:    "bg-ink-0 text-ink-900 border border-ink-900 hover:bg-ink-900 hover:text-ink-0",
        link:      "bg-transparent text-ink-900 underline underline-offset-4 hover:text-ink-700 px-0 h-auto",
      },
      size: {
        sm:   "h-8 px-3 text-xs",
        md:   "h-10 px-4 text-sm",
        lg:   "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);
```

### 9.3 Form controls — đồng bộ

- **Input/Select/Textarea:** chiều cao = button (`h-10`), border `border-ink-300`, focus `ring-ink-900`, placeholder `text-ink-500`. Cùng `rounded-md`.
- **Label:** `text-sm font-medium text-ink-900`, đặt trên input, gap 6px.
- **Helper text:** `text-xs text-ink-500` dưới input.
- **Error:** border `border-ink-900` + icon `lucide-AlertCircle text-feedback-danger` + helper `text-feedback-danger`. Không tô đỏ background.
- **Checkbox/Radio:** unchecked `border-ink-400`, checked `bg-ink-950 text-ink-0`. Không dùng accent màu.

### 9.4 Layout & spacing

- **Container:** `max-w-7xl mx-auto px-4 md:px-6 lg:px-8`.
- **Grid gap:** 24px (`gap-6`) cho grid sản phẩm; 16px (`gap-4`) cho form rows.
- **Section padding:** `py-12 md:py-16` cho hero/landing; `py-8` cho list page.
- **Card:** `bg-ink-0 border border-ink-200 rounded-md p-6` (KHÔNG shadow nặng — chỉ `shadow-sm` khi hover).
- **Nav bar:** `bg-ink-0 border-b border-ink-200 h-16`.
- **Admin sidebar:** `bg-ink-950 text-ink-0 w-60`, item active `bg-ink-900`, hover `bg-ink-700/30`.

### 9.5 Typography scale

- **Font:** Inter (body + headings) — dùng 1 font duy nhất, không Playfair Display nữa (tinh giản).
- **Scale:**
  - `h1` `text-4xl font-semibold tracking-tight text-ink-900`
  - `h2` `text-2xl font-semibold tracking-tight text-ink-900`
  - `h3` `text-lg font-medium text-ink-900`
  - `body` `text-sm text-ink-700`
  - `caption` `text-xs text-ink-500`
- Letter-spacing tighter cho heading; line-height 1.5 cho body.

### 9.6 Image treatment

- Ảnh sản phẩm grid: aspect ratio `4/5` (portrait fashion), object-cover, border `border-ink-200`, hover scale-105 transition 300ms.
- Hero: full-bleed grayscale option (tùy ảnh) để giữ tone đen-trắng.

### 9.7 Hạn chế nhập liệu (giữ từ v1.0)

- Category, brand, material, color, size → dropdown / autocomplete từ DB.
- Address → dropdown Tỉnh/Huyện/Xã (API public Vietnam Provinces).
- Phone → input mask `0xxx xxx xxx`.
- Date → date picker shadcn.

### 9.8 Responsive

Mobile-first: `sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280. Mọi page audit mobile trước desktop.

### 9.9 Lint enforcement

Thêm `.eslintrc` rules:
- `tailwindcss/no-custom-classname` — chỉ allow class trong allowlist của tokens trên.
- Custom rule: regex `bg-(red|blue|amber|green|yellow|orange|pink|purple|indigo|cyan|teal|emerald|rose|sky|violet|fuchsia|lime)-\\d+` → error.
- Custom rule: `<button>` element không có `Button` import → warn.
- CI step: `npm run lint` phải pass.

### 9.10 Brand logo — auto-generate (SVG, monochrome)

Logo monogram **"TPC"** (ThienPlan Clothes) tự generate dạng SVG, **chỉ đen + trắng**, không dùng accent màu.

**Spec:**
- Format: SVG inline (component React `<BrandLogo size={n} variant="..." />`).
- Design: hình tròn nền `#0A0A0A` (ink-950), chữ "TPC" trắng `#FFFFFF`, font Inter Bold 700; viền không màu (chỉ stroke trắng `#FFFFFF` 1.5px tạo lớp tách khỏi nền tối nếu đặt trên dark).
- File: `frontend/thienplan-web/src/components/brand/BrandLogo.tsx`.
- Variant: `mark` (chỉ icon tròn) · `full` (icon + chữ "THIENPLAN") · `mono-light` (đảo cực: nền trắng, chữ + viền đen — dùng trên header sáng).
- Tự sinh không cần file ảnh.

**Sample:**
```tsx
type Variant = "mark" | "full" | "mono-light";
export function BrandLogo({ size = 48, variant = "mark", spinning = false }: {
  size?: number; variant?: Variant; spinning?: boolean;
}) {
  const dark = variant !== "mono-light";
  const bg = dark ? "#0A0A0A" : "#FFFFFF";
  const fg = dark ? "#FFFFFF" : "#0A0A0A";
  const stroke = dark ? "#FFFFFF" : "#0A0A0A";
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 64 64"
           className={spinning ? "animate-spin-slow" : ""} aria-hidden>
        <circle cx="32" cy="32" r="30" fill={bg} stroke={stroke} strokeWidth="1.5" />
        <text x="32" y="40" textAnchor="middle"
              fontFamily="Inter, system-ui" fontWeight="700"
              fontSize="20" letterSpacing="-1" fill={fg}>TPC</text>
      </svg>
      {variant === "full" && (
        <span className="font-semibold tracking-[0.2em] text-ink-900 text-sm">THIENPLAN</span>
      )}
    </span>
  );
}
```

Tailwind config thêm `animation: { 'spin-slow': 'spin 1.4s linear infinite' }`.

### 9.11 Custom Loading component — logo xoay

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

### CORS — BẮT BUỘC cấu hình trong `Program.cs`

> **Bug v1.2 đã sửa ở v1.3:** FE gọi BE bị `Access-Control-Allow-Origin` chặn. Lý do: chưa enable CORS trong .NET 8 Minimal hosting, hoặc map sai thứ tự middleware.

**`Program.cs`:**
```csharp
const string CorsPolicy = "ThienPlanCors";

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",                    // Vite dev
                "http://127.0.0.1:5173",
                builder.Configuration["Cors:FrontendUrl"]   // production override
                  ?? "http://localhost:5173"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()                              // bắt buộc khi dùng JWT cookie / SignalR
            .WithExposedHeaders("Content-Disposition");
    });
});

// ... sau builder.Build():
var app = builder.Build();

// THỨ TỰ MIDDLEWARE PHẢI ĐÚNG (sai thứ tự = CORS fail):
app.UseRouting();
app.UseCors(CorsPolicy);          // ← TRƯỚC UseAuthentication / UseAuthorization
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers().RequireCors(CorsPolicy);
app.MapHub<ChatHub>("/hubs/chat").RequireCors(CorsPolicy);  // SignalR cần riêng
```

**`appsettings.Development.json`:**
```json
{
  "Cors": {
    "FrontendUrl": "http://localhost:5173"
  }
}
```

**Note SignalR + CORS:**
- WebSocket KHÔNG dùng preflight CORS, nhưng negotiation request HTTP đầu tiên thì có → vẫn cần `RequireCors`.
- `AllowCredentials()` không hợp lệ với `AllowAnyOrigin()` → bắt buộc `WithOrigins(...)` cụ thể.
- FE cấu hình axios: `axios.defaults.withCredentials = true` (nếu dùng cookie); với JWT Bearer trong header thì không cần.

**Vite proxy (alternative để bypass CORS hoàn toàn lúc dev):**

`frontend/thienplan-web/vite.config.ts`:
```ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api":  { target: "http://localhost:5000", changeOrigin: true },
      "/hubs": { target: "http://localhost:5000", changeOrigin: true, ws: true },
    },
  },
});
```
→ FE gọi `axios.get("/api/products")` (relative) → Vite proxy về BE → không cross-origin. Dùng cách này khi gặp CORS khó debug. Production vẫn cần CORS đúng (FE/BE khác origin)..

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

**`scripts/start-all.bat`** — mở 2 cửa sổ console riêng (BE + FE), tự động restore dependencies lần đầu.

> **Bug v1.2 đã sửa ở v1.3:** ở phiên bản trước dùng `&&` và `(if not exist ...)` lồng trong `cmd /k` → cmd parser ăn nhầm dấu ngoặc, FE không chạy. Bản dưới tách thành 2 file con (`_run-be.cmd`, `_run-fe.cmd`) để cmd /k chỉ gọi 1 file → ổn định trên mọi Windows.

```bat
@echo off
setlocal
set ROOT=%~dp0..
echo === ThienPlan: starting Backend + Frontend ===

start "ThienPlan-BE" cmd /k "%~dp0_run-be.cmd"

REM Chờ 4s cho BE bind port 5000 trước khi FE start
timeout /t 4 /nobreak >nul

start "ThienPlan-FE" cmd /k "%~dp0_run-fe.cmd"

echo.
echo Backend:  http://localhost:5000  (Swagger: /swagger)
echo Frontend: http://localhost:5173
echo Run scripts\stop-all.bat to stop.
endlocal
```

**`scripts/_run-be.cmd`:**
```bat
@echo off
cd /d %~dp0..\backend\ThienPlan.Api
if not exist bin (
  echo [BE] Restoring NuGet packages...
  dotnet restore
)
echo [BE] Starting on http://localhost:5000 ...
dotnet run --urls=http://localhost:5000
pause
```

**`scripts/_run-fe.cmd`:**
```bat
@echo off
cd /d %~dp0..\frontend\thienplan-web
if not exist node_modules (
  echo [FE] Installing npm packages...
  call npm install
)
echo [FE] Starting Vite on http://localhost:5173 ...
call npm run dev
pause
```

**Lưu ý quan trọng:**
- `call npm ...` (KHÔNG bỏ `call`): `npm` trên Windows là `npm.cmd` → khi gọi từ trong `.cmd`/`.bat` mà không có `call` thì sẽ exit shell ngay sau lệnh đầu, FE không chạy. Đây là root cause bug "FE không chạy".
- `pause` ở cuối để khi process thoát/crash, console còn mở để xem log.
- `cmd /k "%~dp0_run-fe.cmd"` truyền đường dẫn tuyệt đối → không phụ thuộc CWD khi double-click.
- Không dùng `&&` trong `cmd /k "..."` (parser cmd của Windows xử lý không nhất quán khi có dấu ngoặc lồng).

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
| **0 — Setup** | 1 | Khởi tạo solution, DB schema, migrations, seed data, CI cơ bản, Swagger, **CORS config (Program.cs) + Vite proxy**, **monochrome design tokens (`tailwind.config.ts`)**, **`Button` component (5 variant)**, **`BrandLogo` + `Loader`**, **`scripts/start-all.bat` + `_run-be.cmd` + `_run-fe.cmd`** (test FE+BE start được), khởi tạo `docs/FEATURE_CHECKLIST.md` | DB chạy, API có auth, FE bootstrap monochrome, double-click `.bat` chạy được, không CORS error |
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
16. **UI monochrome:** xem mọi page (home, shop, detail, cart, checkout, admin) → CHỈ thấy đen/xám/trắng + tối đa 1 icon emerald (✅) hoặc rose (❌). Grep `src/` không match regex `bg-(red|blue|amber|green|yellow|orange|pink|purple|indigo|cyan|teal|sky|violet|fuchsia|lime)-`. Xem mọi button → cùng 5 variant chuẩn (primary đen, secondary trắng-viền, ghost, danger đảo cực, link), cùng radius `rounded-md`, cùng font weight `font-medium`, hover/focus/active state nhất quán.
17. **start-all.bat fix:** xóa `node_modules` + `bin` → double-click `scripts/start-all.bat` → 2 cửa sổ console mở: `[BE]` log "Now listening on http://localhost:5000", `[FE]` log "VITE ready in Xms — Local: http://localhost:5173". Mở browser `http://localhost:5173` → trang home render được, DevTools Network không có lỗi đỏ.
18. **CORS fix:** mở `http://localhost:5173`, DevTools Console → KHÔNG có error `Access-Control-Allow-Origin`. Test: login form → POST `/api/auth/login` → 200 + JWT trả về. Mở SignalR chat → connect thành công, `/hubs/chat/negotiate` 200 (không 405/CORS).

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
| F23 | UI | Monochrome palette (đen/xám/trắng), không còn màu rực | — | All | TC-UI-03 | ☐ | |
| F24 | UI | Button system 5 variant đồng bộ, không có button custom | Button.tsx | All | TC-UI-04 | ☐ | |
| F25 | DevX | `start-all.bat` chạy đủ FE + BE | scripts/start-all.bat | — | TC-DEVX-02 | ☐ | |
| F26 | DevX | CORS configured đúng, SignalR connect được | Program.cs | — | TC-DEVX-03 | ☐ | |

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

echo [5/8] Loader component used everywhere (no banned patterns)
findstr /R /S /C:"Loading..." %ROOT%\frontend\thienplan-web\src\*.tsx && (echo Found banned 'Loading...' string & goto :fail)

echo [6/8] Monochrome palette enforced (no banned color classes)
findstr /R /S /C:"bg-red-" /C:"bg-blue-" /C:"bg-amber-" /C:"bg-green-" /C:"bg-yellow-" /C:"bg-orange-" /C:"bg-pink-" /C:"bg-purple-" /C:"bg-indigo-" /C:"text-red-" /C:"text-blue-" /C:"text-amber-" %ROOT%\frontend\thienplan-web\src\*.tsx && (echo Found banned color class & goto :fail)

echo [7/8] No raw <button> usage outside Button.tsx
findstr /R /S /C:"<button " %ROOT%\frontend\thienplan-web\src\pages\*.tsx %ROOT%\frontend\thienplan-web\src\components\features\*.tsx && (echo Found raw button — must use Button component & goto :fail)

echo [8/8] Required docs present
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
| `start-all.bat` không chạy FE | Demo fail | Đã sửa: tách `_run-fe.cmd` + dùng `call npm run dev` (không `&&` lồng). Verify TC-DEVX-02. Fallback: Vite proxy vẫn hoạt động khi chạy thủ công |
| CORS chặn FE → BE | API call fail | `UseCors` đặt TRƯỚC `UseAuthentication` + `WithOrigins` cụ thể + `AllowCredentials`. Vite proxy `/api` là lưới an toàn dev. Verify TC-DEVX-03 |
| Dev tự thêm màu rực hoặc button raw | UI mất đồng bộ | ESLint rule + `recheck.bat` step 6+7 grep banned patterns; PR review checklist |

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

## 18. CHANGELOG v1.4 — Unified login + One-shot seed (2026-05-07)

### 18.1 Context — Tại sao thay đổi

Hai vấn đề trên build hiện tại cần dọn:

1. **Trang chủ đang có CTA "Đăng nhập quản trị"** (hero) trỏ tới `/login` — gợi ý 2 luồng login khác biệt (quản trị vs khách). Thực tế: chỉ có **1 form login duy nhất**; phân nhánh giao diện sau khi đăng nhập là dựa vào `Role` của tài khoản (Administrator/Staff → admin UI, Customer → public UI). Vì vậy nút này thừa, gây nhầm lẫn.

2. **Seed data tự re-seed nếu DB rỗng** — `CatalogDatabaseSeeder.SeedAsync` hiện kiểm `if (!await db.CatalogProducts.AnyAsync())`. Nếu admin xóa hết sản phẩm thì lần khởi động sau **sẽ tự dựng lại 33 demo product** → mất công xóa lại, không tôn trọng ý đồ admin. Cần ngữ nghĩa **"first-run only"**: seed đúng 1 lần (đánh dấu vào DB), về sau xóa cũng KHÔNG dựng lại.

3. **Seeded products đang có `imageUrl = ""`** (đã set ở v1.3) → giao diện hero rỗng (placeholder "MICHI"). Cần cơ chế bơm ảnh demo lúc seed lần đầu, đặt trong `assets/seed/products/` để xem được sản phẩm thật ngay từ lần đầu chạy.

### 18.2 Unified login — bỏ CTA riêng

**Tinh thần:** chỉ có 1 trang `/login` duy nhất. Sau khi `auth.login()` thành công, route theo role:
- `Administrator` hoặc `Staff` → `navigate('/admin')`
- `Customer` → `navigate('/')`

Logic này **đã có sẵn** ở [App.tsx:883](DATN_MICHI/frontend/src/App.tsx#L883):
```ts
navigate(isBackOfficeUser(user) ? '/admin' : '/')
```

Việc cần làm chỉ là **xóa entry-point thừa** ngoài `/login`:

| File | Dòng | Thay đổi |
|---|---|---|
| `App.tsx` | 324-326 (Home hero) | Xóa `<Link to="/login"><LogIn/> Đăng nhập quản trị</Link>` ra khỏi `.actions` của hero |
| `App.tsx` | 320-327 | Section `.actions` chỉ giữ duy nhất `<Link to="/shop">Xem bộ sưu tập</Link>` |
| `App.tsx` | `<AdminGate>` (~950) | Hiện nay block với thông báo "Cần đăng nhập quản trị". Đổi: nếu `auth.user` null → `<Navigate to="/login" replace />`. Nếu đã login nhưng không phải admin/staff → `<Navigate to="/" replace />` (customer không vào được khu admin). Hết "đăng nhập quản trị" trong UI. |
| `App.tsx` | Topbar (281-296) | Giữ nguyên: nút "Đăng nhập" khi chưa login + badge tên + (nếu admin) link "Quản trị Michi" để admin đã login chuyển vùng. Không phải lối vào login riêng → không vi phạm tinh thần "1 login". |
| `<Login>` form | 873-900 | Xóa email/password mặc định "admin@michi.local" trong `useState` → dùng chuỗi rỗng để ai cũng dùng được. Giữ nguyên 3 dòng hint credentials cuối form. |

**Files thay đổi:** chỉ `frontend/src/App.tsx` (1 file, ~10 dòng diff).

### 18.3 One-shot seed — đánh dấu bằng `SeedMarkers` table

**Mô hình:** thêm bảng `SeedMarkers` 1 dòng/1 lần seed:

```csharp
public sealed class SeedMarkerEntity
{
    public string Key { get; set; } = string.Empty;        // e.g. "initial-catalog"
    public DateTimeOffset AppliedAt { get; set; }
    public string Notes { get; set; } = string.Empty;      // số rows đã seed, version, …
}
```

Trong [AppDbContext.cs](DATN_MICHI/backend/Data/AppDbContext.cs):
- Thêm `DbSet<SeedMarkerEntity> SeedMarkers`
- `OnModelCreating`: `ToTable("SeedMarkers")`, `HasKey(x => x.Key)`, `Property(Key).HasMaxLength(80)`, `Property(Notes).HasMaxLength(400)`

Trong [CatalogDatabaseSeeder.cs](DATN_MICHI/backend/Data/CatalogDatabaseSeeder.cs):

```csharp
const string SeedKey = "initial-catalog/v1";

public static async Task SeedAsync(AppDbContext db, DemoStore store, CancellationToken ct = default)
{
    await db.Database.EnsureCreatedAsync(ct);

    var alreadySeeded = await db.SeedMarkers.AnyAsync(x => x.Key == SeedKey, ct);
    if (!alreadySeeded)
    {
        // Categories + Products (33 demo)
        db.CatalogCategories.AddRange(SeedCategories.Select(ToCategoryEntity));
        var products = BuildProducts();
        db.CatalogProducts.AddRange(products.Select(ToEntity));
        db.SeedMarkers.Add(new SeedMarkerEntity {
            Key = SeedKey,
            AppliedAt = DateTimeOffset.UtcNow,
            Notes = $"{products.Count} products, {SeedCategories.Length} categories"
        });
        await db.SaveChangesAsync(ct);
    }
    // KHÔNG còn block "if (!CatalogProducts.AnyAsync())" cũ
    // KHÔNG còn idempotent refresh URL — đó là logic tạm cho upgrade lần trước, có thể bỏ ở v1.4
    
    await ReloadStoreAsync(db, store, ct);
}
```

**Hành vi mới:**
- Lần đầu: bảng `SeedMarkers` rỗng → seed chạy → ghi marker.
- Lần thứ 2+: marker tồn tại → **bỏ qua hoàn toàn**. Admin có thể CRUD tự do, xóa hết cũng được — không bị dựng lại.
- Reset hoàn toàn (dev cần): xóa row trong `SeedMarkers` (hoặc drop DB) → seed chạy lại từ đầu.

### 18.4 Ảnh seed — folder + manifest

**Cấu trúc folder mới:**

```
DATN_MICHI/assets/
├── seed/
│   └── products/
│       ├── manifest.json      ← mapping slug → image filename HOẶC URL
│       ├── ao-thun.jpg        ← các file ảnh thực, 1 file/1 slug HOẶC dùng chung theo category
│       ├── quan-jeans.jpg
│       ├── ao-khoac.jpg
│       └── ...
├── products/                   ← (giữ nguyên, BE ảnh động)
└── uploads/                    ← (giữ nguyên, admin upload runtime)
```

**`manifest.json`** dạng:
```json
{
  "ao-thun-cotton-michi-daily": "/assets/seed/products/ao-thun.jpg",
  "quan-jeans-ong-suong":       "/assets/seed/products/quan-jeans.jpg",
  "ao-khoac-linen-dang-ngan":   "/assets/seed/products/ao-khoac.jpg",
  "_default": {
    "1": "/assets/seed/products/ao-thun.jpg",
    "2": "/assets/seed/products/quan-jeans.jpg",
    "3": "/assets/seed/products/ao-khoac.jpg",
    "4": "/assets/seed/products/phu-kien.jpg",
    "5": "/assets/seed/products/chan-vay.jpg",
    "6": "/assets/seed/products/dam.jpg",
    "7": "/assets/seed/products/giay.jpg",
    "8": "/assets/seed/products/tui.jpg"
  }
}
```

- Cấp 1: mapping cụ thể `slug → URL`. Admin có thể chỉnh từng sản phẩm.
- Cấp 2 `_default`: fallback theo `categoryId` cho slug nào chưa có entry riêng.

**Trong seeder** (`BuildProducts`):
- Ở đầu method, đọc `manifest.json` từ `Path.Combine(env.ContentRootPath, "..", "assets", "seed", "products", "manifest.json")` (truyền `IWebHostEnvironment` qua `SeedAsync` arg, hoặc dùng `Directory.GetCurrentDirectory()`).
- Khi build mỗi `DemoProduct`: tra `manifest[slug]`; nếu null → tra `_default[categoryId]`; nếu vẫn null → `imageUrl = ""`.
- File serve qua `/assets/seed/products/<filename>` (BE đã `UseStaticFiles` cho cả `assets/` root, nên seed/ tự động được serve).

**Ảnh thực (đã chốt):** tôi sẽ download 8 ảnh fashion neutral từ Unsplash (~80–150KB/file, ~1MB tổng), lưu vào `assets/seed/products/<category-name>.jpg` (vd `top.jpg`, `bottom.jpg`, `outerwear.jpg`, `dress.jpg`, `skirt.jpg`, `accessory.jpg`, `shoes.jpg`, `bag.jpg`). Manifest mapping cụ thể vài slug nổi bật → ảnh riêng, còn lại fallback theo `_default[categoryId]`. Lần đầu chạy sẽ thấy UI có ảnh thật. Admin có thể upload thay từng sản phẩm runtime qua trang `/admin/products`.

**Hành vi khi DB đã seed:** manifest **không tác dụng** sau lần đầu — vì marker đã có. Muốn thay ảnh: admin upload qua `/api/admin/upload/image` rồi PUT `/api/admin/products/:id` (đã có CRUD đầy đủ ở v1.3).

### 18.5 Files to modify

| File | Loại |
|---|---|
| `DATN_MICHI/frontend/src/App.tsx` | Edit (3 chỗ: hero CTA, Login defaults, AdminGate redirect) |
| `DATN_MICHI/backend/Data/AppDbContext.cs` | Edit (thêm DbSet + entity config) — kèm class `SeedMarkerEntity` |
| `DATN_MICHI/backend/Data/CatalogDatabaseSeeder.cs` | Edit (logic seed mới, đọc manifest, ghi marker) |
| `DATN_MICHI/backend/Program.cs` | (không đổi — `EnsureCreated` vẫn làm việc tạo bảng mới) |
| `DATN_MICHI/assets/seed/products/manifest.json` | **Tạo mới** |
| `DATN_MICHI/assets/seed/products/*.jpg` | **Tạo mới** (~8 ảnh) |

### 18.6 Verification

1. **Reset seed:** xóa file SQL Server LocalDB của `ThienPlanClothesDb` (hoặc `DELETE FROM SeedMarkers`). Khởi động BE → log có `Membership tier job…`, `Now listening on…`. Truy `/api/catalog/products` → 33 sản phẩm, mỗi sản phẩm có `imageUrl` trỏ `/assets/seed/products/...`.
2. **Idempotent:** restart BE → lần này `SeedMarkers` đã có row → seed bỏ qua. Truy lại products → vẫn 33 sản phẩm, không tăng/lặp.
3. **Xóa rồi không dựng lại:** dùng admin token, `DELETE /api/admin/products/:id` cho 33 row (hoặc query `DELETE FROM CatalogProducts; DELETE FROM CatalogProductVariants;`). Restart BE → `/api/catalog/products` trả `[]` (rỗng) — **không** auto re-seed. ✅
4. **Unified login UI:**
   - Mở `/` (chưa đăng nhập) → hero chỉ có 1 CTA "Xem bộ sưu tập". Topbar hiện nút "Đăng nhập".
   - Click "Đăng nhập" → `/login` (form trống).
   - Login `customer@michi.local / Customer@123` → redirect `/`. Topbar hiện badge "Khách hàng Michi" (hoặc tên customer), KHÔNG thấy link `/admin`.
   - Logout → login lại với `admin@michi.local / Admin@123` → redirect `/admin` thẳng.
   - Customer đã login mà gõ tay URL `/admin/products` → `<AdminGate>` redirect về `/`.
5. **Đổi ảnh seed:** sửa `manifest.json` (đổi 1 entry), reset DB, restart BE → ảnh mới xuất hiện ở product card.
6. **`recheck.bat`:** vẫn pass (không phá break check nào).

### 18.7 Out of scope của v1.4

- Không chạm Order/Cart/Voucher/Chat — chỉ login routing + catalog seed.
- Không tạo entity migration tự động (vẫn dùng `EnsureCreatedAsync`). Khi sang prod thực sự sẽ chuyển `dotnet ef migrations add` — đó là việc của một changelog sau.

---

**End of plan — sẵn sàng bắt đầu Sprint 0 sau khi user approve.**

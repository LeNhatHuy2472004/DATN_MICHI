# LUỒNG NGHIỆP VỤ — MICHI

> Tổng hợp các use-case theo từng tác nhân (actor) của hệ thống. Tham chiếu plan: [`plan/DEV_PLAN_v1.4.md`](plan/DEV_PLAN_v1.4.md). Trạng thái triển khai: ✅ đã có, 🟡 phần khung, ⚪ chưa làm.

## Bảng actor

| Actor | Vai trò | Lối vào hệ thống |
|---|---|---|
| **Khách (Guest)** | Xem hàng, mua không cần tài khoản | Truy cập trực tiếp `/`, không login |
| **Customer** | Khách có tài khoản, có lịch sử & voucher theo hạng | Đăng nhập tại `/login` (form chung) |
| **Staff** | Nhân viên cửa hàng, quyền giới hạn theo cấu hình của Admin | Đăng nhập tại `/login` → tự redirect `/admin` |
| **Administrator** | Chủ shop, toàn quyền | Đăng nhập tại `/login` → tự redirect `/admin` |
| **System (BE)** | Background job, seed, IPN | Tự động — không có UI lối vào |
| **VNPAY Sandbox** | Cổng thanh toán bên ngoài | Server-to-server qua IPN |
| **Gemini API** | AI phối đồ | BE gọi outbound khi customer yêu cầu |

> **Quan trọng:** chỉ có **1 form đăng nhập duy nhất** (`/login`). Sau khi auth thành công, FE đọc `user.role` để route — Admin/Staff vào `/admin`, Customer vào `/`. Không có URL "đăng nhập quản trị" riêng.

---

## 1. Luồng KHÁCH (Guest) — không có tài khoản

```
[/]
 ├─ Trang chủ (Hero + sản phẩm mới + voucher)
 │     └─ Xem hero (3 ảnh từ DB hoặc placeholder)
 ├─ /shop  → duyệt + filter (search, category)
 ├─ /product/:slug
 │     ├─ Chọn variant (color × size)
 │     ├─ Add to cart  ─── tạo cart guest (guestToken trong localStorage)
 │     └─ /ai/outfit/:productId → gợi ý phối đồ Gemini
 ├─ /cart  → xem giỏ, sửa số lượng
 ├─ /checkout
 │     ├─ Form: name, phone, email, address (nhập tay)
 │     ├─ Chọn shipping: PickupAtStore | Delivery
 │     ├─ Chọn payment: Cash | VnPay
 │     └─ Đặt đơn
 │            ├─ Cash + Pickup    → /account/orders/:code  (status Confirmed)
 │            ├─ Cash + Delivery  → /account/orders/:code  (status AwaitingShipment, COD)
 │            └─ VnPay            → mở tab VNPAY → return → tab tự đóng
 ├─ /account/orders/:code  → tracking timeline
 └─ Chat widget (góc phải) → mở conversation guest, nhắn tư vấn realtime
```

**Đặc thù guest:**
- Cart, Order, Conversation đều bám theo `GuestToken` (UUID lưu localStorage).
- BE tự tạo `Conversation` cho guest khi gửi tin đầu tiên.
- Không thấy được voucher hạng vì chưa có membership tier.
- Sau khi đặt hàng, BE **có thể** tự tạo customer account từ thông tin đã nhập (auto-create) — gửi mail link đặt password.

---

## 2. Luồng CUSTOMER — đã đăng nhập

### 2.1 Đăng nhập / đăng ký

```
[Đăng ký mới]
  /register → form (email, password, fullName, phone)
            → POST /api/auth/register
            → BE tạo user role=Customer, tier=Bronze
            → tự login

[Đăng nhập]
  /login → form (email, password) — KHÔNG còn lựa chọn "đăng nhập quản trị"
        → POST /api/auth/login
        → BE trả {accessToken (15ph), refreshToken (7d), user}
        → FE: navigate(isBackOfficeUser(user) ? '/admin' : '/')
        → Customer landing tại /
```

### 2.2 Mua hàng (member)

Giống guest nhưng:
- Cart prefill theo `userId`.
- Checkout form prefill từ profile.
- Có thể chọn voucher hợp lệ với tier (`/api/vouchers/available`).
- Đơn hàng gắn `userId` → tự cộng `TotalSpent12M` cho membership tier job.

### 2.3 Trả hàng

```
/account/orders/:code (trong vòng 7 ngày sau Delivered)
  → bấm "Yêu cầu trả hàng"
  → Form: chọn item + quantity, lý do (dropdown), upload ảnh
  → POST /api/returns (status=Requested)
  → Staff/Admin có quyền `return.approve` duyệt
  → Hoàn tiền theo PaymentMethod gốc (Cash thủ công / VNPAY refund API)
  → Stock được cộng lại variant tương ứng
```

### 2.4 Voucher & Membership

```
[Tier auto-update] (background job nightly)
  TotalSpent12M < 2M  → Bronze
  2M ≤ ... < 10M      → Silver
  10M ≤ ... < 30M     → Gold
  ≥ 30M               → Diamond

[Apply voucher]
  /checkout → dropdown voucher available cho tier hiện tại
            → BE validate (tier, min order, expiry, quantity, đã dùng chưa)
            → Áp dụng → cập nhật subtotal, ghi VoucherUsages
```

### 2.5 Chat tư vấn

```
ChatWidget (mọi trang) → mở panel
  ├─ Customer login: conversation gắn userId
  └─ Guest: conversation gắn guestToken
  
SignalR /hubs/chat:
  ├─ JoinConversation(id)
  ├─ SendMessage(id, content) → server broadcast cho staff online
  └─ Polling fallback 5s nếu mất kết nối
```

---

## 3. Luồng STAFF — nhân viên có quyền giới hạn

Staff đăng nhập cùng form `/login`. Sau auth, role=Staff → redirect `/admin`. **AdminGate** kiểm tra role → cho vào (chặn nếu là Customer).

### 3.1 Quyền của Staff

Quyền được Admin cấu hình per-user qua `/admin/staff/:id/permissions`. Master list:

| Module | Permission codes |
|---|---|
| Product | `product.view`, `product.create`, `product.update`, `product.delete` |
| Order | `order.view`, `order.create_pos`, `order.update_status`, `order.cancel` |
| Return | `return.view`, `return.approve`, `return.reject`, `return.process_refund` |
| Voucher | `voucher.view`, `voucher.create`, `voucher.update`, `voucher.expire` |
| Customer | `customer.view`, `customer.create`, `customer.update` |
| Chat | `chat.view`, `chat.reply`, `chat.assign`, `chat.close` |
| Inventory | `inventory.view`, `inventory.adjust` |
| Report | `report.view_sales`, `report.view_inventory` |

### 3.2 Use-case staff thường gặp

```
[Bán hàng tại quầy — POS]
  /admin/pos
    → Tìm/quét sản phẩm
    → Add vào giỏ POS
    → Chọn customer (có thể tạo nhanh)
    → Chốt đơn: Cash → confirm thu tiền → in hóa đơn
    → Cập nhật stock & doanh thu

[Đăng / sửa sản phẩm]
  /admin/products
    → "+ Thêm sản phẩm" → modal form
        ├─ Tên, brand, danh mục (dropdown), chất liệu, giới tính
        ├─ Giá cơ bản (MoneyInput format vi-VN)
        ├─ Mô tả, tags
        ├─ Upload ảnh: POST /api/admin/upload/image?folder=products
        │       → BE ghi vào assets/uploads/products/
        │       → trả {url} → set vào form
        └─ Variants (color × size × price × stock × SKU)
    → POST /api/admin/products  → persist DB
    → Sửa: PUT /api/admin/products/:id  (upsert variants)
    → Xóa: DELETE /api/admin/products/:id  (cascade variants)

[Duyệt đơn / cập nhật trạng thái]
  /admin/orders
    → Filter Pending/Confirmed/Packing/Shipping/Delivered/Returned
    → Mở chi tiết → bấm nút chuyển trạng thái thủ công
    → BE ghi OrderStatusHistory với ChangedBy = staff.id
    → Customer thấy timeline cập nhật

[Xác nhận thanh toán Cash]
  Đơn Cash → staff bấm "Xác nhận đã thu tiền"
    → POST /api/payments/cash/confirm
    → PaymentStatus = Paid

[Trả hàng]
  /admin/returns → list status=Requested
    → Approve / Reject (cần `return.approve`)
    → Nếu Approve: chọn refund method, hoàn stock, đánh dấu Refunded

[Hộp thư tư vấn]
  /admin/chat → 2 cột: list conversation + chat panel
    → Assign cho mình (cần `chat.assign`)
    → Reply realtime qua SignalR
    → Close conversation
```

---

## 4. Luồng ADMINISTRATOR — chủ shop

Admin có **toàn bộ** permissions. Ngoài tất cả use-case của Staff, có thêm:

```
[Phân quyền Staff]
  /admin/staff
    → List nhân viên (role=Staff)
    → Mở chi tiết → grid checkbox permission theo module
    → PUT /api/admin/staff/:id/permissions {permissionCodes: [...]}
    → BE update bảng UserPermissions

[Tạo / sửa / vô hiệu Voucher]
  /admin/vouchers
    → "+ Voucher mới" → form
        ├─ Code (unique), Name, Type (Percent/FixedAmount/FreeShip)
        ├─ Value, MaxDiscount, MinOrderAmount, Quantity
        ├─ ApplicableTier (All/Bronze/Silver/Gold/Diamond)
        └─ StartAt, ExpireAt
    → POST /api/admin/vouchers
    → "Expire ngay": POST /api/admin/vouchers/:id/expire

[Báo cáo]
  /admin/reports
    → Doanh thu theo ngày/tuần/tháng
    → Top sản phẩm, top customer
    → Inventory low-stock (< 5 units)
    → AI usage (Gemini tokens, suggestions)

[Health check]
  /admin/_health
    → GET /api/admin/_health/features
    → Trạng thái: permissions seed, role có user demo, catalog DB count,
      VnPay config, Gemini key, SignalR hub mapped, jobs đang chạy
```

---

## 5. Luồng SYSTEM — tự động

### 5.1 Seed dữ liệu (one-shot)

```
[BE startup]
  Program.cs → CatalogDatabaseSeeder.SeedAsync(db, store, assetsRoot)
    ├─ EnsureCreatedAsync (tạo tables nếu chưa có, gồm SeedMarkers)
    ├─ Check SeedMarkers WHERE Key = "initial-catalog/v1"
    │     ├─ CÓ row → SKIP (admin xóa hết cũng KHÔNG re-seed)
    │     └─ KHÔNG → tiếp:
    │           ├─ Insert 8 categories
    │           ├─ Đọc assets/seed/products/manifest.json
    │           ├─ Insert 33 demo products + variants với imageUrl từ manifest
    │           └─ Insert SeedMarkers row → commit
    └─ ReloadStoreAsync (đồng bộ in-memory cache)

[Reset toàn bộ]
  DROP DATABASE  HOẶC  DELETE FROM SeedMarkers WHERE [Key]='initial-catalog/v1'
                 (kèm DELETE products/variants/categories)
  → Restart BE → seed lại từ manifest hiện tại
```

### 5.2 Background jobs

| Job | Tần suất | Hành động |
|---|---|---|
| `MembershipTierJob` | Daily 02:00 | Tính `TotalSpent12M` cho mỗi customer → cập nhật tier; tặng voucher khi lên hạng |
| `VoucherExpireJob` | Hourly | Set `IsActive=false` cho voucher đã `ExpireAt < now` |
| `ChatRetentionJob` | Hourly + nightly | 30ph idle → set conversation Pending; > 90 ngày → archive |

### 5.3 IPN từ VNPAY

```
[Customer thanh toán xong tại VNPAY sandbox]
  VNPAY → GET http://localhost:5000/api/payments/vnpay/ipn?vnp_*
    BE:
      ├─ Validate signature HMAC-SHA512 với HashSecret
      ├─ Tìm Order theo TxnRef
      ├─ Check vnp_Amount khớp Order.Total × 100
      ├─ Update PaymentStatus = Paid, ghi Payments record
      └─ Trả JSON {RspCode: "00", Message: "Confirm Success"}
  
  (Authoritative — không tin client return URL)
```

---

## 6. Luồng VNPAY — redirect tab + auto-close

```
[/checkout, payment=VnPay]
  Customer bấm "Đặt hàng"
    → POST /api/orders                       (BE tạo Order Pending)
    → POST /api/payments/vnpay/create-url    (BE build URL + sign)
    → window.open(paymentUrl, 'vnpay-tab')   ← TAB MỚI
    → Trang gốc giữ nguyên + Loader.Overlay "Đang chờ thanh toán..."
    → Polling GET /api/orders/:code/payment-status mỗi 2s

[Tab VNPAY]
  Customer chọn ngân hàng (test card NCB) → trả tiền

[Tab return]
  VNPAY redirect tab về /payment/vnpay-return?vnp_*
    → Trang tự GET /api/payments/vnpay/verify-return  (xác signature)
    → Hiển thị "Thanh toán thành công/thất bại" 1.5s
    → BroadcastChannel('vnpay').postMessage({status, query})
    → window.close()  ← TAB TỰ ĐÓNG

[Trang gốc]
  Lắng nghe BroadcastChannel
    → Stop polling, toast result
    → navigate /account/orders/:code

[Edge cases]
  ├─ Popup blocked → fallback window.location.href = paymentUrl
  ├─ Customer đóng tab giữa chừng → polling tiếp 5 phút
  │       → cho user "Hủy" hoặc "Đã thanh toán xong" để recover qua IPN
  └─ Authoritative cuối cùng vẫn là IPN (server-to-server)
```

---

## 7. Luồng AI PHỐI ĐỒ — Gemini

```
[Customer tại /product/:slug]
  Bấm "Phối đồ AI"
    → /ai/outfit/:productId
    → POST /api/ai/outfit-suggest {anchorProductId, occasion?, gender?}
    
BE:
  ├─ Lấy anchor product info + ảnh
  ├─ Lấy candidate pool (cùng gender, in-stock, role bổ sung — nếu anchor là Top
  │     thì candidates là Bottom/Outerwear/Shoes/Accessory)
  ├─ Build prompt cho Gemini gemini-2.0-flash:
  │     "Bạn là stylist. Sản phẩm chính: {anchor}. Hãy chọn từ danh sách
  │      sau ra 3 outfit, mỗi outfit 3-4 món. Trả về JSON [...]."
  ├─ Parse JSON, log AiSuggestionLogs (tokens cost audit)
  └─ Trả response

FE hiển thị 3 card outfit với "Add all to cart"
Cache 1h theo anchorProductId trong memory
```

---

## 8. Phân nhánh sau LOGIN — sơ đồ

```
                  [/login]
                     │
              POST /api/auth/login
                     │
              {accessToken, user}
                     │
        ┌────────────┴────────────┐
   role=Customer            role=Staff hoặc
                            role=Administrator
        │                         │
   navigate('/')           navigate('/admin')
        │                         │
   [Public site]              [Admin shell]
   - browse, cart           ├─ AdminGate kiểm role
   - checkout, orders       │     ├─ no user → /login
   - chat widget            │     ├─ Customer → /
   - profile                │     └─ ok → render
                            └─ Permissions kiểm per-action
                                  qua [RequirePermission] (BE)
```

---

## 9. Sơ đồ ORDER STATE MACHINE

```
Pending ──(payment ok)──→ Confirmed ──→ Packing ──→ Shipping ──→ Delivered
   │                          │                                       │
   └──(timeout/admin)→ Cancelled                            (within 7d)
                                                                      ↓
                                                                  Returned
                                                                      ↓
                                                    (refund qua flow Returns)
```

Mọi chuyển trạng thái ghi `OrderStatusHistory { from, to, changedBy, at, note }`.

---

## 10. Liên kết tệp triển khai chính

| Module | Tệp |
|---|---|
| Auth | `backend/Controllers/ThienPlanControllers.cs` (`AuthController`) · `backend/Helpers/JwtTokenService.cs` |
| Catalog | `backend/Data/CatalogDatabaseSeeder.cs` · `backend/Controllers/...` (`CatalogController`) |
| Admin CRUD | `backend/Controllers/...` (`AdminController`) — products, upload, staff, vouchers |
| VNPAY | `backend/Helpers/VnPayLibrary.cs` · `backend/Controllers/...` (PaymentController) — port từ `doc/vnpay_cs/` |
| Chat | `backend/Hubs/ChatHub.cs` · `backend/BackgroundJobs/ChatRetentionJob.cs` |
| Background jobs | `backend/BackgroundJobs/MembershipTierJob.cs` · `VoucherExpireJob.cs` |
| Frontend | `frontend/src/App.tsx` (toàn bộ UI hiện tại) · `frontend/src/index.css` |
| Seed assets | `assets/seed/products/manifest.json` + 8 ảnh JPG |
| Brand assets | `frontend/src/assets/brand/{logo_tron,logo_vuong,vnpay_logo}.png` (Vite bundle) |

---

**Cập nhật khi nào?** Khi thêm/sửa luồng mới, bổ sung 1 section vào file này theo cùng pattern. Tránh thay đổi format các bảng trên — script `recheck.bat` có thể grep luồng theo header.

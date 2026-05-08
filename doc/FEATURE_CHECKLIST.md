# FEATURE CHECKLIST

Status: `☐` chưa làm · `◐` đang làm · `✅` có scaffold/demo chạy được

| # | Module | Yêu cầu | API/UI | Status | Evidence |
|---|---|---|---|---|---|
| F01 | Account | 3 role Administrator/Staff/Customer | `/api/auth/*`, `/login` | ✅ | Seed account + login UI |
| F02 | Account | Admin phân quyền chi tiết Staff | `/api/admin/staff/{id}/permissions`, `/admin/staff` | ✅ | Checkbox permission grid |
| F03 | Account | Customer auto-create khi guest checkout | Thiết kế DTO guest info trong `/api/orders` | ◐ | Guest checkout chạy, auto-create account để production hóa sau |
| F04 | Account | Customer self-register | `POST /api/auth/register` | ✅ | API có sẵn |
| F05 | Product | Đăng hàng + variants + images | `POST /api/admin/products`, `/admin/products` | ✅ | Tạo sản phẩm mới |
| F06 | Product | Category cây + tag | `/api/catalog/categories`, `/shop` | ✅ | Filter category/tag/search |
| F07 | Order | Mua hàng không cần tài khoản | `/checkout`, `POST /api/orders` | ✅ | GuestToken localStorage |
| F08 | Order | Cơ chế trả hàng | `POST /api/orders/{id}/returns` | ✅ | API scaffold |
| F09 | Payment | Tiền mặt/COD | `POST /api/payments/cash/confirm` | ✅ | Update payment/order status |
| F10 | Payment | VNPAY redirect tab + auto-close | `/api/payments/vnpay/*`, `/payment/vnpay-return` | ✅ | window.open + BroadcastChannel/localStorage fallback |
| F11 | Shipping | Pickup tại quầy | `ShippingMethod=PickupAtStore` | ✅ | Checkout select |
| F12 | Shipping | Ship giả lập manual update | `PATCH /api/admin/orders/{id}/status` | ✅ | API state history |
| F13 | Voucher | Percent/FixedAmount/FreeShip | `/api/admin/vouchers`, `/api/catalog/vouchers` | ✅ | Seed + create API |
| F14 | Voucher | Theo hạng khách hàng | Voucher `ApplicableTier`, Membership job | ✅ | Config threshold + hosted job |
| F15 | Voucher | Admin expire | `POST /api/admin/vouchers/{id}/expire` | ✅ | API |
| F16 | AI | Phối đồ Gemini | `POST /api/ai/outfit-suggest`, `/ai/outfit/:productId` | ✅ | Gemini-ready fallback |
| F17 | Chat | Realtime + background fallback | `/hubs/chat`, `/api/chat/*`, widget + admin inbox | ✅ | SignalR hub + REST polling-ready |
| F18 | DevX | Script `.bat` chạy FE + BE | `scripts/start-all.bat` | ✅ | Script created |
| F19 | UI | Loading custom logo xoay | `BrandLogo`, `Loader` | ✅ | Page/overlay/inline loader |
| F20 | UI/UX | Hạn chế nhập tay | Select/filter/dropdown trong form chính | ✅ | Checkout, shop, staff permission |
| F21 | DB | Lưu connection string + credentials | `docs/DATABASE.md` | ✅ | File created |
| F22 | Cross | Liên kết UX giữa module | Home/shop/product/cart/checkout/admin/chat | ✅ | Routes linked |

## Acceptance Notes

Đây là bản MVP/scaffold chạy được theo `detail_plan`. Những phần cần production hóa tiếp: EF Core migrations thật, refresh-token persistence, upload ảnh, kiểm thử tự động sâu hơn, IPN qua ngrok/public URL, Gemini call thật.

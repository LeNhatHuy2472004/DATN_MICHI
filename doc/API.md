# API

Base URL mặc định: `http://localhost:5000`

## Auth

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`

## Catalog

- `GET /api/catalog/categories`
- `GET /api/catalog/products`
- `GET /api/catalog/products/{slug}`
- `GET /api/catalog/vouchers`

## Cart & Orders

- `GET /api/cart?guestToken=...`
- `POST /api/cart/items`
- `PATCH /api/cart/items/{variantId}`
- `DELETE /api/cart/items/{variantId}`
- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/{code}`
- `GET /api/orders/{code}/payment-status`
- `POST /api/orders/{id}/returns`

## Payments

- `POST /api/payments/cash/confirm`
- `POST /api/payments/vnpay/create-url`
- `GET /api/payments/vnpay/verify-return`
- `GET /api/payments/vnpay/ipn`

## Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/staff`
- `GET /api/admin/staff/{id}/permissions`
- `PUT /api/admin/staff/{id}/permissions`
- `POST /api/admin/products`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/{id}/status`
- `GET /api/admin/vouchers`
- `POST /api/admin/vouchers`
- `POST /api/admin/vouchers/{id}/expire`
- `GET /api/admin/_health/features`

## AI & Chat

- `POST /api/ai/outfit-suggest`
- `GET /api/chat/conversations`
- `POST /api/chat/conversations`
- `GET /api/chat/conversations/{id}/messages`
- `POST /api/chat/conversations/{id}/messages`
- SignalR hub: `/hubs/chat`

import { HubConnectionBuilder } from '@microsoft/signalr'
import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Bot,
  Boxes,
  CheckCircle2,
  CreditCard,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageCircle,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  UserCog,
  Check,
} from 'lucide-react'

// Brand logos are bundled by Vite — Vite hashes the URLs and serves them from the FE
// dev server (or the static FE build). They never go through the BE API.
import brandLogoRound from './assets/brand/logo_tron.png'
import brandLogoSquare from './assets/brand/logo_vuong.png'
import vnpayLogo from './assets/brand/vnpay_logo.png'

const heroDemoImages = [
  {
    src: 'https://images.pexels.com/photos/31971098/pexels-photo-31971098.jpeg?auto=compress&cs=tinysrgb&w=900',
    alt: 'Michi lookbook beige blazer outfit',
  },
  {
    src: 'https://images.pexels.com/photos/19821704/pexels-photo-19821704.jpeg?auto=compress&cs=tinysrgb&w=700',
    alt: 'Michi lookbook black blazer outfit',
  },
  {
    src: 'https://images.pexels.com/photos/35574662/pexels-photo-35574662.jpeg?auto=compress&cs=tinysrgb&w=700',
    alt: 'Michi lookbook neutral brown outfit',
  },
] as const

// Default to '' so the SPA hits the Vite dev proxy ("/api" → :5000), avoiding CORS in dev.
// Set VITE_API_BASE explicitly when deploying or pointing at a remote API.
const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const guestToken = localStorage.getItem('tpc_guest') ?? `guest-${crypto.randomUUID()}`
localStorage.setItem('tpc_guest', guestToken)
let pendingVnPayTab: Window | null = null
let pendingVnPayOrderCode = ''

function isBackOfficeUser(user: User | null) {
  return user?.role === 'Administrator' || user?.role === 'Staff'
}

type User = {
  id: string
  email: string
  fullName: string
  role: 'Administrator' | 'Staff' | 'Customer'
  membershipTier: string
  permissions: string[]
}

type Product = {
  id: string
  name: string
  slug: string
  description: string
  categoryId: number
  brand: string
  material: string
  gender: string
  basePrice: number
  tags: string[]
  imageUrl: string
  variants: ProductVariant[]
}

type ProductVariant = {
  id: string
  sku: string
  color: string
  size: string
  price: number
  stockQty: number
  imageUrl: string
}

type Cart = {
  id: string
  userId?: string
  guestToken: string
  subtotal: number
  items: CartItem[]
}

type CartItem = {
  id: string
  name: string
  slug: string
  imageUrl: string
  variantId: string
  sku: string
  color: string
  size: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

type Order = {
  id: string
  orderCode: string
  total: number
  paymentMethod: string
  paymentStatus: string
  orderStatus: string
  shippingMethod: string
  shippingAddress: string
  createdAt: string
  items: Array<{ productName: string; color: string; size: string; quantity: number; lineTotal: number }>
  history: Array<{ fromStatus: string; toStatus: string; changedBy: string; changedAt: string; note?: string }>
}

type Voucher = {
  id: string
  code: string
  name: string
  type: string
  value: number
  minOrderAmount: number
  applicableTier: string
  expireAt: string
  isActive: boolean
}

type Conversation = {
  id: string
  customerId?: string
  assignedStaffId?: string
  status: string
  subject: string
  lastMessageAt: string
}

type ChatMessage = {
  id: string
  conversationId: string
  senderId?: string
  senderType: string
  content: string
  createdAt: string
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
}

// Numeric input that formats with vi-VN thousand separators (e.g. 199000 -> "199.000")
// and shows blank instead of "0" so users don't have to clear the field first.
// Fully controlled — display is always derived from the parent's `value` prop.
function MoneyInput({
  value,
  onChange,
  placeholder = '0',
  className,
  ...rest
}: {
  value: number
  onChange: (n: number) => void
  placeholder?: string
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const display = value > 0 ? value.toLocaleString('vi-VN') : ''
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '')
        onChange(digits ? parseInt(digits, 10) : 0)
      }}
      className={className}
      {...rest}
    />
  )
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('tpc_token')
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `API ${response.status}`)
  }
  return response.json()
}

function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('tpc_user')
    return raw ? JSON.parse(raw) : null
  })

  async function login(email: string, password: string) {
    const result = await api<{ accessToken: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem('tpc_token', result.accessToken)
    localStorage.setItem('tpc_user', JSON.stringify(result.user))
    setUser(result.user)
    return result.user
  }

  function logout() {
    localStorage.removeItem('tpc_token')
    localStorage.removeItem('tpc_user')
    setUser(null)
  }

  return { user, login, logout }
}

function BrandLogo({ size = 40, spinning = false, variant = 'square' }: { size?: number; spinning?: boolean; variant?: 'round' | 'square' }) {
  const isRound = variant === 'round'
  return (
    <span
      className={`brand-logo ${isRound ? 'round' : 'square'} ${spinning ? 'is-spinning' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Logo Michi"
    >
      <img src={isRound ? brandLogoRound : brandLogoSquare} alt="" />
    </span>
  )
}

const Loader = {
  Page: () => (
    <div className="page-loader">
      <BrandLogo size={96} spinning variant="round" />
      <p>Đang tải...</p>
    </div>
  ),
  Overlay: ({ message }: { message?: string }) => (
    <div className="loader-overlay">
      <BrandLogo size={64} spinning variant="round" />
      {message && <span>{message}</span>}
    </div>
  ),
  Inline: () => <BrandLogo size={22} spinning variant="round" />,
}

function App() {
  const auth = useAuth()
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')

  if (isAdminRoute) {
    return (
      <AdminShell auth={auth}>
        <Routes>
          <Route path="/admin" element={<AdminGate auth={auth}><AdminDashboard /></AdminGate>} />
          <Route path="/admin/products" element={<AdminGate auth={auth}><AdminProducts /></AdminGate>} />
          <Route path="/admin/staff" element={<AdminGate auth={auth}><AdminStaff /></AdminGate>} />
          <Route path="/admin/chat" element={<AdminGate auth={auth}><AdminChat auth={auth} /></AdminGate>} />
          <Route path="/admin/_health" element={<AdminGate auth={auth}><AdminHealth /></AdminGate>} />
        </Routes>
      </AdminShell>
    )
  }

  return (
    <AppShell auth={auth}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:slug" element={<ProductDetail auth={auth} />} />
        <Route path="/cart" element={<CartPage auth={auth} />} />
        <Route path="/checkout" element={<Checkout auth={auth} />} />
        <Route path="/payment/vnpay-return" element={<VnPayReturn />} />
        <Route path="/account/orders/:code" element={<OrderDetail />} />
        <Route path="/ai/outfit/:productId" element={<OutfitSuggest />} />
        <Route path="/login" element={<Login auth={auth} />} />
      </Routes>
      <ChatWidget auth={auth} />
    </AppShell>
  )
}

function AppShell({ auth, children }: { auth: ReturnType<typeof useAuth>; children: React.ReactNode }) {
  const location = useLocation()
  const nav = [
    { to: '/', label: 'Trang chủ' },
    { to: '/shop', label: 'Cửa hàng' },
    { to: '/cart', label: 'Giỏ hàng' },
  ]
  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/">
          <BrandLogo />
          <span>Michi</span>
        </Link>
        <nav>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {auth.user ? (
          <div className="topbar-actions">
            {isBackOfficeUser(auth.user) && (
              <Link className="button secondary compact" to="/admin">
                <LayoutDashboard size={16} /> Quản trị Michi
              </Link>
            )}
            <button className="ghost" onClick={auth.logout}>
              {auth.user.fullName}
            </button>
          </div>
        ) : (
          <Link className="button compact" to="/login">
            <LogIn size={18} /> Đăng nhập
          </Link>
        )}
      </header>
      <main key={location.pathname}>{children}</main>
    </>
  )
}

function Home() {
  const [products, setProducts] = useState<Product[]>()
  const [vouchers, setVouchers] = useState<Voucher[]>()
  useEffect(() => {
    api<Product[]>('/api/catalog/products').then(setProducts)
    api<Voucher[]>('/api/catalog/vouchers').then(setVouchers)
  }, [])

  if (!products || !vouchers) return <Loader.Page />

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Michi collection 2026</p>
          <h1>Michi</h1>
          <p>Thời trang hằng ngày với chất liệu mềm, phom gọn và bảng màu dễ phối cho đi làm, đi học, đi chơi.</p>
          <div className="actions">
            <Link className="button" to="/shop">
              <ShoppingBag size={18} /> Xem bộ sưu tập
            </Link>
          </div>
        </div>
        <div className="hero-media">
          {heroDemoImages.map((image, index) => (
            <img
              key={image.src}
              src={image.src}
              alt={image.alt}
              decoding="async"
              loading={index === 0 ? 'eager' : 'lazy'}
            />
          ))}
        </div>
      </section>
      <section className="band">
        <SectionTitle icon={<Package />} title="Sản phẩm mới" />
        <ProductGrid products={products} />
      </section>
      <section className="band muted">
        <SectionTitle icon={<CreditCard />} title="Voucher đang có" />
        <div className="grid three">
          {vouchers.map((voucher) => (
            <article className="card" key={voucher.id}>
              <strong>{voucher.code}</strong>
              <h3>{voucher.name}</h3>
              <p>Áp dụng: {voucher.applicableTier} · Đơn từ {formatMoney(voucher.minOrderAmount)}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function Shop() {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [products, setProducts] = useState<Product[]>()
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>()

  useEffect(() => {
    api<Array<{ id: number; name: string }>>('/api/catalog/categories').then(setCategories)
  }, [])

  useEffect(() => {
    const query = new URLSearchParams()
    if (search) query.set('search', search)
    if (categoryId) query.set('categoryId', categoryId)
    api<Product[]>(`/api/catalog/products?${query}`).then(setProducts)
  }, [search, categoryId])

  return (
    <section className="band">
      <SectionTitle icon={<Search />} title="Cửa hàng" />
      <div className="toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, tag, chất liệu" />
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Tất cả danh mục</option>
          {categories?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      {products ? <ProductGrid products={products} /> : <Loader.Overlay message="Đang lọc sản phẩm" />}
    </section>
  )
}

function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="product-grid">
      {products.map((product) => (
        <article className="product-card" key={product.id}>
          <Link to={`/product/${product.slug}`}>
            <img src={product.imageUrl} alt={product.name} />
          </Link>
          <div>
            <p>{product.brand} · {product.material}</p>
            <h3>{product.name}</h3>
            <strong>{formatMoney(product.basePrice)}</strong>
          </div>
          <Link className="button secondary compact" to={`/product/${product.slug}`}>
            Xem chi tiết
          </Link>
        </article>
      ))}
    </div>
  )
}

function ProductDetail({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { slug } = useParams()
  const [product, setProduct] = useState<Product>()
  const [selected, setSelected] = useState<ProductVariant>()
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    api<Product>(`/api/catalog/products/${slug}`).then((data) => {
      setProduct(data)
      setSelected(data.variants[0])
    })
  }, [slug])

  async function addToCart() {
    if (!selected) return
    setAdded(false)
    setBusy(true)
    await api<Cart>('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify({ userId: auth.user?.id, guestToken, productVariantId: selected.id, quantity: 1 }),
    })
    setBusy(false)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1600)
  }

  if (!product || !selected) return <Loader.Page />

  return (
    <section className="detail">
      <img className="detail-image" src={product.imageUrl} alt={product.name} />
      <div>
        <p className="eyebrow">{product.brand} · {product.gender}</p>
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <strong className="price">{formatMoney(selected.price)}</strong>
        <div className="chips">
          {product.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="variant-list">
          {product.variants.map((variant) => (
            <button key={variant.id} className={variant.id === selected.id ? 'selected' : ''} onClick={() => setSelected(variant)}>
              {variant.color} / {variant.size} · còn {variant.stockQty}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className={`button add-cart-button ${added ? 'is-added' : ''}`} onClick={addToCart} disabled={busy}>
            {busy ? <Loader.Inline /> : added ? <Check size={18} /> : <ShoppingBag size={18} />} {added ? 'Đã thêm vào giỏ' : 'Thêm vào giỏ'}
          </button>
          <Link className="button secondary" to={`/ai/outfit/${product.id}`}>
            <Sparkles size={18} /> AI phối đồ
          </Link>
        </div>
      </div>
    </section>
  )
}

function CartPage({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [cart, setCart] = useState<Cart>()
  useEffect(() => {
    api<Cart>(`/api/cart?guestToken=${guestToken}${auth.user ? `&userId=${auth.user.id}` : ''}`).then(setCart)
  }, [auth.user])

  if (!cart) return <Loader.Page />
  return (
    <section className="band">
      <SectionTitle icon={<ShoppingBag />} title="Giỏ hàng" />
      <div className="split">
        <div className="list">
          {cart.items.length === 0 && <p className="empty">Giỏ hàng chưa có sản phẩm.</p>}
          {cart.items.map((item) => (
            <article className="line-item" key={item.variantId}>
              <img src={item.imageUrl} alt={item.name} />
              <div>
                <h3>{item.name}</h3>
                <p>{item.color} / {item.size} · {item.quantity} x {formatMoney(item.unitPrice)}</p>
              </div>
              <strong>{formatMoney(item.lineTotal)}</strong>
            </article>
          ))}
        </div>
        <aside className="summary">
          <h2>Tạm tính</h2>
          <strong>{formatMoney(cart.subtotal)}</strong>
          <Link className="button" to="/checkout">Thanh toán</Link>
        </aside>
      </div>
    </section>
  )
}

function Checkout({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const navigate = useNavigate()
  const [cart, setCart] = useState<Cart>()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    fullName: auth.user?.fullName ?? '',
    phoneNumber: '0900000000',
    email: auth.user?.email ?? 'guest@michi.local',
    address: '12 Nguyễn Trãi, Quận 1, TP.HCM',
    paymentMethod: 'Cash',
    shippingMethod: 'Delivery',
    voucherCode: '',
  })

  useEffect(() => {
    api<Cart>(`/api/cart?guestToken=${guestToken}${auth.user ? `&userId=${auth.user.id}` : ''}`).then(setCart)
  }, [auth.user])

  async function submit() {
    setBusy(true)
    const order = await api<Order>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        userId: auth.user?.id,
        guestToken,
        guestInfo: {
          fullName: form.fullName,
          phoneNumber: form.phoneNumber,
          email: form.email,
          address: form.address,
        },
        paymentMethod: form.paymentMethod,
        shippingMethod: form.shippingMethod,
        shippingAddress: form.address,
        voucherCode: form.voucherCode,
        note: 'Đơn tạo từ website Michi',
      }),
    })

    if (form.paymentMethod === 'VnPay') {
      const result = await api<{ paymentUrl: string }>('/api/payments/vnpay/create-url', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id }),
      })
      const tab = window.open(result.paymentUrl, 'vnpay-tab')
      if (!tab || tab.closed) {
        window.location.href = result.paymentUrl
        return
      }
      pendingVnPayTab = tab
      pendingVnPayOrderCode = order.orderCode
      localStorage.setItem(`tpc_vnpay_pending_${order.orderCode}`, JSON.stringify({ orderCode: order.orderCode, startedAt: Date.now() }))
      navigate(`/account/orders/${order.orderCode}?waitingPayment=1`)
    } else {
      navigate(`/account/orders/${order.orderCode}`)
    }
    setBusy(false)
  }

  if (!cart) return <Loader.Page />

  return (
    <section className="band">
      <SectionTitle icon={<Truck />} title="Thanh toán" />
      <div className="checkout-layout">
        <div className="checkout-main">
          <section className="checkout-panel">
            <div className="panel-heading">
              <span>1</span>
              <div>
                <h3>Thông tin nhận hàng</h3>
                <p>Điền thông tin để shop xác nhận và giao đơn.</p>
              </div>
            </div>
            <div className="form-grid checkout-fields">
              <label>
                <span>Người nhận</span>
                <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Họ tên người nhận" />
              </label>
              <label>
                <span>Số điện thoại</span>
                <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="Số điện thoại" />
              </label>
              <label>
                <span>Email</span>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
              </label>
              <label className="span-2">
                <span>Địa chỉ</span>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Địa chỉ nhận hàng" />
              </label>
              <label>
                <span>Vận chuyển</span>
                <select value={form.shippingMethod} onChange={(e) => setForm({ ...form, shippingMethod: e.target.value })}>
                  <option value="Delivery">Giao hàng giả lập</option>
                  <option value="PickupAtStore">Nhận tại quầy</option>
                </select>
              </label>
            </div>
          </section>
          <section className="checkout-panel">
            <div className="panel-heading">
              <span>2</span>
              <div>
                <h3>Thanh toán</h3>
                <p>Chọn phương thức thanh toán cho đơn hàng.</p>
              </div>
            </div>
            <div className="payment-options" role="radiogroup" aria-label="Hình thức thanh toán">
              <button
                type="button"
                className={form.paymentMethod === 'Cash' ? 'payment-option selected' : 'payment-option'}
                onClick={() => setForm({ ...form, paymentMethod: 'Cash' })}
              >
                <span className="payment-mark cash"><Landmark size={24} /></span>
                <span>
                  <strong>Tiền mặt / COD</strong>
                  <small>Thanh toán khi nhận hàng hoặc tại quầy</small>
                </span>
              </button>
              <button
                type="button"
                className={form.paymentMethod === 'VnPay' ? 'payment-option selected' : 'payment-option'}
                onClick={() => setForm({ ...form, paymentMethod: 'VnPay' })}
              >
                <span className="payment-mark">
                  <img className="payment-logo" src={vnpayLogo} alt="Logo VNPAY Sandbox" />
                </span>
                <span>
                  <strong>VNPAY Sandbox</strong>
                  <small>Mở tab VNPAY để thanh toán thử nghiệm</small>
                </span>
              </button>
            </div>
          </section>
          <section className="checkout-panel">
            <div className="panel-heading">
              <span>3</span>
              <div>
                <h3>Ưu đãi</h3>
                <p>Voucher được backend kiểm tra lại khi tạo đơn.</p>
              </div>
            </div>
            <select value={form.voucherCode} onChange={(e) => setForm({ ...form, voucherCode: e.target.value })}>
              <option value="">Không dùng voucher</option>
              <option value="WELCOME50">WELCOME50 - Giảm 50K</option>
              <option value="FREESHIP">FREESHIP - Miễn phí vận chuyển</option>
            </select>
          </section>
        </div>
        <aside className="summary checkout-summary">
          <h2>Tóm tắt đơn hàng</h2>
          <div className="summary-row">
            <span>Sản phẩm</span>
            <strong>{cart.items.length}</strong>
          </div>
          <div className="summary-row">
            <span>Tạm tính</span>
            <strong>{formatMoney(cart.subtotal)}</strong>
          </div>
          <div className="summary-row">
            <span>Vận chuyển</span>
            <strong>{form.shippingMethod === 'PickupAtStore' ? '0 đ' : '30.000 đ'}</strong>
          </div>
          <div className="summary-total">
            <span>Tổng dự kiến</span>
            <strong>{formatMoney(cart.subtotal + (form.shippingMethod === 'PickupAtStore' ? 0 : 30000))}</strong>
          </div>
          <button className="button lg" onClick={submit} disabled={busy || cart.items.length === 0}>
            {busy ? <Loader.Inline /> : <CreditCard size={18} />} Đặt hàng
          </button>
          <p>Voucher và tồn kho được backend kiểm tra lại khi tạo đơn.</p>
        </aside>
      </div>
    </section>
  )
}

function VnPayReturn() {
  const [searchParams] = useSearchParams()
  const [result, setResult] = useState<{ valid: boolean; responseCode: string; message: string }>()

  useEffect(() => {
    api<{ valid: boolean; responseCode: string; message: string }>(`/api/payments/vnpay/verify-return?${searchParams}`).then((data) => {
      setResult(data)
      const payload = { status: data.responseCode === '00' ? 'success' : 'failed', query: Object.fromEntries(searchParams) }
      const channel = 'BroadcastChannel' in window ? new BroadcastChannel('vnpay') : null
      channel?.postMessage(payload)
      localStorage.setItem('tpc_vnpay_result', JSON.stringify({ ...payload, at: Date.now() }))
      setTimeout(() => window.close(), 1500)
    })
  }, [searchParams])

  return (
    <section className="return-page">
      <BrandLogo size={88} spinning={!result} variant="round" />
      <h1>{result ? (result.responseCode === '00' ? 'Thanh toán thành công' : 'Thanh toán chưa hoàn tất') : 'Đang xác thực VNPAY'}</h1>
      <p>{result?.message ?? 'Trang sẽ tự đóng sau khi gửi kết quả về tab gốc.'}</p>
    </section>
  )
}

function OrderDetail() {
  const { code } = useParams()
  const [searchParams] = useSearchParams()
  const [order, setOrder] = useState<Order>()
  const [paymentNotice, setPaymentNotice] = useState<{ status: 'waiting' | 'success' | 'failed'; message: string }>()
  const waiting = searchParams.get('waitingPayment') === '1'

  useEffect(() => {
    let timer: number | undefined
    let closeTimer: number | undefined
    let gotVnPayReturn = false
    let closedAt: number | undefined

    async function refreshOrder() {
      const latest = await api<Order>(`/api/orders/${code}`)
      setOrder(latest)
      if (waiting && latest.paymentStatus === 'Paid') {
        localStorage.removeItem(`tpc_vnpay_pending_${latest.orderCode}`)
        setPaymentNotice({ status: 'success', message: 'VNPAY đã xác nhận thanh toán thành công.' })
        if (timer) clearInterval(timer)
        if (closeTimer) clearInterval(closeTimer)
      }
      if (waiting && latest.paymentStatus === 'Failed') {
        setPaymentNotice({ status: 'failed', message: 'Thanh toán VNPAY thất bại hoặc đã bị hủy.' })
        if (timer) clearInterval(timer)
        if (closeTimer) clearInterval(closeTimer)
      }
    }

    async function markVnPayFailed(message: string) {
      if (!code) return
      try {
        await api('/api/payments/vnpay/mark-failed', {
          method: 'POST',
          body: JSON.stringify({ orderCode: code, reason: message }),
        })
      } finally {
        localStorage.removeItem(`tpc_vnpay_pending_${code}`)
        setPaymentNotice({ status: 'failed', message })
        await refreshOrder()
      }
    }

    function handleVnPayResult(payload: unknown) {
      gotVnPayReturn = true
      const status = typeof payload === 'object' && payload && 'status' in payload ? String((payload as { status: string }).status) : 'failed'
      if (status === 'success') {
        setPaymentNotice({ status: 'success', message: 'Đã nhận phản hồi thành công từ trang VNPAY, đang đồng bộ trạng thái đơn.' })
      } else {
        setPaymentNotice({ status: 'failed', message: 'Trang VNPAY trả về kết quả thanh toán thất bại.' })
      }
      refreshOrder()
    }

    api<Order>(`/api/orders/${code}`).then(setOrder)
    if (waiting) {
      const channel = 'BroadcastChannel' in window ? new BroadcastChannel('vnpay') : null
      const onMessage = (event: MessageEvent) => handleVnPayResult(event.data)
      const onStorage = (event: StorageEvent) => {
        if (event.key !== 'tpc_vnpay_result' || !event.newValue) return
        handleVnPayResult(JSON.parse(event.newValue))
      }
      channel?.addEventListener('message', onMessage)
      window.addEventListener('storage', onStorage)
      timer = window.setInterval(refreshOrder, 2000)
      closeTimer = window.setInterval(() => {
        const relatedTab = pendingVnPayOrderCode === code ? pendingVnPayTab : null
        if (!relatedTab?.closed || gotVnPayReturn) return
        closedAt ??= Date.now()
        if (Date.now() - closedAt > 1800) {
          if (closeTimer) clearInterval(closeTimer)
          markVnPayFailed('Tab thanh toán VNPAY đã bị tắt trước khi trả kết quả, đơn được đánh dấu thanh toán thất bại.')
        }
      }, 800)
      return () => {
        if (timer) clearInterval(timer)
        if (closeTimer) clearInterval(closeTimer)
        channel?.removeEventListener('message', onMessage)
        channel?.close()
        window.removeEventListener('storage', onStorage)
      }
    }
    return () => undefined
  }, [code, waiting])

  if (!order) return <Loader.Page />
  return (
    <section className="band">
      {waiting && order.paymentStatus !== 'Paid' && order.paymentStatus !== 'Failed' && <Loader.Overlay message="Đang chờ thanh toán VNPAY" />}
      <SectionTitle icon={<CheckCircle2 />} title={`Đơn ${order.orderCode}`} />
      <div className="split">
        <div className="list">
          {(paymentNotice || waiting) && (
            <article className={`payment-status ${paymentNotice?.status ?? 'waiting'}`}>
              <strong>{paymentNotice?.status === 'success' ? 'Thanh toán thành công' : paymentNotice?.status === 'failed' ? 'Thanh toán thất bại' : 'Đang chờ thanh toán'}</strong>
              <p>{paymentNotice?.message ?? 'Đang chờ phản hồi từ trang thanh toán VNPAY.'}</p>
            </article>
          )}
          {order.items.map((item) => (
            <article className="line-item" key={`${item.productName}-${item.size}`}>
              <div>
                <h3>{item.productName}</h3>
                <p>{item.color} / {item.size} · SL {item.quantity}</p>
              </div>
              <strong>{formatMoney(item.lineTotal)}</strong>
            </article>
          ))}
          <div className="timeline">
            {order.history.map((item, index) => (
              <div key={`${item.toStatus}-${index}`}>
                <strong>{item.toStatus}</strong>
                <p>{new Date(item.changedAt).toLocaleString('vi-VN')} · {item.note}</p>
              </div>
            ))}
          </div>
        </div>
        <aside className="summary">
          <p>Trạng thái đơn: <strong>{order.orderStatus}</strong></p>
          <p>Thanh toán: <strong>{order.paymentStatus}</strong></p>
          <p>Hình thức: {order.paymentMethod} · {order.shippingMethod}</p>
          <strong>{formatMoney(order.total)}</strong>
        </aside>
      </div>
    </section>
  )
}

function OutfitSuggest() {
  const { productId } = useParams()
  const [data, setData] = useState<{ source: string; suggestions: Array<{ name: string; reason: string; products: Product[] }> }>()

  useEffect(() => {
    api<typeof data>('/api/ai/outfit-suggest', {
      method: 'POST',
      body: JSON.stringify({ anchorProductId: productId, occasion: 'daily', style: 'minimal' }),
    }).then(setData)
  }, [productId])

  if (!data) return <Loader.Page />
  return (
    <section className="band">
      <SectionTitle icon={<Bot />} title="AI phối đồ" />
      <p className="hint">Nguồn gợi ý: {data.source}</p>
      <div className="grid">
        {data.suggestions.map((suggestion) => (
          <article className="card" key={suggestion.name}>
            <h3>{suggestion.name}</h3>
            <p>{suggestion.reason}</p>
            <ProductGrid products={suggestion.products} />
          </article>
        ))}
      </div>
    </section>
  )
}

function Login({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!email || !password) {
      setError('Vui lòng nhập email và mật khẩu.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const user = await auth.login(email, password)
      navigate(isBackOfficeUser(user) ? '/admin' : '/')
    } catch (e) {
      setError((e as Error).message || 'Đăng nhập thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-panel">
      <BrandLogo size={72} variant="round" />
      <h1>Đăng nhập</h1>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Email"
        autoComplete="username"
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="Mật khẩu"
        autoComplete="current-password"
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {error && <p className="auth-error">{error}</p>}
      <button type="button" className="button" disabled={busy} onClick={submit}>
        {busy ? <Loader.Inline /> : <LogIn size={18} />} Vào hệ thống
      </button>
      <details className="auth-hint">
        <summary>Tài khoản demo</summary>
        <p>Admin: admin@michi.local / Admin@123</p>
        <p>Staff: staff@michi.local / Staff@123</p>
        <p>Khách: customer@michi.local / Customer@123</p>
      </details>
    </section>
  )
}

function AdminDashboard() {
  const [data, setData] = useState<{ revenue: number; orderCount: number; productCount: number; lowStock: number; openChats: number }>()
  useEffect(() => {
    api<typeof data>('/api/admin/dashboard').then(setData)
  }, [])
  if (!data) return <Loader.Page />
  return (
    <AdminLayout>
      <SectionTitle icon={<LayoutDashboard />} title="Dashboard" />
      <div className="grid five">
        <Metric label="Doanh thu" value={formatMoney(data.revenue)} />
        <Metric label="Đơn hàng" value={data.orderCount} />
        <Metric label="Sản phẩm" value={data.productCount} />
        <Metric label="Sắp hết hàng" value={data.lowStock} />
        <Metric label="Chat mở" value={data.openChats} />
      </div>
    </AdminLayout>
  )
}

function AdminShell({ auth, children }: { auth: ReturnType<typeof useAuth>; children: React.ReactNode }) {
  return (
    <>
      <header className="admin-topbar">
        <Link className="brand" to="/admin">
          <BrandLogo />
          <span>Michi Admin</span>
        </Link>
        <div className="admin-topbar-actions">
          <Link className="button secondary compact" to="/">
            <ShoppingBag size={16} /> Xem cửa hàng
          </Link>
          {auth.user ? (
            <button className="button ghost compact" onClick={auth.logout}>
              <LogOut size={16} /> {auth.user.fullName}
            </button>
          ) : (
            <Link className="button compact" to="/login">
              <LogIn size={16} /> Đăng nhập
            </Link>
          )}
        </div>
      </header>
      <main>{children}</main>
    </>
  )
}

function AdminGate({ auth, children }: { auth: ReturnType<typeof useAuth>; children: React.ReactNode }) {
  // Unified login: there is no separate "admin login" entry point. If you're not
  // authenticated yet, go to the single /login form. If you ARE logged in but as
  // a Customer, you simply don't have admin access — bounce to the public site.
  // The Login component already routes admins/staff straight to /admin on success,
  // so this gate is only the secondary defence.
  if (!auth.user) return <Navigate to="/login" replace />
  if (!isBackOfficeUser(auth.user)) return <Navigate to="/" replace />
  return children
}

type ProductFormState = {
  id?: string
  name: string
  description: string
  categoryId: number
  brand: string
  material: string
  gender: string
  basePrice: number
  isActive: boolean
  imageUrl: string
  tags: string
  variants: Array<{ id?: string; sku: string; color: string; size: string; price: number; stockQty: number }>
}

const emptyProductForm: ProductFormState = {
  name: '',
  description: '',
  categoryId: 1,
  brand: 'Michi',
  material: '',
  gender: 'Unisex',
  basePrice: 0,
  isActive: true,
  imageUrl: '',
  tags: '',
  variants: [{ sku: '', color: '', size: 'M', price: 0, stockQty: 0 }],
}

function AdminProducts() {
  const [products, setProducts] = useState<Product[]>()
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([])
  const [form, setForm] = useState<ProductFormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')

  async function reload() {
    const list = await api<Product[]>('/api/catalog/products')
    setProducts(list)
  }

  useEffect(() => {
    reload()
    api<Array<{ id: number; name: string }>>('/api/catalog/categories').then(setCategories)
  }, [])

  function openCreate() {
    setForm({ ...emptyProductForm, variants: [{ sku: `MICHI-${Date.now()}`, color: '', size: 'M', price: 0, stockQty: 0 }] })
  }

  function openEdit(product: Product) {
    setForm({
      id: product.id,
      name: product.name,
      description: product.description,
      categoryId: product.categoryId,
      brand: product.brand,
      material: product.material,
      gender: product.gender,
      basePrice: product.basePrice,
      isActive: true,
      imageUrl: product.imageUrl,
      tags: product.tags.join(', '),
      variants: product.variants.map((v) => ({ id: v.id, sku: v.sku, color: v.color, size: v.size, price: v.price, stockQty: v.stockQty })),
    })
  }

  async function uploadImage(file: File) {
    if (!form) return
    const body = new FormData()
    body.append('file', file)
    const token = localStorage.getItem('tpc_token')
    const res = await fetch(`${API_BASE}/api/admin/upload/image?folder=products`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body,
    })
    if (!res.ok) {
      alert('Upload thất bại: ' + (await res.text()))
      return
    }
    const data = await res.json() as { url: string }
    setForm({ ...form, imageUrl: data.url })
  }

  async function save() {
    if (!form) return
    setBusy(true)
    try {
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean)
      const payload = {
        name: form.name,
        description: form.description,
        categoryId: form.categoryId,
        brand: form.brand,
        material: form.material,
        gender: form.gender,
        basePrice: form.basePrice,
        imageUrl: form.imageUrl,
        isActive: form.isActive,
        tags,
        variants: form.variants,
      }
      if (form.id) {
        await api<Product>(`/api/admin/products/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await api<Product>('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) })
      }
      await reload()
      setForm(null)
    } catch (e) {
      alert('Lưu thất bại: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(product: Product) {
    if (!confirm(`Xóa sản phẩm "${product.name}"?`)) return
    setBusy(true)
    try {
      await api(`/api/admin/products/${product.id}`, { method: 'DELETE' })
      await reload()
    } catch (e) {
      alert('Xóa thất bại: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function updateVariant(index: number, patch: Partial<ProductFormState['variants'][number]>) {
    if (!form) return
    const variants = form.variants.map((v, i) => (i === index ? { ...v, ...patch } : v))
    setForm({ ...form, variants })
  }

  function addVariant() {
    if (!form) return
    setForm({ ...form, variants: [...form.variants, { sku: `MICHI-${Date.now()}`, color: '', size: 'M', price: form.basePrice, stockQty: 0 }] })
  }

  function removeVariant(index: number) {
    if (!form) return
    setForm({ ...form, variants: form.variants.filter((_, i) => i !== index) })
  }

  const filtered = (products ?? []).filter(
    (p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || p.brand.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <AdminLayout>
      <SectionTitle icon={<Boxes />} title="Quản lý sản phẩm" />
      <div className="toolbar">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Tìm theo tên hoặc brand" style={{ maxWidth: 320 }} />
        <button type="button" className="button" onClick={openCreate}>+ Thêm sản phẩm</button>
      </div>

      {!products ? (
        <Loader.Overlay message="Đang tải sản phẩm" />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 72 }}>Ảnh</th>
              <th>Tên</th>
              <th>Brand · Chất liệu</th>
              <th style={{ width: 130 }}>Giá</th>
              <th style={{ width: 100 }}>Phiên bản</th>
              <th style={{ width: 180 }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="admin-thumb" />
                  ) : (
                    <span className="admin-thumb empty">—</span>
                  )}
                </td>
                <td>
                  <strong>{p.name}</strong>
                  <div className="muted-line">{p.tags.join(', ')}</div>
                </td>
                <td>
                  {p.brand}
                  <div className="muted-line">{p.material} · {p.gender}</div>
                </td>
                <td>{formatMoney(p.basePrice)}</td>
                <td>{p.variants.length}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="button secondary compact" onClick={() => openEdit(p)}>Sửa</button>
                    <button type="button" className="button danger compact" onClick={() => remove(p)} disabled={busy}>Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="empty">Không có sản phẩm phù hợp.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {form && (
        <div className="modal-backdrop" onClick={() => !busy && setForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>{form.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2>
              <button type="button" className="button ghost compact" onClick={() => setForm(null)}>✕</button>
            </header>

            <div className="modal-body">
              <div className="form-grid">
                <label className="field">
                  <span>Tên sản phẩm</span>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Áo thun cotton Michi" />
                </label>
                <label className="field">
                  <span>Brand</span>
                  <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </label>
                <label className="field">
                  <span>Danh mục</span>
                  <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Chất liệu</span>
                  <input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} placeholder="Cotton, Linen, Denim..." />
                </label>
                <label className="field">
                  <span>Giới tính</span>
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    <option>Unisex</option>
                    <option>Nam</option>
                    <option>Nữ</option>
                  </select>
                </label>
                <label className="field">
                  <span>Giá cơ bản (VND)</span>
                  <MoneyInput value={form.basePrice} onChange={(n) => setForm({ ...form, basePrice: n })} placeholder="VD: 199.000" />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>Mô tả</span>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Mô tả ngắn về sản phẩm" />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>Tags (cách nhau bởi dấu phẩy)</span>
                  <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="daily, cotton, minimal" />
                </label>
              </div>

              <div className="image-upload">
                <span>Ảnh sản phẩm</span>
                <div className="image-upload-row">
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="" className="image-upload-preview" />
                  ) : (
                    <span className="image-upload-preview empty">Chưa có ảnh</span>
                  )}
                  <div>
                    <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
                    <p className="hint">Ảnh tối đa 5MB. JPG, PNG, WebP, SVG.</p>
                    {form.imageUrl && <p className="hint">URL: <code>{form.imageUrl}</code></p>}
                  </div>
                </div>
              </div>

              <div className="variants-block">
                <div className="variants-head">
                  <strong>Phiên bản (color × size)</strong>
                  <button type="button" className="button secondary compact" onClick={addVariant}>+ Thêm phiên bản</button>
                </div>
                <table className="admin-table compact">
                  <thead>
                    <tr><th>SKU</th><th>Màu</th><th>Size</th><th>Giá</th><th>Tồn</th><th></th></tr>
                  </thead>
                  <tbody>
                    {form.variants.map((v, i) => (
                      <tr key={i}>
                        <td><input value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} /></td>
                        <td><input value={v.color} onChange={(e) => updateVariant(i, { color: e.target.value })} /></td>
                        <td><input value={v.size} onChange={(e) => updateVariant(i, { size: e.target.value })} style={{ width: 64 }} /></td>
                        <td><MoneyInput value={v.price} onChange={(n) => updateVariant(i, { price: n })} /></td>
                        <td><input type="number" min={0} value={v.stockQty} onChange={(e) => updateVariant(i, { stockQty: Number(e.target.value) })} /></td>
                        <td>
                          {form.variants.length > 1 && (
                            <button type="button" className="button ghost compact" onClick={() => removeVariant(i)} title="Xóa phiên bản">✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <footer className="modal-foot">
              <button type="button" className="button secondary" onClick={() => setForm(null)} disabled={busy}>Hủy</button>
              <button type="button" className="button" onClick={save} disabled={busy || !form.name || form.variants.length === 0}>
                {busy ? <Loader.Inline /> : <Check size={16} />} {form.id ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function AdminStaff() {
  const [staff, setStaff] = useState<Array<{ id: string; fullName: string; email: string; role: string }>>()
  const [detail, setDetail] = useState<{ user: User; permissions: Array<{ code: string; module: string; name: string }>; granted: string[] }>()
  useEffect(() => {
    api<typeof staff>('/api/admin/staff').then((rows) => {
      setStaff(rows)
      if (rows?.[0]) api<typeof detail>(`/api/admin/staff/${rows[0].id}/permissions`).then(setDetail)
    })
  }, [])

  async function toggle(code: string) {
    if (!detail) return
    const next = detail.granted.includes(code) ? detail.granted.filter((x) => x !== code) : [...detail.granted, code]
    await api(`/api/admin/staff/${detail.user.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionCodes: next }) })
    setDetail({ ...detail, granted: next })
  }

  return (
    <AdminLayout>
      <SectionTitle icon={<UserCog />} title="Phân quyền Staff" />
      <div className="split">
        <div className="list">
          {staff?.map((item) => (
            <button className="row-button" key={item.id} onClick={() => api<typeof detail>(`/api/admin/staff/${item.id}/permissions`).then(setDetail)}>
              {item.fullName} · {item.role}
            </button>
          ))}
        </div>
        <div className="permission-grid">
          {detail?.permissions.map((permission) => (
            <label key={permission.code}>
              <input type="checkbox" checked={detail.granted.includes(permission.code)} onChange={() => toggle(permission.code)} />
              <span>{permission.code}</span>
            </label>
          ))}
        </div>
      </div>
    </AdminLayout>
  )
}

function AdminChat({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [conversations, setConversations] = useState<Conversation[]>()
  useEffect(() => {
    api<Conversation[]>('/api/chat/conversations').then(setConversations)
  }, [])
  return (
    <AdminLayout>
      <SectionTitle icon={<MessageCircle />} title="Hộp thư tư vấn" />
      <div className="grid">
        {conversations?.map((conversation) => <ConversationBox key={conversation.id} conversation={conversation} auth={auth} />)}
      </div>
    </AdminLayout>
  )
}

function ConversationBox({ conversation, auth }: { conversation: Conversation; auth: ReturnType<typeof useAuth> }) {
  const [messages, setMessages] = useState<ChatMessage[]>()
  const [content, setContent] = useState('')
  useEffect(() => {
    api<ChatMessage[]>(`/api/chat/conversations/${conversation.id}/messages`).then(setMessages)
  }, [conversation.id])

  async function send() {
    if (!content.trim()) return
    const message = await api<ChatMessage>(`/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ senderId: auth.user?.id, senderType: auth.user?.role ?? 'Staff', content, attachmentUrl: null }),
    })
    setMessages([...(messages ?? []), message])
    setContent('')
  }

  return (
    <article className="card chat-card">
      <h3>{conversation.subject}</h3>
      <div className="messages">
        {messages?.map((message) => (
          <p key={message.id}><strong>{message.senderType}:</strong> {message.content}</p>
        ))}
      </div>
      <div className="toolbar">
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nhập phản hồi" />
        <button className="button compact" onClick={send}>Gửi</button>
      </div>
    </article>
  )
}

function AdminHealth() {
  const [checks, setChecks] = useState<Array<{ code: string; ok: boolean; detail: string }>>()
  useEffect(() => {
    api<typeof checks>('/api/admin/_health/features').then(setChecks)
  }, [])
  return (
    <AdminLayout>
      <SectionTitle icon={<ShieldCheck />} title="Feature Health" />
      <div className="list">
        {checks?.map((check) => (
          <article className="health-row" key={check.code}>
            <span className={check.ok ? 'ok' : 'warn'}>{check.ok ? 'OK' : 'CHECK'}</span>
            <div>
              <strong>{check.code}</strong>
              <p>{check.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </AdminLayout>
  )
}

function ChatWidget({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState<Conversation>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [content, setContent] = useState('')

  useEffect(() => {
    api<Conversation[]>('/api/chat/conversations').then((rows) => {
      if (rows[0]) {
        setConversation(rows[0])
        api<ChatMessage[]>(`/api/chat/conversations/${rows[0].id}/messages`).then(setMessages)
      }
    })
  }, [])

  useEffect(() => {
    if (!conversation) return
    const connection = new HubConnectionBuilder().withUrl(`${API_BASE}/hubs/chat`).withAutomaticReconnect().build()
    connection.on('message:new', (message: ChatMessage) => setMessages((current) => [...current, message]))
    connection.start().then(() => connection.invoke('JoinConversation', conversation.id)).catch(() => undefined)
    return () => {
      connection.stop()
    }
  }, [conversation])

  async function send() {
    if (!conversation || !content.trim()) return
    const message = await api<ChatMessage>(`/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ senderId: auth.user?.id, senderType: auth.user?.role ?? 'Customer', content, attachmentUrl: null }),
    })
    setMessages((current) => [...current, message])
    setContent('')
  }

  return (
    <div className={`chat-widget ${open ? 'open' : ''}`}>
      {open && (
        <section>
          <h3>Tư vấn Michi</h3>
          <div className="messages">
            {messages.map((message) => (
              <p key={message.id}><strong>{message.senderType}:</strong> {message.content}</p>
            ))}
          </div>
          <div className="toolbar">
            <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Bạn cần shop tư vấn gì?" />
            <button type="button" className="button compact" onClick={send}>Gửi</button>
          </div>
        </section>
      )}
      <button type="button" className="fab" onClick={() => setOpen(!open)} aria-label="Mở chat tư vấn">
        <HeartHandshake size={24} />
      </button>
    </div>
  )
}

function AdminLayout({ children }: { children: React.ReactNode }) {
  const links = [
    ['/admin', 'Dashboard'],
    ['/admin/products', 'Sản phẩm'],
    ['/admin/staff', 'Staff'],
    ['/admin/chat', 'Chat'],
    ['/admin/_health', 'Health'],
  ]
  return (
    <section className="admin-layout">
      <aside>
        {links.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
      </aside>
      <div>{children}</div>
    </section>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactElement; title: string }) {
  return (
    <div className="section-title">
      {icon}
      <h2>{title}</h2>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

export default App

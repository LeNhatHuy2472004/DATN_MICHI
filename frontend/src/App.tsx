import { HubConnectionBuilder } from '@microsoft/signalr'
import { useEffect, useRef, useState } from 'react'
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
  User as UserIcon,
  UserPlus,
  Ticket,
  X,
  ListOrdered,
  Crown,
} from 'lucide-react'

// Brand logos are bundled by Vite — Vite hashes the URLs and serves them from the FE
// dev server (or the static FE build). They never go through the BE API.
import brandLogoRound from './assets/brand/logo_tron.png'
import brandLogoSquare from './assets/brand/logo_vuong.png'
import vnpayLogo from './assets/brand/vnpay_logo.png'

const heroLookbookImages = [
  {
    src: 'https://images.pexels.com/photos/31971098/pexels-photo-31971098.jpeg?auto=compress&cs=tinysrgb&w=900',
    alt: 'MiiChin lookbook beige blazer outfit',
  },
  {
    src: 'https://images.pexels.com/photos/19821704/pexels-photo-19821704.jpeg?auto=compress&cs=tinysrgb&w=700',
    alt: 'MiiChin lookbook black blazer outfit',
  },
  {
    src: 'https://images.pexels.com/photos/35574662/pexels-photo-35574662.jpeg?auto=compress&cs=tinysrgb&w=700',
    alt: 'MiiChin lookbook neutral brown outfit',
  },
] as const

// Default to '' so the SPA hits the Vite dev proxy ("/api" → :5000), avoiding CORS in dev.
// Set VITE_API_BASE explicitly when deploying or pointing at a remote API.
const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const guestToken = localStorage.getItem('tpc_guest') ?? `guest-${crypto.randomUUID()}`
localStorage.setItem('tpc_guest', guestToken)
let pendingVnPayTab: Window | null = null
let pendingVnPayOrderCode = ''
const checkoutDraftKey = 'miichin_checkout_draft'

type CheckoutFormState = {
  fullName: string
  phoneNumber: string
  email: string
  address: string
  paymentMethod: string
  shippingMethod: string
  voucherCode: string
}

const defaultCheckoutForm = (user?: User | null): CheckoutFormState => ({
  fullName: user?.fullName ?? '',
  phoneNumber: '0900000000',
  email: user?.email ?? 'guest@miichin.local',
  address: '12 Nguyễn Trãi, Quận 1, TP.HCM',
  paymentMethod: 'Cash',
  shippingMethod: 'Delivery',
  voucherCode: '',
})

function loadCheckoutDraft(user?: User | null): CheckoutFormState {
  const fallback = defaultCheckoutForm(user)
  try {
    const raw = localStorage.getItem(checkoutDraftKey)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

function isBackOfficeUser(user: User | null) {
  return user?.role === 'Administrator' || user?.role === 'Staff'
}

type User = {
  id: string
  email: string
  fullName: string
  role: 'Administrator' | 'Staff' | 'Customer'
  membershipTier: string
  totalSpent?: number
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
  maxDiscount: number
  minOrderAmount: number
  quantity: number
  usedCount: number
  applicableTier: string
  scope?: string
  customerId?: string
  startAt: string
  expireAt: string
  isActive: boolean
}

type TryOnRecord = {
  id: string
  parentId?: string
  sourceImageUrl: string
  resultImageUrl: string
  productIds: string[]
  productNames: string[]
  itemTypes: string[]
  note: string
  source: string
  message: string
  createdAt: string
}

type TryOnQuota = {
  membershipTier: string
  dailyLimit: number | null
  usedToday: number
  remainingToday: number | null
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

function estimateVoucherDiscount(voucher: Voucher, subtotal: number) {
  if (subtotal < voucher.minOrderAmount) return 0
  if (voucher.type === 'Percent') return Math.min((subtotal * voucher.value) / 100, voucher.maxDiscount)
  if (voucher.type === 'FixedAmount') return Math.min(voucher.value, subtotal)
  if (voucher.type === 'FreeShip') return Math.min(voucher.value, voucher.maxDiscount)
  return 0
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
    let message = detail
    try {
      const parsed = JSON.parse(detail)
      message = parsed.message || detail
    } catch {
      message = detail
    }
    throw new Error(message || `API ${response.status}`)
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

  async function register(email: string, password: string, fullName: string, otpCode: string) {
    const result = await api<{ accessToken: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, otpCode }),
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

  async function refresh() {
    try {
      const result = await api<{ accessToken: string; user: User }>('/api/auth/me')
      localStorage.setItem('tpc_user', JSON.stringify(result.user))
      setUser(result.user)
    } catch { /* ignore */ }
  }

  return { user, login, register, logout, refresh }
}

function BrandLogo({ size = 40, spinning = false, variant = 'square' }: { size?: number; spinning?: boolean; variant?: 'round' | 'square' }) {
  const isRound = variant === 'round'
  return (
    <span
      className={`brand-logo ${isRound ? 'round' : 'square'} ${spinning ? 'is-spinning' : ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Logo MiiChin"
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
          <Route path="/admin/vouchers" element={<AdminGate auth={auth}><AdminVouchers /></AdminGate>} />
          <Route path="/admin/staff" element={<AdminGate auth={auth}><AdminStaff /></AdminGate>} />
          <Route path="/admin/orders" element={<AdminGate auth={auth}><AdminOrders /></AdminGate>} />
          <Route path="/admin/membership" element={<AdminGate auth={auth}><AdminMembership /></AdminGate>} />
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
        <Route path="/ai/try-on/:productId" element={<TryOn auth={auth} />} />
        <Route path="/login" element={<Login auth={auth} />} />
        <Route path="/register" element={<Register auth={auth} />} />
        <Route path="/account/profile" element={<AccountProfile auth={auth} />} />
        <Route path="/account/orders" element={<AccountOrders auth={auth} />} />
        <Route path="/account/try-on" element={<TryOn auth={auth} />} />
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
          <span>MiiChin</span>
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
                <LayoutDashboard size={16} /> Quản trị MiiChin
              </Link>
            )}
            <AccountMenu auth={auth} />
          </div>
        ) : (
          <div className="topbar-actions">
            <Link className="button ghost compact" to="/login">Đăng nhập</Link>
            <Link className="button compact" to="/register">Đăng ký</Link>
          </div>
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
          <p className="eyebrow">MiiChin collection 2026</p>
          <h1>MiiChin</h1>
          <p>Thời trang hằng ngày với chất liệu mềm, phom gọn và bảng màu dễ phối cho đi làm, đi học, đi chơi.</p>
          <div className="actions">
            <Link className="button" to="/shop">
              <ShoppingBag size={18} /> Xem bộ sưu tập
            </Link>
          </div>
        </div>
        <div className="hero-media">
          {heroLookbookImages.map((image, index) => (
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
  const [related, setRelated] = useState<Product[]>([])

  useEffect(() => {
    api<Product>(`/api/catalog/products/${slug}`).then((data) => {
      setProduct(data)
      setSelected(data.variants[0])
      api<Product[]>(`/api/catalog/products?categoryId=${data.categoryId}&limit=8`)
        .then(all => setRelated(all.filter(p => p.id !== data.id).slice(0, 4)))
        .catch(() => undefined)
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
    <>
      <section className="detail">
        <img className="detail-image" src={selected.imageUrl || product.imageUrl} alt={product.name} />
        <div>
          <p className="eyebrow">{product.brand} · {product.gender}</p>
          <h1>{product.name}</h1>
          {product.material && <p style={{ color: 'var(--ink-500)', fontSize: 14 }}>Chất liệu: {product.material}</p>}
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
            <Link className="button secondary" to={`/ai/try-on/${product.id}`}>
              <Sparkles size={18} /> AI Thử đồ
            </Link>
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="band">
          <h2 style={{ marginBottom: 20 }}>Sản phẩm liên quan</h2>
          <div className="grid four">
            {related.map(p => (
              <Link key={p.id} to={`/product/${p.slug}`} className="card product-card" style={{ textDecoration: 'none' }}>
                <img src={p.imageUrl} alt={p.name} style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover' }} />
                <div style={{ padding: '10px 8px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>{formatMoney(p.basePrice)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function CartPage({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [cart, setCart] = useState<Cart>()
  const [updatingId, setUpdatingId] = useState<string>()

  const fetchCart = () =>
    api<Cart>(`/api/cart?guestToken=${guestToken}${auth.user ? `&userId=${auth.user.id}` : ''}`).then(setCart)

  useEffect(() => { fetchCart() }, [auth.user])

  async function updateQty(variantId: string, delta: number, current: number) {
    const next = current + delta
    setUpdatingId(variantId)
    try {
      const updated = await api<Cart>(`/api/cart/items/${variantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: auth.user?.id, guestToken, quantity: next }),
      })
      setCart(updated)
    } finally {
      setUpdatingId(undefined)
    }
  }

  async function removeItem(variantId: string) {
    setUpdatingId(variantId)
    try {
      const updated = await api<Cart>(
        `/api/cart/items/${variantId}?userId=${auth.user?.id ?? ''}&guestToken=${guestToken}`,
        { method: 'DELETE' },
      )
      setCart(updated)
    } finally {
      setUpdatingId(undefined)
    }
  }

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
              <div style={{ flex: 1 }}>
                <h3>{item.name}</h3>
                <p>{item.color} / {item.size} · {formatMoney(item.unitPrice)}/cái</p>
                <div className="qty-controls">
                  <button
                    className="button ghost icon"
                    disabled={item.quantity <= 1 || updatingId === item.variantId}
                    onClick={() => updateQty(item.variantId, -1, item.quantity)}
                  >−</button>
                  <span className="qty-value">{updatingId === item.variantId ? '…' : item.quantity}</span>
                  <button
                    className="button ghost icon"
                    disabled={updatingId === item.variantId}
                    onClick={() => updateQty(item.variantId, 1, item.quantity)}
                  >+</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <strong className="amount">{formatMoney(item.lineTotal)}</strong>
                <button
                  className="button ghost icon"
                  title="Xóa sản phẩm"
                  disabled={updatingId === item.variantId}
                  onClick={() => removeItem(item.variantId)}
                ><X size={16} /></button>
              </div>
            </article>
          ))}
        </div>
        <aside className="summary">
          <h2>Tạm tính</h2>
          <strong className="amount">{formatMoney(cart.subtotal)}</strong>
          <Link className="button" to="/checkout">Thanh toán</Link>
        </aside>
      </div>
    </section>
  )
}

function Checkout({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const navigate = useNavigate()
  const [cart, setCart] = useState<Cart>()
  const [vouchers, setVouchers] = useState<Voucher[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [quickPassword, setQuickPassword] = useState('')
  const [quickOtpCode, setQuickOtpCode] = useState('')
  const [quickOtpSent, setQuickOtpSent] = useState(false)
  const [quickAccountBusy, setQuickAccountBusy] = useState(false)
  const [form, setForm] = useState<CheckoutFormState>(() => loadCheckoutDraft(auth.user))

  useEffect(() => {
    api<Cart>(`/api/cart?guestToken=${guestToken}${auth.user ? `&userId=${auth.user.id}` : ''}`).then(setCart)
  }, [auth.user])

  useEffect(() => {
    api<Voucher[]>(auth.user ? '/api/account/vouchers' : '/api/catalog/vouchers').then(setVouchers)
  }, [auth.user])

  useEffect(() => {
    if (!auth.user) return
    setForm((current) => ({
      ...current,
      fullName: current.fullName || auth.user?.fullName || '',
      email: current.email === 'guest@miichin.local' ? auth.user?.email ?? current.email : current.email,
    }))
  }, [auth.user])

  useEffect(() => {
    localStorage.setItem(checkoutDraftKey, JSON.stringify(form))
  }, [form])

  const availableVouchers = (vouchers ?? []).filter((voucher) =>
    voucher.applicableTier === 'All' || voucher.applicableTier === auth.user?.membershipTier)
  const selectedVoucher = availableVouchers.find((voucher) => voucher.code === form.voucherCode)
  const estimatedShipping = form.shippingMethod === 'PickupAtStore' ? 0 : 30000
  const estimatedDiscount = selectedVoucher ? estimateVoucherDiscount(selectedVoucher, cart?.subtotal ?? 0) : 0
  const estimatedTotal = Math.max(0, (cart?.subtotal ?? 0) - estimatedDiscount + estimatedShipping)

  function chooseVoucher(code: string) {
    if (!auth.user) {
      setAccountDialogOpen(true)
      return
    }
    setForm({ ...form, voucherCode: code })
  }

  async function sendQuickOtp() {
    setError('')
    if (!form.fullName.trim() || !form.email.trim()) {
      setError('Vui lòng nhập họ tên và email để nhận OTP.')
      return
    }

    setQuickAccountBusy(true)
    try {
      await api('/api/auth/register/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email: form.email.trim(), fullName: form.fullName.trim() }),
      })
      setQuickOtpSent(true)
      setError('Mã OTP đã được gửi đến Gmail của bạn. Vui lòng kiểm tra hộp thư.')
    } catch (e) {
      setError((e as Error).message || 'Không thể gửi OTP.')
    } finally {
      setQuickAccountBusy(false)
    }
  }

  async function createQuickAccount() {
    setError('')
    if (!form.fullName.trim() || !form.email.trim() || !quickPassword.trim() || !quickOtpCode.trim()) {
      setError('Vui lòng nhập họ tên, email, mật khẩu và OTP để tạo tài khoản.')
      return
    }

    setQuickAccountBusy(true)
    try {
      localStorage.setItem(checkoutDraftKey, JSON.stringify(form))
      await auth.register(form.email.trim(), quickPassword, form.fullName.trim(), quickOtpCode.trim())
      setAccountDialogOpen(false)
      setQuickPassword('')
      setQuickOtpCode('')
      setQuickOtpSent(false)
      setError('Tài khoản đã xác thực. Thông tin đơn hàng đã được giữ lại, bạn có thể tiếp tục đặt hàng.')
    } catch (e) {
      setError((e as Error).message || 'Không thể tạo tài khoản.')
    } finally {
      setQuickAccountBusy(false)
    }
  }

  async function submit() {
    if (!auth.user) {
      localStorage.setItem(checkoutDraftKey, JSON.stringify(form))
      setError('Vui lòng tạo tài khoản và xác thực Gmail để tiếp tục đặt hàng. Thông tin đơn hàng hiện tại đã được giữ lại.')
      setAccountDialogOpen(true)
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await api<{ order: Order; emailSent: boolean; emailAddress: string }>('/api/orders', {
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
          note: 'Đơn tạo từ website MiiChin',
        }),
      })
      const order = result.order
      localStorage.removeItem(checkoutDraftKey)
      if (result.emailSent) {
        setTimeout(() => alert(`📧 Email xác nhận đã gửi đến ${result.emailAddress}`), 500)
      }

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
    } catch (e) {
      setError((e as Error).message || 'Không thể tạo đơn hàng.')
    } finally {
      setBusy(false)
    }
  }

  if (!cart || !vouchers) return <Loader.Page />

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
                  <option value="Delivery">Giao hàng tiêu chuẩn</option>
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
                  <img className="payment-logo" src={vnpayLogo} alt="Logo VNPAY" />
                </span>
                <span>
                  <strong>VNPAY</strong>
                  <small>Thanh toán trực tuyến qua cổng VNPAY</small>
                </span>
              </button>
            </div>
          </section>
          <section className="checkout-panel">
            <div className="panel-heading">
              <span>3</span>
              <div>
                <h3>Ưu đãi</h3>
                <p>Đăng nhập để sử dụng voucher dành riêng cho hạng thành viên của bạn.</p>
              </div>
            </div>
            {!auth.user && (
              <button type="button" className="button secondary" onClick={() => setAccountDialogOpen(true)}>
                Đăng nhập hoặc tạo tài khoản để dùng ưu đãi
              </button>
            )}
            <div className="voucher-list">
              {availableVouchers.map((voucher) => {
                const disabled = !auth.user || (cart.subtotal < voucher.minOrderAmount)
                const selected = form.voucherCode === voucher.code
                return (
                  <button
                    type="button"
                    key={voucher.id}
                    className={selected ? 'voucher-option selected' : 'voucher-option'}
                    disabled={disabled && !!auth.user}
                    onClick={() => chooseVoucher(voucher.code)}
                  >
                    <span>
                      <strong>{voucher.code}</strong>
                      <small>{voucher.name}</small>
                    </span>
                    <span>
                      <b>{voucher.applicableTier === 'All' ? 'Tất cả' : voucher.applicableTier}</b>
                      <small>Đơn từ {formatMoney(voucher.minOrderAmount)}</small>
                    </span>
                  </button>
                )
              })}
              {availableVouchers.length === 0 && <p className="hint">Hiện chưa có voucher phù hợp với hạng thành viên của bạn.</p>}
            </div>
            {form.voucherCode && (
              <button type="button" className="button link" onClick={() => setForm({ ...form, voucherCode: '' })}>
                Bỏ chọn voucher
              </button>
            )}
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
            <strong>{formatMoney(estimatedShipping)}</strong>
          </div>
          <div className="summary-row">
            <span>Ưu đãi</span>
            <strong>-{formatMoney(estimatedDiscount)}</strong>
          </div>
          <div className="summary-total">
            <span>Tổng dự kiến</span>
            <strong>{formatMoney(estimatedTotal)}</strong>
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button className="button lg" onClick={submit} disabled={busy || cart.items.length === 0}>
            {busy ? <Loader.Inline /> : <CreditCard size={18} />} Đặt hàng
          </button>
          <p>Đơn hàng sẽ được xác nhận và cập nhật tồn kho sau khi đặt hàng.</p>
        </aside>
      </div>
      {accountDialogOpen && (
        <div className="modal-backdrop" onClick={() => !quickAccountBusy && setAccountDialogOpen(false)}>
          <div className="modal compact-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>Tạo tài khoản để tiếp tục đặt hàng</h2>
              <button type="button" className="button ghost compact" onClick={() => setAccountDialogOpen(false)}>✕</button>
            </header>
            <div className="modal-body">
              <p className="hint">Thông tin đơn hàng hiện tại đã được lưu trên máy. Vui lòng xác thực Gmail để tạo tài khoản và tiếp tục đặt hàng.</p>
              <label className="field">
                <span>Họ tên</span>
                <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </label>
              <label className="field">
                <span>Email</span>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" />
              </label>
              <button type="button" className="button secondary" disabled={quickAccountBusy} onClick={sendQuickOtp}>
                {quickAccountBusy ? <Loader.Inline /> : <MessageCircle size={16} />} Gửi mã OTP qua Gmail
              </button>
              <label className="field">
                <span>Mã OTP</span>
                <input value={quickOtpCode} onChange={(e) => setQuickOtpCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="Nhập 6 chữ số trong email" />
              </label>
              <label className="field">
                <span>Mật khẩu</span>
                <input value={quickPassword} onChange={(e) => setQuickPassword(e.target.value)} type="password" autoComplete="new-password" />
              </label>
              {quickOtpSent && <p className="hint">Nếu chưa thấy email, hãy kiểm tra Spam hoặc bấm gửi lại OTP.</p>}
              {error && <p className="auth-error">{error}</p>}
            </div>
            <footer className="modal-foot">
              <Link className="button secondary" to="/login">Đăng nhập</Link>
              <button type="button" className="button" disabled={quickAccountBusy} onClick={createQuickAccount}>
                {quickAccountBusy ? <Loader.Inline /> : <Check size={16} />} Xác thực và tạo tài khoản
              </button>
            </footer>
          </div>
        </div>
      )}
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
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order>()
  const [paymentNotice, setPaymentNotice] = useState<{ status: 'waiting' | 'success' | 'failed'; message: string }>()
  const [paymentActionBusy, setPaymentActionBusy] = useState<'vnpay' | 'cash' | null>(null)
  const [paymentActionError, setPaymentActionError] = useState('')
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

  async function retryVnPay() {
    if (!order) return
    setPaymentActionBusy('vnpay')
    setPaymentActionError('')
    try {
      const result = await api<{ paymentUrl: string }>('/api/payments/vnpay/create-url', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id }),
      })
      const tab = window.open(result.paymentUrl, 'vnpay-tab')
      pendingVnPayTab = tab
      pendingVnPayOrderCode = order.orderCode
      localStorage.setItem(`tpc_vnpay_pending_${order.orderCode}`, JSON.stringify({ orderCode: order.orderCode, at: Date.now() }))
      setPaymentNotice({ status: 'waiting', message: 'Đã mở lại cổng VNPAY, vui lòng hoàn tất thanh toán ở tab mới.' })
      navigate(`/account/orders/${order.orderCode}?waitingPayment=1`, { replace: true })
    } catch (error) {
      setPaymentActionError((error as Error).message || 'Không thể tạo lại liên kết thanh toán VNPAY.')
    } finally {
      setPaymentActionBusy(null)
    }
  }

  async function switchToCash() {
    if (!order) return
    setPaymentActionBusy('cash')
    setPaymentActionError('')
    try {
      const updated = await api<Order>('/api/payments/change-method', {
        method: 'POST',
        body: JSON.stringify({ orderId: order.id, paymentMethod: 'Cash' }),
      })
      setOrder(updated)
      setPaymentNotice({ status: 'success', message: 'Đã chuyển đơn hàng sang thanh toán khi nhận hàng.' })
      navigate(`/account/orders/${updated.orderCode}`, { replace: true })
    } catch (error) {
      setPaymentActionError((error as Error).message || 'Không thể chuyển phương thức thanh toán.')
    } finally {
      setPaymentActionBusy(null)
    }
  }

  const canResolveFailedPayment = order.paymentStatus === 'Failed'

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
          {canResolveFailedPayment && (
            <article className="payment-actions">
              <div>
                <strong>Hoàn tất thanh toán</strong>
                <p>Đơn hàng chưa được thanh toán. Bạn có thể thanh toán lại qua VNPAY hoặc chuyển sang thanh toán khi nhận hàng.</p>
              </div>
              <div className="row-actions">
                <button type="button" className="button" disabled={paymentActionBusy !== null} onClick={retryVnPay}>
                  {paymentActionBusy === 'vnpay' ? <Loader.Inline /> : <CreditCard size={16} />} Thanh toán lại VNPAY
                </button>
                <button type="button" className="button secondary" disabled={paymentActionBusy !== null} onClick={switchToCash}>
                  {paymentActionBusy === 'cash' ? <Loader.Inline /> : <Truck size={16} />} Thanh toán khi nhận hàng
                </button>
              </div>
              {paymentActionError && <p className="auth-error">{paymentActionError}</p>}
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

function productTryOnType(product: Product) {
  const name = product.name.toLowerCase()
  if (product.categoryId === 1) return 'top'
  if (product.categoryId === 2) return 'bottom'
  if (product.categoryId === 3) return 'outerwear'
  if (product.categoryId === 5) return 'skirt'
  if (product.categoryId === 6) return 'dress'
  if (product.categoryId === 7) return 'shoes'
  if (product.categoryId === 8) return 'bag'
  if (product.categoryId === 4 && (name.includes('nón') || name.includes('mũ') || name.includes('cap'))) return 'hat'
  if (product.categoryId === 4 && name.includes('thắt lưng')) return 'belt'
  if (product.categoryId === 4 && name.includes('khăn')) return 'scarf'
  if (product.categoryId === 4 && name.includes('vớ')) return 'socks'
  if (product.categoryId === 4) return 'accessory'
  return `category-${product.categoryId}`
}

function typeLabel(type: string) {
  const labels: Record<string, string> = {
    top: 'Áo',
    bottom: 'Quần',
    outerwear: 'Áo khoác',
    skirt: 'Chân váy',
    dress: 'Đầm',
    shoes: 'Giày',
    bag: 'Túi',
    hat: 'Mũ/Nón',
    belt: 'Thắt lưng',
    scarf: 'Khăn',
    socks: 'Vớ',
    accessory: 'Phụ kiện',
  }
  return labels[type] ?? type
}

function TryOn({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { productId } = useParams()
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(productId ? [productId] : [])
  const [modelImage, setModelImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [baseTryOnId, setBaseTryOnId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [resultUrl, setResultUrl] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [note, setNote] = useState('')
  const [history, setHistory] = useState<TryOnRecord[]>([])
  const [quota, setQuota] = useState<TryOnQuota>()

  useEffect(() => {
    api<Product[]>('/api/catalog/products')
      .then((rows) => setProducts(rows))
      .catch(() => setError('Không tải được thông tin sản phẩm.'))
  }, [])

  useEffect(() => {
    if (!auth.user) return
    api<TryOnRecord[]>('/api/ai/try-on/history').then(setHistory).catch(() => undefined)
    api<TryOnQuota>('/api/ai/try-on/quota').then(setQuota).catch(() => undefined)
  }, [auth.user])

  const selectedProducts = selectedProductIds
    .map((id) => products.find((item) => item.id === id))
    .filter((item): item is Product => Boolean(item))
  const selectedCategoryIds = selectedProducts.map((product) => product.categoryId)
  const remainingText = quota?.dailyLimit === null ? 'Không giới hạn' : `${quota?.remainingToday ?? 0}/${quota?.dailyLimit ?? 0}`

  function addProduct(id: string) {
    const product = products.find((item) => item.id === id)
    if (!product || selectedProductIds.includes(id)) return
    if (selectedCategoryIds.includes(product.categoryId)) {
      setError(`Mỗi lần phối chỉ được chọn một sản phẩm trong cùng danh mục. Hãy bỏ món cũ trước khi chọn món khác cùng category.`)
      return
    }
    setSelectedProductIds([...selectedProductIds, id])
    setError('')
  }

  function removeProduct(id: string) {
    setSelectedProductIds(selectedProductIds.filter((item) => item !== id))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      if (!file.type.startsWith('image/')) {
        setError('Vui lòng chọn đúng file ảnh.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Ảnh tối đa 10MB.')
        return
      }
      setModelImage(file)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(file))
      setBaseTryOnId('')
      setResultUrl('')
      setError('')
      setMessage('')
    }
  }

  const handleTryOn = async () => {
    if (!auth.user) {
      setError('Vui lòng đăng nhập để dùng AI thử đồ.')
      return
    }
    if (selectedProductIds.length === 0) {
      setError('Vui lòng chọn ít nhất một sản phẩm để phối.')
      return
    }
    if (!modelImage && !baseTryOnId) {
      setError('Vui lòng tải ảnh người mẫu/của bạn hoặc chọn một ảnh cũ để chỉnh tiếp.')
      return
    }

    setLoading(true)
    setError('')
    setMessage('Đang xử lý hình ảnh với AI...')
    try {
      const formData = new FormData()
      formData.append('productIds', selectedProductIds.join(','))
      if (modelImage) formData.append('modelImage', modelImage)
      if (baseTryOnId) formData.append('baseTryOnId', baseTryOnId)
      formData.append('note', note)
      const token = localStorage.getItem('tpc_token')
      const res = await fetch(`${API_BASE}/api/ai/try-on`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Lỗi thử đồ')
      if (!data.imageUrl) {
        throw new Error(data.message || 'OpenAI chưa trả về ảnh thử đồ.')
      }
      setResultUrl(data.imageUrl)
      setMessage(data.message || 'Đã xử lý ảnh thử đồ.')
      if (data.tryOn) setHistory([data.tryOn, ...history])
      if (data.quota) setQuota(data.quota)
    } catch (err) {
      setError((err as Error).message || 'Không thể tạo ảnh thử đồ.')
      setMessage('')
    } finally {
      setLoading(false)
    }
  }

  if (!auth.user) {
    return (
      <section className="band">
        <SectionTitle icon={<Bot />} title="AI Thử Đồ" />
        <article className="card">
          <h3>Đăng nhập để dùng AI thử đồ</h3>
          <p>Ảnh thử đồ sẽ được lưu riêng trong tài khoản của bạn và chỉ tài khoản này xem lại được.</p>
          <Link className="button" to="/login">Đăng nhập</Link>
        </article>
      </section>
    )
  }

  if (products.length === 0 && error) {
    return (
      <section className="band">
        <SectionTitle icon={<Bot />} title="AI Thử Đồ" />
        <p className="auth-error">{error}</p>
        <Link className="button secondary" to="/shop">Quay lại cửa hàng</Link>
      </section>
    )
  }
  if (products.length === 0) return <Loader.Page />

  return (
    <section className="band">
      <SectionTitle icon={<Bot />} title="AI Thử Đồ" />
      <p className="hint">Hạng {quota?.membershipTier ?? auth.user.membershipTier}: còn {remainingText} lượt hôm nay. Bronze 2 lượt/ngày, Gold 10 lượt/ngày, Diamond không giới hạn.</p>

      <div className="grid two" style={{ gap: '30px', marginTop: '30px' }}>
        <article className="card" style={{ padding: '20px' }}>
          <h3>Sản phẩm phối trên ảnh</h3>
          <p className="hint">Có thể chọn nhiều món, nhưng mỗi category chỉ được chọn một sản phẩm.</p>
          <select value="" onChange={(e) => addProduct(e.target.value)}>
            <option value="">Thêm sản phẩm vào outfit</option>
            {products.map((product) => {
              const type = productTryOnType(product)
              const disabled = selectedCategoryIds.includes(product.categoryId) || selectedProductIds.includes(product.id)
              return <option key={product.id} value={product.id} disabled={disabled}>{typeLabel(type)} · {product.name}</option>
            })}
          </select>
          <div className="list" style={{ marginTop: 16 }}>
            {selectedProducts.map((product) => (
              <article className="line-item" key={product.id}>
                <img src={product.imageUrl} alt={product.name} />
                <div>
                  <h3>{product.name}</h3>
                  <p>{typeLabel(productTryOnType(product))} · {product.material}</p>
                </div>
                <button type="button" className="button ghost compact" onClick={() => removeProduct(product.id)}>Bỏ</button>
              </article>
            ))}
            {selectedProducts.length === 0 && <p className="hint">Chọn áo, quần, chân váy, mũ hoặc phụ kiện. Mỗi category chỉ được chọn một món.</p>}
          </div>
        </article>

        <article className="card" style={{ padding: '20px' }}>
          <h3>Tải ảnh người mẫu / của bạn lên</h3>
          <p>Tối đa 10MB, nên dùng ảnh chụp thẳng, rõ người. Bạn cũng có thể chọn ảnh đã tạo bên dưới để chỉnh tiếp.</p>
          <input type="file" accept="image/*" onChange={handleImageChange} style={{ margin: '15px 0' }} />
          {previewUrl && <img src={previewUrl} alt="Preview" style={{ width: '100%', borderRadius: '8px', marginBottom: '15px' }} />}
          {baseTryOnId && <p className="hint">Đang chỉnh tiếp từ ảnh đã lưu.</p>}
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: bỏ mũ, thêm áo khoác, giữ nguyên khuôn mặt và nền ảnh" />
          <button className="button primary" disabled={(!modelImage && !baseTryOnId) || loading} onClick={handleTryOn}>
            {loading ? 'Đang tạo ảnh...' : 'Bắt đầu thử đồ'}
          </button>
          {message && <p style={{ marginTop: '15px', color: 'var(--ink-700)' }}>{message}</p>}
          {error && <p className="auth-error">{error}</p>}
        </article>

        <article className="card" style={{ padding: '20px' }}>
          <h3>Kết quả</h3>
          {resultUrl ? (
            <img src={resultUrl} alt="Result" style={{ width: '100%', borderRadius: '8px' }} />
          ) : (
            <div style={{ height: '300px', background: 'var(--ink-100)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p>{loading ? <Loader.Inline /> : 'Kết quả AI sẽ hiển thị ở đây'}</p>
            </div>
          )}
        </article>
      </div>
      <div style={{ marginTop: 40 }}>
        <SectionTitle icon={<Sparkles />} title="Ảnh AI đã lưu" />
        <div className="product-grid">
          {history.map((item) => (
            <article className="product-card" key={item.id}>
              <img src={item.resultImageUrl} alt="Ảnh AI thử đồ" />
              <div>
                <p>{new Date(item.createdAt).toLocaleString('vi-VN')}</p>
                <h3>{item.productNames.join(' + ')}</h3>
                <p>{item.itemTypes.map(typeLabel).join(', ')}</p>
              </div>
              <button type="button" className="button secondary compact" onClick={() => {
                setBaseTryOnId(item.id)
                setPreviewUrl(item.resultImageUrl)
                setModelImage(null)
                setResultUrl('')
                setMessage('Đã chọn ảnh cũ để chỉnh tiếp.')
              }}>
                Chỉnh tiếp ảnh này
              </button>
            </article>
          ))}
          {history.length === 0 && <p className="hint">Chưa có ảnh thử đồ nào trong tài khoản.</p>}
        </div>
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
        <summary>Tài khoản truy cập</summary>
        <p>Admin: admin@miichin.local / Admin@123</p>
        <p>Staff: staff@miichin.local / Staff@123</p>
        <p>Khách: customer@miichin.local / Customer@123</p>
      </details>
      <p className="hint" style={{ marginTop: 16 }}>
        Chưa có tài khoản? <Link to="/register" className="button link">Đăng ký ngay</Link>
      </p>
    </section>
  )
}

function Register({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendOtp() {
    if (!fullName || !email) {
      setError('Vui lòng nhập họ tên và email để nhận OTP.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api('/api/auth/register/request-otp', {
        method: 'POST',
        body: JSON.stringify({ fullName, email }),
      })
      setOtpSent(true)
      setError('Mã OTP đã được gửi đến Gmail của bạn. Vui lòng kiểm tra hộp thư.')
    } catch (e) {
      setError((e as Error).message || 'Không thể gửi OTP.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!fullName || !email || !password || !otpCode) {
      setError('Vui lòng nhập đủ họ tên, email, mật khẩu và OTP.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await auth.register(email, password, fullName, otpCode)
      navigate(localStorage.getItem(checkoutDraftKey) ? '/checkout' : '/')
    } catch (e) {
      setError((e as Error).message || 'Đăng ký thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-panel">
      <BrandLogo size={72} variant="round" />
      <h1>Đăng ký</h1>
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Họ và tên"
        autoComplete="name"
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Email"
        autoComplete="email"
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button type="button" className="button secondary" disabled={busy} onClick={sendOtp}>
        {busy ? <Loader.Inline /> : <MessageCircle size={18} />} Gửi mã OTP qua Gmail
      </button>
      <input
        value={otpCode}
        onChange={(e) => setOtpCode(e.target.value)}
        inputMode="numeric"
        maxLength={6}
        placeholder="Mã OTP"
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        placeholder="Mật khẩu"
        autoComplete="new-password"
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {otpSent && <p className="hint">Mã OTP có hiệu lực trong 10 phút. Nếu chưa thấy email, hãy kiểm tra Spam.</p>}
      {error && <p className="auth-error">{error}</p>}
      <button type="button" className="button" disabled={busy} onClick={submit}>
        {busy ? <Loader.Inline /> : <UserPlus size={18} />} Tạo tài khoản
      </button>
      <p className="hint" style={{ marginTop: 16 }}>
        Đã có tài khoản? <Link to="/login" className="button link">Đăng nhập</Link>
      </p>
    </section>
  )
}

function AccountMenu({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [open, setOpen] = useState(false)
  if (!auth.user) return null

  return (
    <div style={{ position: 'relative' }}>
      <button className="ghost" onClick={() => setOpen(!open)}>
        <UserIcon size={16} /> {auth.user.fullName}
      </button>
      {open && (
        <div className="account-dropdown">
          <Link to="/account/profile" onClick={() => setOpen(false)}>Hồ sơ cá nhân</Link>
          <Link to="/account/orders" onClick={() => setOpen(false)}>Đơn hàng</Link>
          <Link to="/account/try-on" onClick={() => setOpen(false)}>Ảnh AI thử đồ</Link>
          <hr />
          <button onClick={() => { setOpen(false); auth.logout() }}>Đăng xuất</button>
        </div>
      )}
    </div>
  )
}

function AccountProfile({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (auth.user) {
      api<Voucher[]>('/api/account/vouchers').then(setVouchers)
      setFullName(auth.user.fullName)
      setEmail(auth.user.email)
    }
  }, [auth.user])

  if (!auth.user) return <Navigate to="/login" replace />

  const eligibleVouchers = vouchers.filter(
    v => v.applicableTier === 'All' || v.applicableTier === auth.user?.membershipTier
  )
  const hiddenCount = vouchers.length - eligibleVouchers.length

  async function saveProfile() {
    setSaveError('')
    setSaveBusy(true)
    try {
      await api('/api/account/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim() }),
      })
      setEditing(false)
      // Reload user info
      await auth.refresh()
    } catch (e) {
      setSaveError((e as Error).message || 'Không thể cập nhật thông tin.')
    } finally {
      setSaveBusy(false)
    }
  }

  return (
    <section className="band">
      <SectionTitle icon={<UserIcon />} title="Hồ sơ cá nhân" />
      <div className="split">
        <div className="list">
          <article className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Thông tin tài khoản</h3>
              {!editing
                ? <button className="button secondary" style={{ height: 32, fontSize: 12 }} onClick={() => setEditing(true)}>Chỉnh sửa</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="button ghost" style={{ height: 32, fontSize: 12 }} onClick={() => { setEditing(false); setSaveError('') }}>Hủy</button>
                    <button className="button" style={{ height: 32, fontSize: 12 }} disabled={saveBusy} onClick={saveProfile}>{saveBusy ? <Loader.Inline size={14} /> : 'Lưu'}</button>
                  </div>
              }
            </div>
            {saveError && <p className="auth-error">{saveError}</p>}
            <div className="form-grid">
              <label className="field">
                <span>Họ và tên</span>
                <input value={editing ? fullName : auth.user.fullName} disabled={!editing}
                  onChange={e => setFullName(e.target.value)} />
              </label>
              <label className="field">
                <span>Email</span>
                <input value={editing ? email : auth.user.email} disabled={!editing}
                  onChange={e => setEmail(e.target.value)} />
              </label>
            </div>
          </article>
        </div>
        <aside className="summary">
          <h3>Hạng thành viên: <strong>{auth.user.membershipTier}</strong></h3>
          <p>Chi tiêu tích luỹ: <strong className="amount">{formatMoney(auth.user.totalSpent ?? 0)}</strong></p>
        </aside>
      </div>

      <div style={{ marginTop: 48 }}>
        <SectionTitle icon={<Ticket />} title="Voucher của bạn" />
        {hiddenCount > 0 && (
          <p className="hint" style={{ marginBottom: 12 }}>
            Có {hiddenCount} voucher dành cho hạng cao hơn — nâng cấp để mở khóa thêm ưu đãi.
          </p>
        )}
        <div className="grid three">
          {eligibleVouchers.map(v => (
            <article className="card" key={v.id}>
              <strong>{v.code}</strong>
              <p>{v.name}</p>
              <small>HSD: {new Date(v.expireAt).toLocaleDateString('vi-VN')}</small>
            </article>
          ))}
          {eligibleVouchers.length === 0 && <p className="hint">Chưa có voucher nào khả dụng.</p>}
        </div>
      </div>
    </section>
  )
}

function AccountOrders({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [orders, setOrders] = useState<Order[]>([])
  useEffect(() => {
    if (auth.user) api<Order[]>('/api/account/orders').then(setOrders)
  }, [auth.user])

  if (!auth.user) return <Navigate to="/login" replace />

  return (
    <section className="band">
      <SectionTitle icon={<ShoppingBag />} title="Đơn hàng của tôi" />
      <div className="list">
        {orders.map(o => (
          <Link key={o.id} to={`/account/orders/${o.orderCode}`} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
            <div>
              <strong>{o.orderCode}</strong>
              <p style={{ marginTop: 4 }}>{new Date(o.createdAt).toLocaleString('vi-VN')} · {o.items.length} sản phẩm</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <span className={`status-badge ${o.orderStatus?.toLowerCase()}`}>{o.orderStatus}</span>
                <span className={`status-badge ${o.paymentStatus?.toLowerCase()}`}>{o.paymentStatus}</span>
              </div>
            </div>
            <strong className="amount" style={{ fontSize: 18 }}>{formatMoney(o.total)}</strong>
          </Link>
        ))}
        {orders.length === 0 && <p className="hint">Chưa có đơn hàng nào.</p>}
      </div>
    </section>
  )
}

function BarChart({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(...rows.map((x) => x.value), 1)
  return (
    <div className="bar-chart">
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <span>{row.label}</span>
          <div><i style={{ width: `${(row.value / max) * 100}%` }} /></div>
          <b>{formatMoney(row.value)}</b>
        </div>
      ))}
    </div>
  )
}

type DashboardData = {
  revenue: number
  orderCount: number
  productCount: number
  lowStock: number
  openChats: number
  revenueByDay: Array<{ date: string; revenue: number; orders: number }>
  ordersByStatus: Array<{ status: string; count: number }>
  topProducts: Array<{ name: string; quantity: number; revenue: number }>
  stockByCategory: Array<{ category: string; stock: number }>
}

function AdminDashboard() {
  const [data, setData] = useState<DashboardData>()
  useEffect(() => {
    api<DashboardData>('/api/admin/dashboard').then(setData)
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '30px' }}>
        <article className="card" style={{ padding: '20px' }}>
          <h3>Doanh thu 7 ngày qua</h3>
          <BarChart rows={data.revenueByDay.map(x => ({ label: x.date, value: x.revenue }))} />
        </article>
        
        <article className="card" style={{ padding: '20px' }}>
          <h3>Top Sản phẩm bán chạy</h3>
          <BarChart rows={data.topProducts.map(x => ({ label: x.name, value: x.revenue }))} />
        </article>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '30px' }}>
        <article className="card" style={{ padding: '20px' }}>
          <h3>Đơn hàng theo trạng thái</h3>
          <BarChart rows={data.ordersByStatus.map(x => ({ label: x.status, value: x.count }))} />
        </article>

        <article className="card" style={{ padding: '20px' }}>
          <h3>Tồn kho theo danh mục</h3>
          <BarChart rows={data.stockByCategory.map(x => ({ label: x.category, value: x.stock }))} />
        </article>
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
          <span>MiiChin Admin</span>
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

type ColorEntry = { name: string; imageUrl: string }
type MatrixCell = { price: number; stockQty: number }

const CATEGORY_DEFAULT_SIZES: Record<number, string[]> = {
  1: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  2: ['28', '29', '30', '31', '32', '34'],
  3: ['XS', 'S', 'M', 'L', 'XL'],
  4: ['Free Size'],
  5: ['XS', 'S', 'M', 'L', 'XL'],
  6: ['XS', 'S', 'M', 'L', 'XL'],
  7: ['36', '37', '38', '39', '40', '41', '42'],
  8: ['One Size'],
}

function flattenVariants(
  productName: string,
  colors: ColorEntry[],
  sizes: string[],
  matrix: Record<string, MatrixCell>,
  basePrice: number,
) {
  const prefix = productName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'ITEM'
  return colors
    .filter((c) => c.name)
    .flatMap((c, ci) =>
      sizes.map((s) => {
        const key = `${c.name}|||${s}`
        const cell = matrix[key] ?? { price: basePrice, stockQty: 0 }
        return {
          sku: `MIICHIN-${prefix}-C${ci + 1}${s}`.slice(0, 30),
          color: c.name,
          size: s,
          price: cell.price,
          stockQty: cell.stockQty,
          imageUrl: c.imageUrl,
        }
      }),
    )
}

function parseVariantsToBuilder(
  variants: Array<{ id?: string; sku: string; color: string; size: string; price: number; stockQty: number; imageUrl?: string }>,
) {
  const colorMap = new Map<string, string>()
  const sizeOrder: string[] = []
  const matrix: Record<string, MatrixCell> = {}
  for (const v of variants) {
    if (!colorMap.has(v.color)) colorMap.set(v.color, v.imageUrl ?? '')
    if (!sizeOrder.includes(v.size)) sizeOrder.push(v.size)
    matrix[`${v.color}|||${v.size}`] = { price: v.price, stockQty: v.stockQty }
  }
  const colors: ColorEntry[] = [...colorMap.entries()].map(([name, imageUrl]) => ({ name, imageUrl }))
  return { colors, sizes: sizeOrder, matrix }
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
  colors: ColorEntry[]
  sizes: string[]
  matrix: Record<string, MatrixCell>
}

const emptyProductForm: ProductFormState = {
  name: '',
  description: '',
  categoryId: 1,
  brand: 'MiiChin',
  material: '',
  gender: 'Unisex',
  basePrice: 0,
  isActive: true,
  imageUrl: '',
  tags: '',
  colors: [{ name: '', imageUrl: '' }],
  sizes: CATEGORY_DEFAULT_SIZES[1] ?? ['S', 'M', 'L', 'XL'],
  matrix: {},
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
    setForm({ ...emptyProductForm, sizes: CATEGORY_DEFAULT_SIZES[1] ?? ['S', 'M', 'L', 'XL'] })
  }

  function openEdit(product: Product) {
    const builder = parseVariantsToBuilder(product.variants)
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
      colors: builder.colors.length > 0 ? builder.colors : [{ name: '', imageUrl: '' }],
      sizes: builder.sizes,
      matrix: builder.matrix,
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
    if (!res.ok) { alert('Upload thất bại: ' + (await res.text())); return }
    const data = await res.json() as { url: string }
    setForm({ ...form, imageUrl: data.url })
  }

  async function uploadColorImage(file: File, colorIndex: number) {
    if (!form) return
    const body = new FormData()
    body.append('file', file)
    const token = localStorage.getItem('tpc_token')
    const res = await fetch(`${API_BASE}/api/admin/upload/image?folder=products`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body,
    })
    if (!res.ok) { alert('Upload thất bại: ' + (await res.text())); return }
    const data = await res.json() as { url: string }
    const colors = form.colors.map((c, i) => i === colorIndex ? { ...c, imageUrl: data.url } : c)
    setForm({ ...form, colors })
  }

  async function save() {
    if (!form) return
    setBusy(true)
    try {
      const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean)
      const variants = flattenVariants(form.name, form.colors, form.sizes, form.matrix, form.basePrice)
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
        variants,
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
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Áo thun cotton MiiChin" />
                </label>
                <label className="field">
                  <span>Brand</span>
                  <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </label>
                <label className="field">
                  <span>Danh mục</span>
                  <select value={form.categoryId} onChange={(e) => {
                    const newCatId = Number(e.target.value)
                    setForm({ ...form, categoryId: newCatId, sizes: CATEGORY_DEFAULT_SIZES[newCatId] ?? ['S', 'M', 'L', 'XL'] })
                  }}>
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

              {/* VARIANT BUILDER */}
              <div className="variant-builder">
                {/* Section 1: Colors */}
                <div>
                  <div className="variant-section-title">Phân loại màu sắc <span style={{ fontWeight: 400, color: 'var(--ink-500)' }}>(mỗi màu có ảnh preview riêng)</span></div>
                  <div className="color-entry-list">
                    {form.colors.map((c, ci) => (
                      <div key={ci} className="color-entry">
                        <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                          {c.imageUrl
                            ? <img src={c.imageUrl} className="color-thumb" alt={c.name} title="Nhấn để đổi ảnh" />
                            : <div className="color-thumb-empty" title="Nhấn để upload ảnh">🖼</div>
                          }
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={(e) => e.target.files?.[0] && uploadColorImage(e.target.files[0], ci)} />
                        </label>
                        <input
                          className="color-name"
                          value={c.name}
                          onChange={(e) => {
                            const colors = form.colors.map((x, i) => i === ci ? { ...x, name: e.target.value } : x)
                            setForm({ ...form, colors })
                          }}
                          placeholder="Tên màu (VD: Đen)"
                        />
                        {form.colors.length > 1 && (
                          <button type="button" className="button ghost compact" style={{ padding: '0 4px', lineHeight: 1 }}
                            onClick={() => setForm({ ...form, colors: form.colors.filter((_, i) => i !== ci) })}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" className="button secondary compact"
                      onClick={() => setForm({ ...form, colors: [...form.colors, { name: '', imageUrl: '' }] })}>
                      + Thêm màu
                    </button>
                  </div>
                </div>

                {/* Section 2: Sizes */}
                <div>
                  <div className="variant-section-title">Phân loại size <span style={{ fontWeight: 400, color: 'var(--ink-500)' }}>(tự động gợi ý theo danh mục)</span></div>
                  <div className="size-checkbox-group">
                    {(CATEGORY_DEFAULT_SIZES[form.categoryId] ?? ['XS', 'S', 'M', 'L', 'XL']).map((sz) => (
                      <label key={sz}>
                        <input
                          type="checkbox"
                          checked={form.sizes.includes(sz)}
                          onChange={(e) => {
                            const sizes = e.target.checked
                              ? [...form.sizes, sz]
                              : form.sizes.filter((s) => s !== sz)
                            setForm({ ...form, sizes })
                          }}
                        />
                        {sz}
                      </label>
                    ))}
                    <input
                      placeholder="+ Tự thêm"
                      style={{ width: 90, fontSize: 13, padding: '4px 8px', border: '1px dashed var(--ink-400)', borderRadius: 6, outline: 'none' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim()
                          if (val && !form.sizes.includes(val)) setForm({ ...form, sizes: [...form.sizes, val] })
                          e.currentTarget.value = ''
                        }
                      }}
                    />
                  </div>
                  {form.sizes.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {form.sizes.map((sz) => (
                        <span key={sz} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--ink-900)', color: 'var(--ink-0)', borderRadius: 6, padding: '2px 10px', fontSize: 13 }}>
                          {sz}
                          <button type="button" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 12 }}
                            onClick={() => setForm({ ...form, sizes: form.sizes.filter((s) => s !== sz) })}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 3: Price/Stock Matrix */}
                {form.colors.some((c) => c.name) && form.sizes.length > 0 && (
                  <div>
                    <div className="variant-section-title">Bảng giá / tồn kho</div>
                    <div className="matrix-toolbar">
                      <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Áp dụng tất cả:</span>
                      <MoneyInput
                        value={0}
                        onChange={(price) => {
                          if (!price) return
                          const matrix = { ...form.matrix }
                          form.colors.filter((c) => c.name).forEach((c) =>
                            form.sizes.forEach((s) => {
                              const key = `${c.name}|||${s}`
                              matrix[key] = { ...(matrix[key] ?? { price: 0, stockQty: 0 }), price }
                            }),
                          )
                          setForm({ ...form, matrix })
                        }}
                        placeholder="Giá..."
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Tồn..."
                        style={{ width: 80 }}
                        onBlur={(e) => {
                          if (!e.target.value) return
                          const stockQty = Number(e.target.value)
                          const matrix = { ...form.matrix }
                          form.colors.filter((c) => c.name).forEach((c) =>
                            form.sizes.forEach((s) => {
                              const key = `${c.name}|||${s}`
                              matrix[key] = { ...(matrix[key] ?? { price: form.basePrice, stockQty: 0 }), stockQty }
                            }),
                          )
                          setForm({ ...form, matrix })
                          e.target.value = ''
                        }}
                      />
                    </div>
                    <div className="variant-matrix-wrap">
                      <table className="variant-matrix">
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', minWidth: 120 }}>Màu \ Size</th>
                            {form.sizes.map((s) => <th key={s}>{s}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {form.colors.filter((c) => c.name).map((c) => (
                            <tr key={c.name}>
                              <td>
                                <div className="matrix-color-cell">
                                  {c.imageUrl
                                    ? <img src={c.imageUrl} alt={c.name} />
                                    : <div style={{ width: 28, height: 28, background: 'var(--ink-200)', borderRadius: 3, flexShrink: 0 }} />
                                  }
                                  <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                                </div>
                              </td>
                              {form.sizes.map((s) => {
                                const key = `${c.name}|||${s}`
                                const cell = form.matrix[key] ?? { price: form.basePrice, stockQty: 0 }
                                return (
                                  <td key={s}>
                                    <div className="matrix-inputs">
                                      <MoneyInput
                                        value={cell.price}
                                        onChange={(price) => setForm({ ...form, matrix: { ...form.matrix, [key]: { ...cell, price } } })}
                                      />
                                      <input
                                        type="number"
                                        min={0}
                                        value={cell.stockQty}
                                        placeholder="Tồn"
                                        onChange={(e) => setForm({ ...form, matrix: { ...form.matrix, [key]: { ...cell, stockQty: Number(e.target.value) } } })}
                                      />
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="modal-foot">
              <button type="button" className="button secondary" onClick={() => setForm(null)} disabled={busy}>Hủy</button>
              <button type="button" className="button" onClick={save} disabled={busy || !form.name || form.colors.filter((c) => c.name).length === 0 || form.sizes.length === 0}>
                {busy ? <Loader.Inline /> : <Check size={16} />} {form.id ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

const voucherTypes = [
  { value: 'FixedAmount', label: 'Giảm tiền' },
  { value: 'Percent', label: 'Giảm phần trăm' },
  { value: 'FreeShip', label: 'Miễn phí vận chuyển' },
]

const voucherTiers = ['All', 'Bronze', 'Silver', 'Gold', 'Diamond']

function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function createEmptyVoucherForm() {
  const now = new Date()
  const expire = new Date(now)
  expire.setMonth(expire.getMonth() + 1)
  return {
    code: '',
    name: '',
    type: 'FixedAmount',
    value: 0,
    maxDiscount: 0,
    minOrderAmount: 0,
    quantity: 100,
    scope: 'All',
    applicableTier: 'All',
    customerId: '',
    startAt: toDateTimeLocal(now),
    expireAt: toDateTimeLocal(expire),
  }
}

function AdminVouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>()
  const [form, setForm] = useState(createEmptyVoucherForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function reload() {
    const rows = await api<Voucher[]>('/api/admin/vouchers')
    setVouchers(rows)
  }

  useEffect(() => {
    reload()
  }, [])

  async function save() {
    setBusy(true)
    setError('')
    try {
      await api<Voucher>('/api/admin/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          startAt: new Date(form.startAt).toISOString(),
          expireAt: new Date(form.expireAt).toISOString(),
        }),
      })
      setForm(createEmptyVoucherForm())
      await reload()
    } catch (e) {
      setError((e as Error).message || 'Không thể tạo voucher.')
    } finally {
      setBusy(false)
    }
  }

  async function expire(voucher: Voucher) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/vouchers/${voucher.id}/expire`, { method: 'POST' })
      await reload()
    } catch (e) {
      setError((e as Error).message || 'Không thể ngưng áp dụng voucher.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminLayout>
      <SectionTitle icon={<CreditCard />} title="Quản lý voucher" />
      <section className="checkout-panel">
        <div className="form-grid checkout-fields">
          <label>
            <span>Mã voucher</span>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="VD: GOLD10" />
          </label>
          <label>
            <span>Tên voucher</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ưu đãi khách Gold" />
          </label>
          <label>
            <span>Loại</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {voucherTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span>Giá trị</span>
            <MoneyInput value={form.value} onChange={(n) => setForm({ ...form, value: n })} placeholder={form.type === 'Percent' ? 'VD: 10' : 'VD: 50.000'} />
          </label>
          <label>
            <span>Giảm tối đa</span>
            <MoneyInput value={form.maxDiscount} onChange={(n) => setForm({ ...form, maxDiscount: n })} placeholder="VD: 120.000" />
          </label>
          <label>
            <span>Đơn tối thiểu</span>
            <MoneyInput value={form.minOrderAmount} onChange={(n) => setForm({ ...form, minOrderAmount: n })} placeholder="VD: 500.000" />
          </label>
          <label>
            <span>Số lượt</span>
            <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </label>
          <label>
            <span>Phạm vi</span>
            <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="All">Toàn bộ</option>
              <option value="Tier">Hạng thành viên</option>
              <option value="Customer">Cá nhân</option>
            </select>
          </label>
          {form.scope === 'Tier' && (
            <label>
              <span>Hạng áp dụng</span>
              <select value={form.applicableTier} onChange={(e) => setForm({ ...form, applicableTier: e.target.value })}>
                {voucherTiers.map((tier) => <option key={tier} value={tier}>{tier === 'All' ? 'Tất cả' : tier}</option>)}
              </select>
            </label>
          )}
          {form.scope === 'Customer' && (
            <label>
              <span>Mã khách hàng (ID)</span>
              <input value={form.customerId || ''} onChange={(e) => setForm({ ...form, customerId: e.target.value })} placeholder="VD: 33333333-..." />
            </label>
          )}
          <label>
            <span>Bắt đầu</span>
            <input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
          </label>
          <label>
            <span>Kết thúc</span>
            <input type="datetime-local" value={form.expireAt} onChange={(e) => setForm({ ...form, expireAt: e.target.value })} />
          </label>
        </div>
        {error && <p className="auth-error">{error}</p>}
        <div className="toolbar">
          <button type="button" className="button" disabled={busy || !form.code || !form.name} onClick={save}>
            {busy ? <Loader.Inline /> : <Check size={16} />} Tạo voucher
          </button>
        </div>
      </section>

      {!vouchers ? (
        <Loader.Overlay message="Đang tải voucher" />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên</th>
              <th>Loại</th>
              <th>Điều kiện</th>
              <th>Hạng</th>
              <th>Lượt dùng</th>
              <th>Trạng thái</th>
              <th style={{ width: 150 }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher) => (
              <tr key={voucher.id}>
                <td><strong>{voucher.code}</strong></td>
                <td>{voucher.name}</td>
                <td>{voucherTypes.find((x) => x.value === voucher.type)?.label ?? voucher.type}</td>
                <td>
                  <div>{voucher.type === 'Percent' ? `${voucher.value}%` : formatMoney(voucher.value)}</div>
                  <div className="muted-line">Đơn từ {formatMoney(voucher.minOrderAmount)}</div>
                </td>
                <td>{voucher.scope === 'Customer' ? 'Cá nhân' : (voucher.scope === 'Tier' ? voucher.applicableTier : 'Tất cả')}</td>
                <td>{voucher.usedCount}/{voucher.quantity}</td>
                <td>{voucher.isActive ? 'Đang áp dụng' : 'Đã ngưng'}</td>
                <td>
                  {voucher.isActive && (
                    <button type="button" className="button danger compact" disabled={busy} onClick={() => expire(voucher)}>
                      Ngưng áp dụng
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
            <button
              className={detail?.user.id === item.id ? 'row-button selected' : 'row-button'}
              key={item.id}
              onClick={() => api<typeof detail>(`/api/admin/staff/${item.id}/permissions`).then(setDetail)}
            >
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
  const [active, setActive] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [content, setContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<Conversation[]>('/api/admin/chat/conversations').then(rows => {
      setConversations(rows)
      if (rows[0] && !active) setActive(rows[0])
    })
  }, [])

  useEffect(() => {
    if (!active) return
    api<ChatMessage[]>(`/api/chat/conversations/${active.id}/messages`).then(setMessages)
  }, [active?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    if (!active || !content.trim()) return
    const message = await api<ChatMessage>(`/api/chat/conversations/${active.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ senderId: auth.user?.id, senderType: auth.user?.role ?? 'Staff', content, attachmentUrl: null }),
    })
    setMessages(prev => [...prev, message])
    setContent('')
  }

  return (
    <AdminLayout>
      <SectionTitle icon={<MessageCircle />} title="Hộp thư tư vấn" />
      <div className="admin-chat-inbox">
        <aside className="inbox-list">
          {!conversations && <Loader.Skeleton rows={4} />}
          {conversations?.map(c => (
            <button key={c.id} type="button"
              className={`inbox-item ${active?.id === c.id ? 'active' : ''}`}
              onClick={() => setActive(c)}>
              <strong>{c.subject || 'Hội thoại'}</strong>
              <span className={`status-badge ${c.status?.toLowerCase()}`} style={{ fontSize: 11 }}>{c.status}</span>
            </button>
          ))}
          {conversations?.length === 0 && <p style={{ padding: 16, color: 'var(--ink-500)', fontSize: 13 }}>Chưa có hội thoại nào.</p>}
        </aside>
        <div className="inbox-chat">
          {!active ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-400)' }}>
              Chọn hội thoại để bắt đầu
            </div>
          ) : (
            <>
              <div className="inbox-chat-header">
                <strong>{active.subject || 'Hội thoại'}</strong>
                <span className={`status-badge ${active.status?.toLowerCase()}`}>{active.status}</span>
              </div>
              <div className="messages inbox-messages">
                {messages.map(m => (
                  <p key={m.id} className={m.senderType === 'Staff' || m.senderType === 'Administrator' ? 'msg-staff' : 'msg-customer'}>
                    <strong>{m.senderType}:</strong> {m.content}
                  </p>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="toolbar">
                <input value={content} onChange={e => setContent(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder="Nhập phản hồi..." />
                <button type="button" className="button compact" onClick={send}>Gửi</button>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

const ORDER_STATUSES = ['All', 'Pending', 'Confirmed', 'Packing', 'Shipping', 'Delivered', 'Cancelled']
const ORDER_TRANSITIONS: Record<string, string[]> = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Packing', 'Cancelled'],
  Packing: ['Shipping'],
  Shipping: ['Delivered'],
}

type AdminOrder = Order & { userId?: string; guestInfo?: { fullName: string; email: string; phoneNumber: string }; note?: string }

function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>()
  const [filter, setFilter] = useState('All')
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminOrder | null>(null)

  async function reload() {
    const data = await api<AdminOrder[]>('/api/admin/orders')
    setOrders(data)
  }

  useEffect(() => { reload() }, [])

  async function changeStatus(orderId: string, newStatus: string) {
    setBusy(orderId)
    try {
      await api(`/api/admin/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
      await reload()
      if (selected?.id === orderId) setSelected(s => s ? { ...s, orderStatus: newStatus } : s)
    } finally {
      setBusy(null)
    }
  }

  const visible = orders?.filter(o => filter === 'All' || o.orderStatus === filter) ?? []

  return (
    <AdminLayout>
      <SectionTitle icon={<ListOrdered />} title="Quản lý đơn hàng" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {ORDER_STATUSES.map(s => (
          <button key={s} type="button" className={`button compact ${filter === s ? '' : 'ghost'}`} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>
      {!orders ? <Loader.Page /> : (
        <div className="list">
          {visible.length === 0 && <p style={{ color: 'var(--ink-500)', padding: 16 }}>Không có đơn hàng nào.</p>}
          {visible.map(o => (
            <article key={o.id} className="card" style={{ padding: '14px 18px', cursor: 'pointer', borderLeft: `4px solid var(--ink-${o.orderStatus === 'Delivered' ? '900' : o.orderStatus === 'Cancelled' ? '400' : '600'})` }} onClick={() => setSelected(o)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>#{o.orderCode}</strong>
                  {(o.guestInfo?.fullName) && <span style={{ marginLeft: 10, color: 'var(--ink-500)', fontSize: 13 }}>{o.guestInfo.fullName}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`status-badge ${o.orderStatus?.toLowerCase()}`}>{o.orderStatus}</span>
                  <span className={`status-badge ${o.paymentStatus?.toLowerCase()}`}>{o.paymentStatus}</span>
                  <strong className="amount">{formatMoney(o.total)}</strong>
                  <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>{o.paymentMethod}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {(ORDER_TRANSITIONS[o.orderStatus] ?? []).map(next => (
                  <button key={next} type="button" className="button compact secondary" disabled={busy === o.id}
                    onClick={e => { e.stopPropagation(); changeStatus(o.id, next) }}>
                    {busy === o.id ? <Loader.Inline size={14} /> : next}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>Đơn #{selected.orderCode}</h3>
              <button type="button" className="button ghost icon" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>
            <p><strong>Trạng thái:</strong> <span className={`status-badge ${selected.orderStatus?.toLowerCase()}`}>{selected.orderStatus}</span></p>
            <p><strong>Thanh toán:</strong> <span className={`status-badge ${selected.paymentStatus?.toLowerCase()}`}>{selected.paymentStatus}</span> — {selected.paymentMethod}</p>
            <p><strong>Giao hàng:</strong> {selected.shippingMethod} — {selected.shippingAddress}</p>
            {selected.note && <p><strong>Ghi chú:</strong> {selected.note}</p>}
            <hr style={{ margin: '12px 0', borderColor: 'var(--ink-200)' }} />
            <h4 style={{ marginBottom: 8 }}>Sản phẩm</h4>
            {selected.items?.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                <span>{item.productName} ({item.color}/{item.size}) × {item.quantity}</span>
                <span>{formatMoney(item.lineTotal)}</span>
              </div>
            ))}
            <div style={{ textAlign: 'right', marginTop: 8 }}><strong className="amount">{formatMoney(selected.total)}</strong></div>
            {selected.history?.length > 0 && (
              <>
                <hr style={{ margin: '12px 0', borderColor: 'var(--ink-200)' }} />
                <h4 style={{ marginBottom: 8 }}>Lịch sử</h4>
                {selected.history.map((h, i) => (
                  <p key={i} style={{ fontSize: 13, color: 'var(--ink-700)', marginBottom: 4 }}>
                    {h.fromStatus} → <strong>{h.toStatus}</strong> · {h.changedBy} · {new Date(h.changedAt).toLocaleString('vi-VN')}
                    {h.note && <em> — {h.note}</em>}
                  </p>
                ))}
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {(ORDER_TRANSITIONS[selected.orderStatus] ?? []).map(next => (
                <button key={next} type="button" className="button compact" disabled={busy === selected.id}
                  onClick={() => changeStatus(selected.id, next)}>
                  {busy === selected.id ? <Loader.Inline size={14} /> : `→ ${next}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

type MembershipCustomer = { id: string; fullName: string; email: string; membershipTier: string; totalSpent: number; createdAt: string }

function AdminMembership() {
  const [customers, setCustomers] = useState<MembershipCustomer[]>()
  const [recalcBusy, setRecalcBusy] = useState(false)
  const [toast, setToast] = useState('')

  async function reload() {
    const data = await api<MembershipCustomer[]>('/api/admin/membership/customers')
    setCustomers(data)
  }

  useEffect(() => { reload() }, [])

  async function recalculate() {
    setRecalcBusy(true)
    try {
      await api('/api/admin/membership/recalculate', { method: 'POST' })
      await reload()
      setToast('Đã cập nhật hạng thành viên thành công.')
      setTimeout(() => setToast(''), 3000)
    } finally {
      setRecalcBusy(false)
    }
  }

  const TIER_ORDER: Record<string, number> = { Diamond: 4, Gold: 3, Silver: 2, Bronze: 1 }

  return (
    <AdminLayout>
      <SectionTitle icon={<Crown />} title="Hạng thành viên" />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <button type="button" className="button compact" disabled={recalcBusy} onClick={recalculate}>
          {recalcBusy ? <Loader.Inline size={14} /> : 'Tính lại hạng'}
        </button>
        <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Bronze &lt; 2M · Silver 2M–10M · Gold 10M–30M · Diamond ≥ 30M</span>
        {toast && <span style={{ color: 'var(--ink-700)', fontSize: 13 }}>✓ {toast}</span>}
      </div>
      {!customers ? <Loader.Page /> : (
        <div className="list">
          {customers.sort((a, b) => (TIER_ORDER[b.membershipTier] ?? 0) - (TIER_ORDER[a.membershipTier] ?? 0)).map(c => (
            <article key={c.id} className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <strong>{c.fullName || '(Chưa đặt tên)'}</strong>
                <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>{c.email}</div>
              </div>
              <span className={`status-badge tier-${c.membershipTier?.toLowerCase()}`}>{c.membershipTier}</span>
              <strong className="amount">{formatMoney(c.totalSpent)}</strong>
              <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{new Date(c.createdAt).toLocaleDateString('vi-VN')}</span>
            </article>
          ))}
        </div>
      )}
    </AdminLayout>
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
    const query = auth.user ? `?userId=${auth.user.id}` : `?guestToken=${guestToken}`
    api<Conversation[]>(`/api/chat/conversations${query}`).then((rows) => {
      if (rows[0]) {
        setConversation(rows[0])
        api<ChatMessage[]>(`/api/chat/conversations/${rows[0].id}/messages`).then(setMessages)
      }
    })
  }, [auth.user])

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
    ['/admin/orders', 'Đơn hàng'],
    ['/admin/membership', 'Thành viên'],
    ['/admin/vouchers', 'Voucher'],
    ['/admin/staff', 'Staff'],
    ['/admin/chat', 'Chat'],
    ['/admin/_health', 'Health'],
  ]
  return (
    <section className="admin-layout">
      <aside>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => isActive ? 'active' : ''}>
            {label}
          </NavLink>
        ))}
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

<#
.SYNOPSIS
  Crawl fashion images + metadata, then import into Michi DB via the real admin API.

.DESCRIPTION
  Implements doc/CRAWL_DATA_PLAN.md. For each requested product:
    1. Picks a random Vietnamese name template + category + tags.
    2. Downloads a curated photo based on generated query into a temp file.
    3. Reviews image and supplements metadata using Gemini AI.
    4. POST /api/admin/upload/image  -> backend writes to assets/uploads/products/.
    5. POST /api/admin/products      -> persists Product + Variants in DB.
  Pre-flight checks: dotnet SDK, curl.exe, BE listening on :5000, assets folder
  ready, admin login works.

.PARAMETER Count
  Number of products to create (default 30).

.PARAMETER ApiBase
  Backend base URL (default http://localhost:5000).

.PARAMETER AdminEmail / AdminPassword
  Admin credentials used to obtain JWT (defaults match seed).

.PARAMETER DryRun
  Run env checks + show planned products, do NOT call mutating APIs.

.PARAMETER Verbose
  Print every API call (uses Write-Verbose under -Verbose preference).

.PARAMETER GeminiApiKey
  API Key for Gemini. Defaults to $env:GEMINI_API_KEY.

.PARAMETER SkipAi
  Skip AI verification and metadata generation.
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)] [int]    $Count          = 30,
  [string] $ApiBase        = 'http://localhost:5000',
  [string] $AdminEmail     = 'admin@miichin.local',
  [string] $AdminPassword  = 'Admin@123',
  [string] $GeminiApiKey   = $env:GEMINI_API_KEY,
  [switch] $DryRun,
  [switch] $SkipAi
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Step([string]$msg) { Write-Host "==> " -NoNewline -ForegroundColor Cyan; Write-Host $msg }
function OK   ([string]$msg) { Write-Host "  OK   " -NoNewline -ForegroundColor Green; Write-Host $msg }
function Warn ([string]$msg) { Write-Host "  WARN " -NoNewline -ForegroundColor Yellow; Write-Host $msg }
function Fail ([string]$msg) { Write-Host "  FAIL " -NoNewline -ForegroundColor Red;    Write-Host $msg; exit 1 }
function Info ([string]$msg) { Write-Host "       $msg" -ForegroundColor DarkGray }

function LogStage([string]$stage, [string]$msg, [ConsoleColor]$color = 'Gray') {
  Write-Host ("[{0}] " -f $stage) -NoNewline -ForegroundColor Cyan
  Write-Host $msg -ForegroundColor $color
}

# ============================================================
# 0) ENVIRONMENT CHECKS
# ============================================================
LogStage "PRECHECK" "Kiểm tra môi trường"

# .NET SDK
try { $sdk = (& dotnet --version 2>$null).Trim() } catch { $sdk = $null }
if (-not $sdk) { Fail ".NET SDK not found in PATH. Install .NET 8+ then re-run." }
OK ".NET SDK $sdk"

# curl
$curl = (Get-Command curl.exe -ErrorAction SilentlyContinue)
if (-not $curl) { Fail "curl.exe not found. Windows 10/11 ships it under System32 — check PATH." }
OK "curl.exe at $($curl.Source)"

# Assets folder
$assetsRoot = (Get-Item (Join-Path $root '..')).FullName
$assetsRoot = Join-Path $assetsRoot 'assets'
$uploads    = Join-Path $assetsRoot 'uploads/products'
foreach ($d in @($assetsRoot, $uploads, (Join-Path $assetsRoot 'seed/products'))) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null; Info "created $d" }
}
$probe = Join-Path $uploads ".__write_probe"
try { 'ok' | Set-Content -Path $probe -ErrorAction Stop; Remove-Item $probe -Force }
catch { Fail "assets/uploads/products is not writable: $($_.Exception.Message)" }
OK "assets folder writable: $assetsRoot"

# BE listening
function Test-Be {
  param([string]$Url)
  try {
    $code = & curl.exe -s -o NUL -w '%{http_code}' --max-time 4 "$Url/api/catalog/categories"
    return ($code -eq '200')
  } catch { return $false }
}
if (-not (Test-Be -Url $ApiBase)) {
  Warn "Backend not responding at $ApiBase/api/catalog/categories"
  Info "Start it via RunAll.bat (or: cd backend; dotnet run --urls=$ApiBase) then re-run this."
  if (-not $DryRun) { Fail "Aborting because backend is offline." }
} else {
  OK "Backend responds at $ApiBase"
}

# ============================================================
# 1) AUTHENTICATE AS ADMIN
# ============================================================
LogStage "AUTH" "Đăng nhập admin ($AdminEmail)"
$tmp = New-Item -ItemType Directory -Force -Path (Join-Path $env:TEMP "michi-crawl-$([guid]::NewGuid().ToString('N'))")
$loginBodyFile = Join-Path $tmp 'login.json'
@"
{ "email": "$AdminEmail", "password": "$AdminPassword" }
"@ | Set-Content -Path $loginBodyFile -Encoding UTF8

$token = $null
if (-not $DryRun) {
  $loginResp = & curl.exe -s -X POST "$ApiBase/api/auth/login" -H "Content-Type: application/json" --data-binary "@$loginBodyFile"
  if (-not $loginResp) { Fail "Login returned empty response — admin user not seeded?" }
  try { $auth = $loginResp | ConvertFrom-Json } catch { Fail "Login response not JSON: $loginResp" }
  if (-not $auth.accessToken) { Fail "Login failed: $loginResp" }
  $token = $auth.accessToken
  OK "Token acquired (role=$($auth.user.role))"
} else {
  OK "DryRun: skipping real login"
}

# ============================================================
# 2) FETCH CATEGORIES (or fall back to blueprint keys for DryRun)
# ============================================================
LogStage "CATEGORY" "Tải danh mục"
$cats = $null
if (-not $DryRun) {
  $catsRaw = & curl.exe -s "$ApiBase/api/catalog/categories"
  try { $cats = $catsRaw | ConvertFrom-Json } catch {}
  if (-not $cats -or $cats.Count -lt 1) { Fail "No categories returned. Did the seed run?" }
} else {
  # DryRun fallback: synthesize the 8 default categories matching the seed.
  $cats = @(
    [pscustomobject]@{ id = 1; name = 'Áo';        slug = 'ao' },
    [pscustomobject]@{ id = 2; name = 'Quần';      slug = 'quan' },
    [pscustomobject]@{ id = 3; name = 'Áo khoác';  slug = 'ao-khoac' },
    [pscustomobject]@{ id = 4; name = 'Phụ kiện';  slug = 'phu-kien' },
    [pscustomobject]@{ id = 5; name = 'Váy';       slug = 'vay' },
    [pscustomobject]@{ id = 6; name = 'Đầm';       slug = 'dam' },
    [pscustomobject]@{ id = 7; name = 'Giày';      slug = 'giay' },
    [pscustomobject]@{ id = 8; name = 'Túi';       slug = 'tui' }
  )
}
OK "Đã tải $($cats.Count) danh mục"
$cats | ForEach-Object { Info ("[{0}] {1}  ({2})" -f $_.id, $_.name, $_.slug) }

# Map categoryId -> { keywords, namePattern }
$blueprint = @{
  1 = @{
    Name      = 'Áo'
    Templates = @('Áo thun {0} {1}', 'Áo sơ mi {0} {1}', 'Áo polo {0}', 'Áo croptop {0}', 'Áo hoodie {0}', 'Áo blouse {0}', 'Áo sweater {0}')
    Materials = @('cotton', 'linen', 'modal', 'pique', 'lụa pha')
    Colors    = @('Trắng', 'Đen', 'Kem', 'Xám', 'Navy', 'Be', 'Hồng phấn', 'Olive')
    Sizes     = @('S', 'M', 'L', 'XL')
    Tags      = @('daily', 'minimal', 'office', 'street', 'soft')
  }
  2 = @{
    Name      = 'Quần'
    Templates = @('Quần jeans {0}', 'Quần kaki {0}', 'Quần jogger {0}', 'Quần cargo {0}', 'Quần short {0}', 'Quần tây {0}')
    Materials = @('denim', 'kaki cotton', 'fleece', 'canvas', 'linen blend')
    Colors    = @('Xanh denim', 'Đen', 'Be', 'Xám', 'Olive')
    Sizes     = @('M', 'L', 'XL')
    Tags      = @('denim', 'street', 'casual', 'comfort')
  }
  3 = @{
    Name      = 'Áo khoác'
    Templates = @('Áo khoác {0} {1}', 'Áo blazer {0}', 'Áo cardigan {0}', 'Áo bomber {0}')
    Materials = @('linen', 'denim', 'nylon', 'wool blend', 'rayon')
    Colors    = @('Đen', 'Be', 'Ghi', 'Olive', 'Navy')
    Sizes     = @('M', 'L', 'XL')
    Tags      = @('outerwear', 'layering', 'office')
  }
  4 = @{
    Name      = 'Phụ kiện'
    Templates = @('Nón cap {0}', 'Thắt lưng {0}', 'Khăn lụa {0}', 'Vớ rib {0}', 'Mũ len {0}')
    Materials = @('cotton twill', 'da', 'lụa poly', 'cotton blend')
    Colors    = @('Đen', 'Be', 'Nâu', 'Trắng')
    Sizes     = @('FreeSize')
    Tags      = @('accessory', 'classic', 'soft')
  }
  5 = @{
    Name      = 'Váy'
    Templates = @('Chân váy {0} {1}', 'Chân váy midi {0}', 'Chân váy chữ A {0}')
    Materials = @('denim', 'poly chiffon', 'tweed', 'satin')
    Colors    = @('Đen', 'Kem', 'Xanh denim', 'Nâu')
    Sizes     = @('S', 'M', 'L')
    Tags      = @('skirt', 'feminine', 'office')
  }
  6 = @{
    Name      = 'Đầm'
    Templates = @('Đầm suông {0}', 'Đầm sơ mi {0}', 'Đầm hai dây {0}', 'Đầm midi {0}')
    Materials = @('cotton', 'satin', 'cotton poplin', 'voan')
    Colors    = @('Đen', 'Trắng', 'Champagne', 'Xanh navy')
    Sizes     = @('S', 'M', 'L')
    Tags      = @('dress', 'feminine', 'party')
  }
  7 = @{
    Name      = 'Giày'
    Templates = @('Giày sneaker {0}', 'Giày loafer {0}', 'Dép quai ngang {0}')
    Materials = @('da tổng hợp', 'EVA', 'canvas')
    Colors    = @('Trắng', 'Đen', 'Nâu', 'Kem')
    Sizes     = @('38', '39', '40', '41', '42')
    Tags      = @('sneaker', 'minimal', 'classic')
  }
  8 = @{
    Name      = 'Túi'
    Templates = @('Túi tote {0}', 'Túi đeo chéo {0}', 'Túi bucket {0}')
    Materials = @('canvas', 'da tổng hợp', 'nylon')
    Colors    = @('Trắng ngà', 'Đen', 'Be')
    Sizes     = @('FreeSize')
    Tags      = @('bag', 'accessory', 'daily')
  }
}

$colorSearchMap = @{
  'Trắng' = 'white'
  'Trắng ngà' = 'ivory'
  'Đen' = 'black'
  'Kem' = 'cream'
  'Be' = 'beige'
  'Xám' = 'gray'
  'Ghi' = 'gray'
  'Navy' = 'navy'
  'Xanh navy' = 'navy'
  'Xanh denim' = 'blue denim'
  'Xanh nhạt' = 'light blue'
  'Xanh rêu' = 'olive green'
  'Olive' = 'olive green'
  'Nâu' = 'brown'
  'Nâu nhạt' = 'light brown'
  'Hồng phấn' = 'pastel pink'
  'Champagne' = 'champagne'
}

$categorySearchMap = @{
  1 = 'fashion shirt top clothing'
  2 = 'fashion pants trousers clothing'
  3 = 'fashion jacket outerwear clothing'
  4 = 'fashion accessory product'
  5 = 'fashion skirt clothing'
  6 = 'fashion dress clothing'
  7 = 'fashion shoes footwear'
  8 = 'fashion bag handbag tote'
}

# Validate that every category seen on BE has a blueprint entry; allow extras silently.
foreach ($c in $cats) {
  if (-not $blueprint.ContainsKey([int]$c.id)) {
    Warn "No blueprint for category id=$($c.id) ($($c.name)) — skipping"
  }
}

# ============================================================
# 3) HELPERS
# ============================================================
function Slugify([string]$s) {
  $s = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $s.ToCharArray()) {
    $cat = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
    if ($cat -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($ch) }
  }
  $t = $sb.ToString().ToLowerInvariant() -replace 'đ','d' -replace '[^a-z0-9\s-]','' -replace '\s+','-' -replace '-+','-'
  return $t.Trim('-')
}
function Pick($arr) { return $arr | Get-Random }
function PickN($arr, [int]$n) { return $arr | Get-Random -Count ([Math]::Min($n, $arr.Count)) }

function Build-ImageQuery($draft) {
  $colorEn = $colorSearchMap[$draft.color]
  if (-not $colorEn) { $colorEn = $draft.color }

  $categoryText = $categorySearchMap[[int]$draft.categoryId]
  if (-not $categoryText) { $categoryText = 'fashion clothing product' }

  return "$colorEn $($draft.material) $categoryText studio product photo"
}

function Build-ProductDraft([int]$idx) {
  $cat   = ($cats | Where-Object { $blueprint.ContainsKey([int]$_.id) } | Get-Random)
  $bp    = $blueprint[[int]$cat.id]
  $tmpl  = Pick $bp.Templates
  $mat   = Pick $bp.Materials
  $selectedColor = Pick $bp.Colors
  $name  = ($tmpl -f $selectedColor.ToLower(), $mat) + " MiiChin"
  # Make slug unique with idx + timestamp suffix to avoid PK conflicts in repeat runs.
  $slug  = "$(Slugify $name)-$(Get-Date -Format 'HHmmss')$idx"
  $price = (Get-Random -Minimum 19 -Maximum 99) * 10000   # 190.000 — 990.000 VND
  
  $sizes = PickN $bp.Sizes ([Math]::Min(3, $bp.Sizes.Count))
  $skuBase = (Slugify $name).Substring(0, [Math]::Min(8, (Slugify $name).Length)).ToUpper()
  $skuSuffix = (Get-Date -Format 'HHmmss') + ([System.IO.Path]::GetRandomFileName().Replace('.','').Substring(0,3)).ToUpper()
  $variants = @()
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $variants += @{
      sku      = ('MC-{0}-{1}-{2}' -f $skuBase, $sizes[$i], $skuSuffix)
      color    = $selectedColor
      size     = $sizes[$i]
      price    = $price
      stockQty = 8 + (Get-Random -Maximum 25)
    }
  }

  $draft = @{
    name         = $name
    slug         = $slug
    description  = "$($bp.Name) màu $selectedColor, chất liệu $mat, phù hợp phối đồ hằng ngày."
    categoryId   = [int]$cat.id
    categoryName = $cat.name
    brand        = 'MiiChin'
    material     = $mat
    gender       = (Pick @('Unisex', 'Nam', 'Nữ'))
    color        = $selectedColor
    basePrice    = $price
    tags         = (PickN $bp.Tags 3)
    variants     = $variants
  }
  
  $draft.imageQuery = Build-ImageQuery $draft
  return $draft
}

function Build-FashionPrompt($draft) {
  # Build a precise, photorealistic fashion product prompt
  $colorEn = $colorSearchMap[$draft.color]
  if (-not $colorEn) { $colorEn = $draft.color }

  $catMap = @{
    1 = 'fashion shirt'; 2 = 'fashion pants'; 3 = 'fashion jacket'
    4 = 'fashion accessory'; 5 = 'fashion midi skirt'; 6 = 'fashion dress'
    7 = 'fashion shoes sneakers'; 8 = 'fashion handbag tote bag'
  }
  $catText = $catMap[[int]$draft.categoryId]
  if (-not $catText) { $catText = 'fashion clothing' }

  $prompt = "$colorEn $($draft.material) $catText, product photography, white background, studio lighting, clean minimalist, no model, high quality, fashion e-commerce"
  return $prompt
}

function Download-PhotoByQuery([string]$query, [string]$destFile, $draft = $null) {
  # Build a precise fashion prompt if draft is provided
  $fashionPrompt = if ($draft) { Build-FashionPrompt $draft } else { $query }
  $encPrompt = [uri]::EscapeDataString($fashionPrompt)

  # Source 1: Pollinations.ai with precise fashion prompt
  $seed = Get-Random -Minimum 100 -Maximum 999999
  $url1 = "https://image.pollinations.ai/prompt/$encPrompt`?width=800&height=1000&nologo=true&seed=$seed&model=flux"
  
  Info "  Prompt: $fashionPrompt"
  $code = & curl.exe -s -L -o "$destFile" -w '%{http_code}' --max-time 60 "$url1"
  if ($LASTEXITCODE -eq 0 -and $code -eq '200' -and (Test-Path $destFile)) {
    $sz = (Get-Item $destFile).Length
    if ($sz -gt 5120) { return $true }
    else { Remove-Item $destFile -Force -ErrorAction SilentlyContinue }
  }

  # Source 2: Picsum with deterministic product-like seed (fallback)
  $picId = Get-Random -Minimum 100 -Maximum 1000
  $url2 = "https://picsum.photos/seed/michi-$($draft.categoryId)-$picId/800/1000.jpg"
  $code2 = & curl.exe -s -L -o "$destFile" -w '%{http_code}' --max-time 20 "$url2"
  if ($LASTEXITCODE -eq 0 -and $code2 -eq '200' -and (Test-Path $destFile)) {
    $sz = (Get-Item $destFile).Length
    if ($sz -gt 5120) { return $true }
    Remove-Item $destFile -Force -ErrorAction SilentlyContinue
  }

  return $false
}

function Invoke-GeminiProductReview {
  param($ImageFile, $Draft, $CategoryName)

  if ($SkipAi -or -not $GeminiApiKey) {
    return @{
      valid = $true
      confidence = 1.0
      detectedCategory = $CategoryName
      detectedColor = $Draft.color
      title = $Draft.name
      material = $Draft.material
      description = $Draft.description
      tags = $Draft.tags
      reason = 'Skipped AI validation (No Key or SkipAi flag)'
    }
  }

  $bytes = [System.IO.File]::ReadAllBytes($ImageFile)
  $base64 = [Convert]::ToBase64String($bytes)

  $prompt = @"
Bạn là trợ lý kiểm duyệt dữ liệu sản phẩm thời trang cho shop MiiChin.

Draft:
- Tên dự kiến: $($Draft.name)
- Danh mục: $CategoryName
- Màu mong muốn: $($Draft.color)
- Chất liệu dự kiến: $($Draft.material)
- Giới tính: $($Draft.gender)

Yêu cầu:
1. Xác định ảnh có phải sản phẩm thời trang đúng danh mục không.
2. Xác định màu chính trong ảnh có tương đồng với màu mong muốn không.
3. Nếu hợp lệ, viết lại title tiếng Việt tự nhiên, có màu, chất liệu hoặc kiểu dáng, có tên hãng MiiChin.
4. Viết mô tả tiếng Việt 1-2 câu, phù hợp bán hàng.
5. Trả về JSON thuần theo schema:
{
  "valid": true,
  "confidence": 0.0,
  "detectedCategory": "",
  "detectedColor": "",
  "title": "",
  "material": "",
  "description": "",
  "tags": [],
  "reason": ""
}

Nếu ảnh không khớp, đặt valid=false và nêu reason ngắn gọn.
Không trả markdown. Không bọc JSON trong code block.
"@

  $body = @{
    contents = @(
      @{
        parts = @(
          @{ text = $prompt },
          @{
            inlineData = @{
              mimeType = "image/jpeg"
              data = $base64
            }
          }
        )
      }
    )
  } | ConvertTo-Json -Depth 10

  $bodyFile = Join-Path $tmp ("gemini-{0}.json" -f ([guid]::NewGuid().ToString('N')))
  Set-Content -Path $bodyFile -Value $body -Encoding UTF8

  $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
  $resp = & curl.exe -s -X POST $url `
    -H "Content-Type: application/json" `
    -H "x-goog-api-key: $GeminiApiKey" `
    --data-binary "@$bodyFile"

  if (-not $resp) {
    throw "Gemini trả về response rỗng."
  }

  $json = $resp | ConvertFrom-Json
  if (-not $json.candidates -or $json.candidates.Count -eq 0) {
    throw "Gemini API error: $resp"
  }
  
  $text = $json.candidates[0].content.parts[0].text
  if (-not $text) {
    throw "Gemini không trả về text hợp lệ: $resp"
  }

  $clean = $text.Trim()
  $clean = $clean -replace '^```(?:json)?\s*', ''
  $clean = $clean -replace '\s*```$', ''

  try {
    return ($clean | ConvertFrom-Json)
  } catch {
    throw "Lỗi parse JSON từ Gemini: $clean"
  }
}

function Upload-Image([string]$file) {
  $resp = & curl.exe -s -X POST "$ApiBase/api/admin/upload/image?folder=products" `
    -H "Authorization: Bearer $token" -F "file=@$file"
  try { return ($resp | ConvertFrom-Json) } catch { return $null }
}

function Assert-ProductDraftComplete {
  param($Draft, [string]$ImageUrl)

  $missing = @()

  if ([string]::IsNullOrWhiteSpace($Draft.name)) { $missing += 'name' }
  if ([string]::IsNullOrWhiteSpace($Draft.description)) { $missing += 'description' }
  if (-not $Draft.categoryId) { $missing += 'categoryId' }
  if ([string]::IsNullOrWhiteSpace($Draft.brand)) { $missing += 'brand' }
  if ([string]::IsNullOrWhiteSpace($Draft.material)) { $missing += 'material' }
  if ([string]::IsNullOrWhiteSpace($Draft.gender)) { $missing += 'gender' }
  if (-not $Draft.basePrice -or $Draft.basePrice -le 0) { $missing += 'basePrice' }
  if ([string]::IsNullOrWhiteSpace($ImageUrl)) { $missing += 'imageUrl' }
  if (-not $Draft.tags -or $Draft.tags.Count -lt 1) { $missing += 'tags' }
  if (-not $Draft.variants -or $Draft.variants.Count -lt 1) { $missing += 'variants' }

  foreach ($v in $Draft.variants) {
    if ([string]::IsNullOrWhiteSpace($v.sku)) { $missing += 'variant.sku' }
    if ([string]::IsNullOrWhiteSpace($v.color)) { $missing += 'variant.color' }
    if ([string]::IsNullOrWhiteSpace($v.size)) { $missing += 'variant.size' }
    if (-not $v.price -or $v.price -le 0) { $missing += 'variant.price' }
    if ($null -eq $v.stockQty -or $v.stockQty -lt 0) { $missing += 'variant.stockQty' }
  }

  if ($missing.Count -gt 0) {
    throw "Draft thiếu dữ liệu bắt buộc: $($missing -join ', ')"
  }
}

function Create-Product($draft, [string]$imageUrl) {
  Assert-ProductDraftComplete -Draft $draft -ImageUrl $imageUrl

  $body = @{
    name        = $draft.name
    description = $draft.description
    categoryId  = $draft.categoryId
    brand       = $draft.brand
    material    = $draft.material
    gender      = $draft.gender
    basePrice   = $draft.basePrice
    imageUrl    = $imageUrl
    tags        = $draft.tags
    variants    = $draft.variants
  } | ConvertTo-Json -Depth 6 -Compress

  $bodyFile = Join-Path $tmp ("create-{0}.json" -f $draft.slug)
  Set-Content -Path $bodyFile -Value $body -Encoding UTF8

  $resp = & curl.exe -s -X POST "$ApiBase/api/admin/products" `
    -H "Authorization: Bearer $token" -H "Content-Type: application/json; charset=utf-8" `
    --data-binary "@$bodyFile"

  try { 
    $res = $resp | ConvertFrom-Json 
    if (-not $res.id) {
      Warn "API tạo sản phẩm thất bại."
      Info "Response: $resp"
    }
    return $res
  } catch {
    Warn "API tạo sản phẩm thất bại."
    Info "Response: $resp"
    return $null
  }
}

# ============================================================
# 4) GENERATE + IMPORT LOOP
# ============================================================
LogStage "SUMMARY" "Bắt đầu crawl $Count sản phẩm"
$success = 0; $fail = 0;
$results = @()

for ($i = 1; $i -le $Count; $i++) {
  $draft = Build-ProductDraft $i
  LogStage "DRAFT" ("{0:D3}/{1:D3} {2}" -f $i, $Count, $draft.name)

  if ($DryRun) { $results += $draft; continue }

  $imgFile = Join-Path $tmp ("photo-$($draft.slug).jpg")
  $maxAttempts = 2
  $createdThisProduct = $false

  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    LogStage "IMAGE" ("Tạo ảnh lần {0}/{1}" -f $attempt, $maxAttempts)

    $downloadOk = Download-PhotoByQuery -query $draft.imageQuery -destFile $imgFile -draft $draft
    if (-not $downloadOk) {
      Warn "Tải ảnh thất bại lần $attempt."
      if ($attempt -lt $maxAttempts) { continue }
      $fail++
      Warn "Bỏ qua sản phẩm $($draft.name): Không tải được ảnh."
      break
    }

    LogStage "AI" "Đang kiểm tra ảnh với Gemini" "Yellow"
    try {
      $ai = Invoke-GeminiProductReview -ImageFile $imgFile -Draft $draft -CategoryName $draft.categoryName
    } catch {
      Warn "Lỗi gọi AI: $_"
      $ai = @{
        valid = $true; confidence = 0.8
        detectedCategory = $draft.categoryName; detectedColor = $draft.color
        title = $draft.name; material = $draft.material
        description = $draft.description; tags = $draft.tags; reason = 'AI error, using draft values'
      }
    }

    if (-not $ai.valid) {
      Warn "AI loại ảnh: $($ai.reason)"
      if ($attempt -lt $maxAttempts) { continue }
      $fail++
      Warn "Bỏ qua sản phẩm $($draft.name): Ảnh không hợp lệ."
      break
    }

    LogStage "AI" "Hợp lệ: màu $($ai.detectedColor), danh mục $($ai.detectedCategory), confidence $($ai.confidence)" "Green"

    if ($ai.title) { $draft.name = $ai.title }
    if ($ai.description) { $draft.description = $ai.description }
    if ($ai.material) { $draft.material = $ai.material }
    if ($ai.tags -and $ai.tags.Count -gt 0) { $draft.tags = $ai.tags }

    $up = Upload-Image $imgFile
    if (-not $up -or -not $up.url) {
      Warn "Upload ảnh thất bại lần $attempt."
      if ($attempt -lt $maxAttempts) { continue }
      $fail++
      Warn "Bỏ qua sản phẩm $($draft.name): Upload thất bại."
      break
    }

    LogStage "UPLOAD" "Upload ảnh thành công: $($up.url)" "Green"

    try {
      $created = Create-Product $draft $up.url
      if ($created -and $created.id) {
        $success++
        $createdThisProduct = $true
        LogStage "IMPORT" "Tạo sản phẩm thành công: id=$($created.id) - $($created.name)" "Green"
        break
      } else {
        Warn "API trả về không có id, thử lại."
      }
    } catch {
      Warn "Lỗi trong quá trình tạo sản phẩm: $_"
    }
  }

  if (-not $createdThisProduct -and $fail -eq 0) {
    $fail++
    Warn "Bỏ qua sản phẩm sau $maxAttempts lần thử."
  }
}

# Cleanup temp files
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

# ============================================================
# 5) SUMMARY
# ============================================================
Write-Host ""
LogStage "SUMMARY" "Hoàn tất"
if ($DryRun) {
  OK "DryRun complete. $($results.Count) drafts generated. No API calls made."
} else {
  OK "Thành công: $success / $Count"
  if ($fail -gt 0) { Warn "Thất bại: $fail" }

  $total = & curl.exe -s "$ApiBase/api/catalog/products" | ConvertFrom-Json
  LogStage "SUMMARY" ("DB total products now: {0}" -f $total.Count) "Green"
}

Write-Host ""
Write-Host "Done." -ForegroundColor Cyan


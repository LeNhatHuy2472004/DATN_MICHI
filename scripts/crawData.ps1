<#
.SYNOPSIS
  Crawl fashion images + metadata, then import into Michi DB via the real admin API.

.DESCRIPTION
  Implements doc/CRAWL_DATA_PLAN.md. For each requested product:
    1. Picks a random Vietnamese name template + category + tags.
    2. Downloads a curated Unsplash photo (matched to category) into a temp file.
    3. POST /api/admin/upload/image  -> backend writes to assets/uploads/products/.
    4. POST /api/admin/products      -> persists Product + Variants in DB.
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
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)] [int]    $Count          = 30,
  [string] $ApiBase        = 'http://localhost:5000',
  [string] $AdminEmail     = 'admin@michi.local',
  [string] $AdminPassword  = 'Admin@123',
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Step([string]$msg) { Write-Host "==> " -NoNewline -ForegroundColor Cyan; Write-Host $msg }
function OK   ([string]$msg) { Write-Host "  OK   " -NoNewline -ForegroundColor Green; Write-Host $msg }
function Warn ([string]$msg) { Write-Host "  WARN " -NoNewline -ForegroundColor Yellow; Write-Host $msg }
function Fail ([string]$msg) { Write-Host "  FAIL " -NoNewline -ForegroundColor Red;    Write-Host $msg; exit 1 }
function Info ([string]$msg) { Write-Host "       $msg" -ForegroundColor DarkGray }

# ============================================================
# 0) ENVIRONMENT CHECKS
# ============================================================
Step "Pre-flight checks"

# .NET SDK
try { $sdk = (& dotnet --version 2>$null).Trim() } catch { $sdk = $null }
if (-not $sdk) { Fail ".NET SDK not found in PATH. Install .NET 8+ then re-run." }
OK ".NET SDK $sdk"

# curl
$curl = (Get-Command curl.exe -ErrorAction SilentlyContinue)
if (-not $curl) { Fail "curl.exe not found. Windows 10/11 ships it under System32 — check PATH." }
OK "curl.exe at $($curl.Source)"

# Assets folder
$assetsRoot = Join-Path $root 'assets'
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

# Manifest sanity (informational)
$manifest = Join-Path $assetsRoot 'seed/products/manifest.json'
if (Test-Path $manifest) { OK "Seed manifest present (informational only — crawl uploads new files)" }
else                     { Info "Seed manifest absent — fine, crawl is independent." }

# ============================================================
# 1) AUTHENTICATE AS ADMIN
# ============================================================
Step "Login as admin ($AdminEmail)"
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
Step "Loading categories"
$cats = $null
if (-not $DryRun) {
  $catsRaw = & curl.exe -s "$ApiBase/api/catalog/categories"
  try { $cats = $catsRaw | ConvertFrom-Json } catch {}
  if (-not $cats -or $cats.Count -lt 1) { Fail "No categories returned. Did the seed run? See doc/luong.md §5.1." }
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
OK "$($cats.Count) categories"
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
    Photos    = @('1521572163474-6864f9cf17ab','1489987707025-afc232f7ea0f','1620799140408-edc6dcb6d633','1485518882345-15568b007407','1556821840-3a63f95609a7','1564584217132-2271feaeb3c5','1583743814966-8936f5b7be1a','1564859228273-274232fdb516','1586790170083-2f9ceadc732d')
  }
  2 = @{
    Name      = 'Quần'
    Templates = @('Quần jeans {0}', 'Quần kaki {0}', 'Quần jogger {0}', 'Quần cargo {0}', 'Quần short {0}', 'Quần tây {0}')
    Materials = @('denim', 'kaki cotton', 'fleece', 'canvas', 'linen blend')
    Colors    = @('Xanh denim', 'Đen', 'Be', 'Xám', 'Olive')
    Sizes     = @('M', 'L', 'XL')
    Tags      = @('denim', 'street', 'casual', 'comfort')
    Photos    = @('1542272604-787c3835535d','1473966968600-fa801b22a05a','1624378439575-d8705ad7ae80','1624206112918-f140f087f9b5','1552902865-b72c031ac5ea','1591195853828-11db59a44f6b')
  }
  3 = @{
    Name      = 'Áo khoác'
    Templates = @('Áo khoác {0} {1}', 'Áo blazer {0}', 'Áo cardigan {0}', 'Áo bomber {0}')
    Materials = @('linen', 'denim', 'nylon', 'wool blend', 'rayon')
    Colors    = @('Đen', 'Be', 'Ghi', 'Olive', 'Navy')
    Sizes     = @('M', 'L', 'XL')
    Tags      = @('outerwear', 'layering', 'office')
    Photos    = @('1551488831-00ddcb6c6bd3','1539109136881-3be0616acf4b','1591047139829-d91aecb6caea','1591047139756-eb6f88dba99a','1620799140408-edc6dcb6d633')
  }
  4 = @{
    Name      = 'Phụ kiện'
    Templates = @('Nón cap {0}', 'Thắt lưng {0}', 'Khăn lụa {0}', 'Vớ rib {0}', 'Mũ len {0}')
    Materials = @('cotton twill', 'da', 'lụa poly', 'cotton blend')
    Colors    = @('Đen', 'Be', 'Nâu', 'Trắng')
    Sizes     = @('FreeSize')
    Tags      = @('accessory', 'classic', 'soft')
    Photos    = @('1556905055-8f358a7a47b2','1611923134237-8e4b1eba9e23','1606760227091-3dd870d97f1d','1586350977771-b3b0abd50c82')
  }
  5 = @{
    Name      = 'Váy'
    Templates = @('Chân váy {0} {1}', 'Chân váy midi {0}', 'Chân váy chữ A {0}')
    Materials = @('denim', 'poly chiffon', 'tweed', 'satin')
    Colors    = @('Đen', 'Kem', 'Xanh denim', 'Nâu')
    Sizes     = @('S', 'M', 'L')
    Tags      = @('skirt', 'feminine', 'office')
    Photos    = @('1577900232427-18219b9166a0','1583496661160-fb5886a13d77')
  }
  6 = @{
    Name      = 'Đầm'
    Templates = @('Đầm suông {0}', 'Đầm sơ mi {0}', 'Đầm hai dây {0}', 'Đầm midi {0}')
    Materials = @('cotton', 'satin', 'cotton poplin', 'voan')
    Colors    = @('Đen', 'Trắng', 'Champagne', 'Xanh navy')
    Sizes     = @('S', 'M', 'L')
    Tags      = @('dress', 'feminine', 'party')
    Photos    = @('1572804013309-59a88b7e92f1','1612722432474-b971cdcea546','1566174053879-31528523f8ae')
  }
  7 = @{
    Name      = 'Giày'
    Templates = @('Giày sneaker {0}', 'Giày loafer {0}', 'Dép quai ngang {0}')
    Materials = @('da tổng hợp', 'EVA', 'canvas')
    Colors    = @('Trắng', 'Đen', 'Nâu', 'Kem')
    Sizes     = @('38', '39', '40', '41', '42')
    Tags      = @('sneaker', 'minimal', 'classic')
    Photos    = @('1542291026-7eec264c27ff','1606107557195-0e29a4b5b4aa','1603487742131-4160ec999306')
  }
  8 = @{
    Name      = 'Túi'
    Templates = @('Túi tote {0}', 'Túi đeo chéo {0}', 'Túi bucket {0}')
    Materials = @('canvas', 'da tổng hợp', 'nylon')
    Colors    = @('Trắng ngà', 'Đen', 'Be')
    Sizes     = @('FreeSize')
    Tags      = @('bag', 'accessory', 'daily')
    Photos    = @('1590874103328-eac38a683ce7')
  }
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

function Build-ProductDraft([int]$idx) {
  $cat   = ($cats | Where-Object { $blueprint.ContainsKey([int]$_.id) } | Get-Random)
  $bp    = $blueprint[[int]$cat.id]
  $tmpl  = Pick $bp.Templates
  $mat   = Pick $bp.Materials
  $col   = Pick $bp.Colors
  $name  = ($tmpl -f $col.ToLower(), $mat) + " Michi"
  # Make slug unique with idx + timestamp suffix to avoid PK conflicts in repeat runs.
  $slug  = "$(Slugify $name)-$(Get-Date -Format 'HHmmss')$idx"
  $price = (Get-Random -Minimum 19 -Maximum 99) * 10000   # 190.000 — 990.000 VND
  $variantCount = 2 + (Get-Random -Maximum 2)              # 2 or 3
  $colors = PickN $bp.Colors $variantCount
  $sizes  = PickN $bp.Sizes  ([Math]::Min($variantCount, $bp.Sizes.Count))
  $variants = @()
  for ($i = 0; $i -lt $variantCount; $i++) {
    $variants += @{
      sku       = ('MICHI-{0}-{1:D3}' -f (Slugify $name).Substring(0, [Math]::Min(8, (Slugify $name).Length)).ToUpper(), $i + 1)
      color     = $colors[$i % $colors.Count]
      size      = $sizes[$i % $sizes.Count]
      price     = $price + $i * 10000
      stockQty  = 5 + (Get-Random -Maximum 30)
    }
  }
  return @{
    name        = $name
    slug        = $slug
    description = "$($bp.Name) chất liệu $mat, màu $col, phối tốt với outfit hằng ngày."
    categoryId  = [int]$cat.id
    brand       = 'Michi'
    material    = $mat
    gender      = (Pick @('Unisex', 'Nam', 'Nữ'))
    basePrice   = $price
    tags        = (PickN $bp.Tags 3)
    photoId     = (Pick $bp.Photos)
    variants    = $variants
  }
}

function Download-Photo([string]$photoId, [string]$destFile) {
  $url = "https://images.unsplash.com/photo-$photoId" + "?auto=format&fit=crop&w=720&h=900&q=80"
  $code = & curl.exe -s -L -o "$destFile" -w '%{http_code}' --max-time 20 "$url"
  if ($LASTEXITCODE -ne 0 -or $code -ne '200' -or -not (Test-Path $destFile) -or (Get-Item $destFile).Length -lt 1024) {
    return $false
  }
  return $true
}

function Upload-Image([string]$file) {
  $resp = & curl.exe -s -X POST "$ApiBase/api/admin/upload/image?folder=products" `
    -H "Authorization: Bearer $token" -F "file=@$file"
  try { return ($resp | ConvertFrom-Json) } catch { return $null }
}

function Create-Product($draft, [string]$imageUrl) {
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
  try { return ($resp | ConvertFrom-Json) } catch {
    Write-Verbose "raw response: $resp"
    return $null
  }
}

# ============================================================
# 4) GENERATE + IMPORT LOOP
# ============================================================
Step "Generating $Count products"
$success = 0; $fail = 0; $skipDownload = 0
$results = @()

for ($i = 1; $i -le $Count; $i++) {
  $draft = Build-ProductDraft $i
  Write-Host ("  [{0,3}/{1}] {2}  ({3}, {4} variants)" -f $i, $Count, $draft.name, $blueprint[$draft.categoryId].Name, $draft.variants.Count)

  if ($DryRun) { $results += $draft; continue }

  $imgFile = Join-Path $tmp ("photo-$($draft.slug).jpg")
  if (-not (Download-Photo $draft.photoId $imgFile)) {
    Warn "      photo download failed (id=$($draft.photoId)); creating product without image"
    $skipDownload++
    $imageUrl = ''
  } else {
    $up = Upload-Image $imgFile
    if (-not $up -or -not $up.url) {
      Warn "      upload failed; creating product without image"
      $imageUrl = ''
    } else {
      $imageUrl = $up.url
      Write-Verbose "      uploaded: $imageUrl"
    }
  }

  $created = Create-Product $draft $imageUrl
  if ($created -and $created.id) {
    $success++
    Write-Verbose "      created id=$($created.id)"
  } else {
    $fail++
    Warn "      create-product failed for $($draft.name)"
  }
}

# Cleanup temp files
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

# ============================================================
# 5) SUMMARY
# ============================================================
Write-Host ""
Step "Summary"
if ($DryRun) {
  OK "DryRun complete. $($results.Count) drafts generated. No API calls made."
} else {
  OK "Created: $success / $Count"
  if ($fail -gt 0)         { Warn "Failed:  $fail" }
  if ($skipDownload -gt 0) { Warn "Photo download failed for $skipDownload product(s) — created without image" }

  $total = & curl.exe -s "$ApiBase/api/catalog/products" | ConvertFrom-Json
  Info ("DB total products now: {0}" -f $total.Count)
}

Write-Host ""
Write-Host "Done." -ForegroundColor Cyan

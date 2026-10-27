const { db, _ } = require('../lib/context')
const { toInt, escapeRegExp, friendlyDbError } = require('../lib/http')
const { AppError } = require('../lib/errors')
const { requireMiniUser } = require('../lib/auth')
const { getUserById, getUserByPhone, getSalesMap, getSalesName, sanitizeUser } = require('../lib/users')
const { buildOrderExport } = require('../lib/excel')
const {
  getBoundCategoryIds,
  hasCategoryBinding,
  canAccessProduct,
  filterVisibleProducts,
  productCategoryIds
} = require('../lib/catalog')
const { hashPassword, verifyPassword } = require('../lib/password')
const { issueToken, MINI_TTL_MS } = require('../lib/token')
const {
  getSettings,
  serializeProduct,
  serializeOrder,
  sortBySort,
  withTempUrls,
  findProductByIdOrCode,
  getProductById,
  generateOrderNo
} = require('../lib/store')

const MAX_ORDER_ITEMS = 20
const MINI_PAGE_SIZE = 10
const MIN_CART_ORDER_AMOUNT = 19900
const MAX_EXPORT_SELECTED = 100
const DAY_MS = 24 * 60 * 60 * 1000

function todayStart() {
  const now = new Date()
  const offset = 8 * 60 * 60 * 1000
  const local = new Date(now.getTime() + offset)
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset
}

function chinaMonthStart(monthOffset) {
  const now = new Date()
  const offset = 8 * 60 * 60 * 1000
  const local = new Date(now.getTime() + offset)
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + (monthOffset || 0), 1) - offset
}

async function getScopedCustomer(staff, customerId) {
  if (staff.type !== 'XS') throw new Error('仅销售可操作客户')
  const customer = await getUserById(customerId)
  if (!customer || customer.type !== 'KH' || String(customer.salesId || '') !== String(staff._id)) {
    throw new Error('客户不存在或不属于你')
  }
  if (customer.enabled === false) throw new Error('客户账号已停用')
  return customer
}

function resolveStaffOrderRange(event) {
  const rawStart = event && event.start
  const rawEnd = event && event.end
  const hasStart = rawStart !== undefined && rawStart !== ''
  const hasEnd = rawEnd !== undefined && rawEnd !== ''
  if (!hasStart && !hasEnd) {
    return { start: todayStart(), end: Date.now() }
  }
  if (!hasStart || !hasEnd) throw new Error('订单查询时间范围不合法')
  const start = Number(rawStart)
  const end = Number(rawEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end) {
    throw new Error('订单查询时间范围不合法')
  }
  if (Math.ceil((end - start) / DAY_MS) > 366) {
    throw new Error('订单查询范围不能超过一年')
  }
  return { start, end }
}

function toProductListItem(product) {
  const item = serializeProduct(product)
  return {
    _id: item._id,
    name: item.name,
    price: item.price,
    originalPrice: item.originalPrice,
    cover: item.images[0] || '',
    sales: item.sales,
    categoryId: item.categoryId || '',
    code: item.code || '',
    spec: item.spec,
    validUntil: item.validUntil,
    productionDate: item.productionDate,
    origin: item.origin,
    createdAt: item.createdAt,
    hasVideo: item.videos.length > 0
  }
}

function ensureCustomer(user, message) {
  if (user.type !== 'KH') {
    throw new Error(message || '只有客户账号可以使用该功能')
  }
}

function validatePhone(value) {
  const phone = String(value || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new Error('请填写正确的手机号')
  }
  return phone
}

function validatePassword(value, label) {
  const password = String(value || '')
  if (password.length < 6 || password.length > 32) {
    throw new Error(`${label}需为 6-32 位`)
  }
  return password
}

function cartCount(items) {
  return (items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0)
}

async function readCart(userId) {
  try {
    const res = await db.collection('carts').doc(String(userId)).get()
    return res.data || { userId, items: [] }
  } catch (err) {
    return { userId, items: [] }
  }
}

async function writeCart(userId, items) {
  await db.collection('carts').doc(String(userId)).set({
    data: {
      userId: String(userId),
      items,
      updatedAt: new Date()
    }
  })
}

async function login(event) {
  const phone = validatePhone(event.phone)
  const user = await getUserByPhone(phone)
  if (!user || !verifyPassword(event.password, user.passwordSalt, user.passwordHash)) {
    throw new Error('手机号或密码错误')
  }
  if (user.enabled === false) {
    throw new Error('账号已停用，请联系店主')
  }
  await db
    .collection('users')
    .doc(user._id)
    .update({ data: { lastLoginAt: new Date() } })
    .catch(err => console.warn('update lastLoginAt failed', err))

  return {
    token: issueToken(user, MINI_TTL_MS),
    user: sanitizeUser(user)
  }
}

async function getCatalog(user, event) {
  const includeProducts = !event || event.includeProducts !== false
  console.log('[getCatalog] start', includeProducts)
  const [settings, categoryRes] = await Promise.all([
    getSettings(),
    db.collection('categories').where({ enabled: true }).limit(100).get()
  ])

  let categoryDocs = categoryRes.data
  let visibleProducts = []
  if (includeProducts) {
    const productRes = await db.collection('products').where({ status: 'ON' }).limit(500).get()
    visibleProducts = filterVisibleProducts(user, productRes.data)
    if (hasCategoryBinding(user)) {
      const categoryIds = new Set()
      visibleProducts.forEach(product => {
        productCategoryIds(product).forEach(id => categoryIds.add(id))
      })
      categoryDocs = categoryDocs.filter(item => categoryIds.has(item._id))
    }
  } else if (hasCategoryBinding(user)) {
    const bound = new Set(getBoundCategoryIds(user))
    categoryDocs = categoryDocs.filter(item => bound.has(item._id))
  }
  console.log('[getCatalog] query done', categoryDocs.length, visibleProducts.length)

  const categories = sortBySort(categoryDocs).map(item => ({
    _id: item._id,
    name: item.name,
    sort: Number(item.sort) || 0
  }))

  return {
    settings: {
      shopName: settings.shopName,
      notice: settings.notice,
      serviceWechat: settings.serviceWechat
    },
    categories,
    products: sortBySort(visibleProducts).map(toProductListItem)
  }
}

async function listCatalogCategories(user) {
  const res = await db.collection('categories').where({ enabled: true }).limit(100).get()
  let categoryDocs = res.data
  const bound = getBoundCategoryIds(user)
  if (bound.length) {
    const allowed = new Set(bound)
    categoryDocs = categoryDocs.filter(item => allowed.has(item._id))
  }
  return sortBySort(categoryDocs).map(item => ({
    _id: item._id,
    name: item.name,
    sort: Number(item.sort) || 0
  }))
}

async function getHome(user) {
  const [settings, categories, pageData] = await Promise.all([
    getSettings(),
    listCatalogCategories(user),
    fetchProductPage(user, { page: 1 })
  ])
  return {
    settings: {
      shopName: settings.shopName,
      notice: settings.notice,
      serviceWechat: settings.serviceWechat
    },
    categories,
    products: pageData.list,
    hasMore: pageData.hasMore,
    page: pageData.page
  }
}

async function listProducts(user, event) {
  let accessUser = user
  if (event.customerId) {
    accessUser = await getScopedCustomer(user, event.customerId)
  }
  return fetchProductPage(accessUser, event)
}

function buildProductQuery(user, event) {
  const categoryId = String(event.categoryId || '').trim()
  const keyword = String(event.keyword || '').trim().slice(0, 50)
  const sort = ['sales', 'new'].includes(event.sort) ? event.sort : 'default'

  const base = { status: 'ON' }
  if (keyword) base.name = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
  const bound = getBoundCategoryIds(user)
  if (categoryId && categoryId !== 'all') {
    if (bound.length && !bound.includes(categoryId)) {
      return { where: null, sort }
    }
    return {
      where: _.or([
        { ...base, categoryId },
        { ...base, categoryIds: _.in([categoryId]) }
      ]),
      sort
    }
  }
  if (bound.length) {
    return {
      where: _.or([
        { ...base, categoryId: _.in(bound) },
        { ...base, categoryIds: _.in(bound) }
      ]),
      sort
    }
  }
  return { where: base, sort }
}

async function fetchProductPage(user, event) {
  const page = toInt(event.page, 1, 1, 100000)
  const { where, sort } = buildProductQuery(user, event)
  if (!where) {
    return { list: [], hasMore: false, page }
  }

  let query = db.collection('products').where(where)
  if (sort === 'sales') {
    query = query.orderBy('sales', 'desc').orderBy('createdAt', 'desc')
  } else if (sort === 'new') {
    query = query.orderBy('createdAt', 'desc')
  } else {
    query = query.orderBy('sort', 'asc').orderBy('createdAt', 'desc')
  }

  const res = await query.skip((page - 1) * MINI_PAGE_SIZE).limit(MINI_PAGE_SIZE + 1).get()
  const hasMore = res.data.length > MINI_PAGE_SIZE
  return {
    list: res.data.slice(0, MINI_PAGE_SIZE).map(toProductListItem),
    hasMore,
    page
  }
}

async function getProduct(user, event) {
  const product = await findProductByIdOrCode({ id: event.id, code: event.code })
  if (!product || !canAccessProduct(user, product)) {
    throw new Error('商品不存在或已删除')
  }
  const [withUrls] = await withTempUrls([serializeProduct(product)])
  return { product: withUrls }
}

async function me(user) {
  return {
    user: sanitizeUser(user),
    salesName: user.salesId ? await getSalesName(user.salesId) : ''
  }
}

async function updateProfile(user, event) {
  const name = String(event.name || '').trim()
  if (!name || name.length > 20) {
    throw new Error('请填写姓名（20 字以内）')
  }
  const shopName = String(event.shopName || '').trim().slice(0, 50)
  const address = String(event.address || '').trim().slice(0, 200)
  const data = { name, updatedAt: new Date() }

  if (user.type === 'KH') {
    if (!shopName) throw new Error('请填写门店名称')
    if (!address) throw new Error('请填写收货地址')
    data.shopName = shopName
    data.address = address
  }

  await db.collection('users').doc(user._id).update({ data })
  return { user: sanitizeUser({ ...user, ...data }) }
}

async function changePassword(user, event) {
  if (!verifyPassword(event.oldPassword, user.passwordSalt, user.passwordHash)) {
    throw new Error('原密码不正确')
  }
  const newPassword = validatePassword(event.newPassword, '新密码')
  const { passwordSalt, passwordHash } = hashPassword(newPassword)
  await db.collection('users').doc(user._id).update({
    data: { passwordSalt, passwordHash, updatedAt: new Date() }
  })
  return {
    ok: true,
    token: issueToken({ ...user, passwordSalt, passwordHash }, MINI_TTL_MS)
  }
}

async function getCart(user) {
  const cart = await readCart(user._id)
  const rawItems = Array.isArray(cart.items) ? cart.items : []
  const productIds = rawItems.map(item => item.productId).filter(Boolean)
  let products = []
  if (productIds.length) {
    const res = await db.collection('products').where({ _id: _.in(productIds) }).limit(100).get()
    products = res.data
  }
  const map = {}
  products.forEach(product => {
    map[product._id] = product
  })

  const items = []
  rawItems.forEach(item => {
    const product = map[item.productId]
    if (!product || !canAccessProduct(user, product)) return
    const onSale = product.status === 'ON'
    items.push({
      productId: product._id,
      quantity: Math.min(99, Math.max(1, Number(item.quantity) || 1)),
      checked: item.checked !== false && onSale,
      name: product.name,
      price: Number(product.price) || 0,
      cover: (product.images || [])[0] || '',
      status: product.status,
      onSale
    })
  })

  if (items.length !== rawItems.length) {
    await writeCart(
      user._id,
      items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        checked: item.checked,
        addedAt: new Date()
      }))
    ).catch(err => console.warn('prune cart failed', err))
  }

  const selected = items.filter(item => item.checked && item.onSale)
  return {
    items,
    count: cartCount(items),
    selectedCount: selected.reduce((total, item) => total + item.quantity, 0),
    totalAmount: selected.reduce((total, item) => total + item.price * item.quantity, 0)
  }
}

async function addToCart(user, event) {
  ensureCustomer(user, '只有客户账号可以加入购物车')
  const product = await getProductById(event.productId)
  if (!product || product.status !== 'ON' || !canAccessProduct(user, product)) {
    throw new Error('商品不存在或已下架')
  }
  const quantity = Math.min(99, Math.max(1, Number(event.quantity) || 1))
  const cart = await readCart(user._id)
  const items = (cart.items || []).slice()
  const existing = items.find(item => item.productId === product._id)
  if (existing) {
    existing.quantity = Math.min(99, (Number(existing.quantity) || 0) + quantity)
    existing.checked = true
  } else {
    items.push({ productId: product._id, quantity, checked: true, addedAt: new Date() })
  }
  await writeCart(user._id, items)
  return { count: cartCount(items) }
}

async function updateCartItem(user, event) {
  ensureCustomer(user, '只有客户账号可以操作购物车')
  const productId = String(event.productId || '')
  if (!productId) throw new Error('缺少商品信息')
  const cart = await readCart(user._id)
  const items = (cart.items || []).slice()
  const item = items.find(entry => entry.productId === productId)
  const product = await getProductById(productId)
  if (!item || !canAccessProduct(user, product)) throw new Error('购物车中没有该商品')

  if (event.quantity !== undefined) {
    const quantity = Number(event.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('数量需在 1-99 之间')
    }
    item.quantity = quantity
  }
  if (event.checked !== undefined) {
    item.checked = Boolean(event.checked)
  }
  await writeCart(user._id, items)
  return { count: cartCount(items) }
}

async function setCartCheckedAll(user, event) {
  ensureCustomer(user, '只有客户账号可以操作购物车')
  const checked = Boolean(event.checked)
  const cart = await readCart(user._id)
  const rawItems = cart.items || []
  const ids = rawItems.map(item => item.productId).filter(Boolean)
  let productMap = {}
  if (ids.length) {
    const res = await db.collection('products').where({ _id: _.in(ids) }).limit(100).get()
    res.data.forEach(product => {
      productMap[product._id] = product
    })
  }
  const items = rawItems
    .filter(item => canAccessProduct(user, productMap[item.productId]))
    .map(item => ({ ...item, checked }))
  await writeCart(user._id, items)
  return { count: cartCount(items) }
}

async function removeCartItem(user, event) {
  ensureCustomer(user, '只有客户账号可以操作购物车')
  const productId = String(event.productId || '')
  if (!productId) throw new Error('缺少商品信息')
  const cart = await readCart(user._id)
  const items = (cart.items || []).filter(item => item.productId !== productId)
  await writeCart(user._id, items)
  return { count: cartCount(items) }
}

async function resolveCheckoutItems(user, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('请选择要结算的商品')
  }
  if (rawItems.length > MAX_ORDER_ITEMS) {
    throw new Error(`一次最多结算 ${MAX_ORDER_ITEMS} 种商品`)
  }

  const merged = new Map()
  rawItems.forEach(raw => {
    const productId = String((raw && raw.productId) || '')
    const quantity = Number(raw && raw.quantity)
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('商品数量不合法')
    }
    const existing = merged.get(productId)
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + quantity)
    } else {
      merged.set(productId, { productId, quantity })
    }
  })

  const entries = Array.from(merged.values())
  const res = await db
    .collection('products')
    .where({ _id: _.in(entries.map(entry => entry.productId)) })
    .limit(100)
    .get()
  const map = {}
  res.data.forEach(product => {
    map[product._id] = product
  })

  const items = entries.map(entry => {
    const product = map[entry.productId]
    if (!product) throw new Error('部分商品已不存在，请刷新后重试')
    if (product.status !== 'ON') throw new Error(`「${product.name}」已下架`)
    if (!canAccessProduct(user, product)) throw new Error(`「${product.name}」暂不可购买`)
    return {
      productId: product._id,
      name: product.name,
      spec: product.spec || '',
      price: Number(product.price) || 0,
      quantity: entry.quantity,
      image: (product.images || [])[0] || ''
    }
  })

  return {
    items,
    totalAmount: items.reduce((total, item) => total + item.price * item.quantity, 0)
  }
}

async function getCheckoutPreview(user, event) {
  ensureCustomer(user, '只有客户账号可以下单')
  const result = await resolveCheckoutItems(user, event.items)
  return {
    ...result,
    address: user.address || '',
    user: sanitizeUser(user)
  }
}

async function createOrder(user, event, openid) {
  ensureCustomer(user, '只有客户账号可以下单')
  const result = await resolveCheckoutItems(user, event.items)

  const address = String(event.address || '').trim()
  if (!address) throw new Error('请填写收货地址')
  if (address.length > 200) throw new Error('收货地址请控制在 200 字以内')

  const remark = String(event.remark || '').trim()
  if (remark.length > 200) throw new Error('备注请控制在 200 字以内')

  const source = event.source === 'cart' ? 'cart' : 'direct'
  if (source === 'cart' && result.totalAmount < MIN_CART_ORDER_AMOUNT) {
    throw new Error('购物车满 199 元才能创建订单')
  }
  const salesName = user.salesId ? await getSalesName(user.salesId) : ''
  const now = new Date()

  const order = {
    orderNo: generateOrderNo(),
    userId: user._id,
    openid: openid || '',
    items: result.items,
    totalAmount: result.totalAmount,
    customerName: user.name,
    phone: user.phone,
    shopName: user.shopName || '',
    address,
    salesId: user.salesId || '',
    salesName,
    remark,
    source,
    orderSource: 'SELF',
    status: 'DONE',
    createdAt: now,
    updatedAt: now
  }

  const addRes = await db.collection('orders').add({ data: order })

  await Promise.all(
    result.items.map(item =>
      db
        .collection('products')
        .doc(item.productId)
        .update({ data: { sales: _.inc(item.quantity), updatedAt: now } })
        .catch(err => console.warn('increase sales failed', err))
    )
  )

  if (address !== (user.address || '')) {
    await db
      .collection('users')
      .doc(user._id)
      .update({ data: { address, updatedAt: now } })
      .catch(err => console.warn('update user address failed', err))
  }

  if (source === 'cart') {
    const cart = await readCart(user._id)
    const purchased = new Set(result.items.map(item => item.productId))
    const nextItems = (cart.items || []).filter(item => !purchased.has(item.productId))
    await writeCart(user._id, nextItems).catch(err => console.warn('clear cart failed', err))
  }

  return {
    orderId: addRes._id,
    orderNo: order.orderNo,
    totalAmount: order.totalAmount
  }
}

function buildStaffOrderWhere(user, event) {
  const customerId = String(event.customerId || '').trim()
  const salesId = user.type === 'XS'
    ? String(user._id)
    : String(event.salesId || '').trim()
  const range = resolveStaffOrderRange(event)
  const where = {
    createdAt: _.gte(new Date(range.start)).and(_.lte(new Date(range.end)))
  }
  if (salesId) where.salesId = salesId
  if (customerId) where.userId = customerId
  return where
}

async function listStaffOrders(user, event) {
  if (user.type !== 'XS' && user.type !== 'GLY') {
    throw new Error('仅销售和管理员可查看客户订单')
  }
  const page = toInt(event.page, 1, 1, 10000)
  const pageSize = toInt(event.pageSize, MINI_PAGE_SIZE, 1, 20)
  const where = buildStaffOrderWhere(user, event)

  const listRes = await db
    .collection('orders')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize + 1)
    .get()

  let list = listRes.data.slice(0, pageSize).map(serializeOrder)
  if (list.some(order => order.salesId && !order.salesName)) {
    const salesMap = await getSalesMap(list.map(order => order.salesId))
    list = list.map(order => ({
      ...order,
      salesName: order.salesName || (salesMap[order.salesId] || {}).name || ''
    }))
  }

  return {
    list,
    hasMore: listRes.data.length > pageSize,
    page
  }
}

async function exportStaffOrders(user, event) {
  if (user.type !== 'XS' && user.type !== 'GLY') {
    throw new Error('仅销售和管理员可导出客户订单')
  }
  const rawIds = Array.isArray(event.ids) ? event.ids : String(event.ids || '').split(',')
  const ids = Array.from(new Set(rawIds.map(item => String(item || '').trim()).filter(Boolean)))
  if (!ids.length) throw new Error('请选择要导出的订单')
  if (ids.length > MAX_EXPORT_SELECTED) {
    throw new Error(`一次最多导出 ${MAX_EXPORT_SELECTED} 单`)
  }

  const where = { _id: _.in(ids) }
  if (user.type === 'XS') where.salesId = String(user._id)
  const res = await db.collection('orders').where(where).limit(ids.length).get()
  if (!res.data.length) throw new Error('没有可导出的订单')
  const orders = res.data
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return {
    ...buildOrderExport(orders),
    orderCount: orders.length
  }
}

async function listSalesOptions(user) {
  if (user.type !== 'GLY') throw new Error('仅管理员可查看销售列表')
  const res = await db.collection('users').where({ type: 'XS', enabled: true }).limit(200).get()
  const list = res.data
    .map(item => ({ _id: item._id, name: item.name || '' }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  return { list }
}

async function listCustomerOptions(user) {
  if (user.type !== 'XS' && user.type !== 'GLY') {
    throw new Error('仅销售和管理员可查看客户列表')
  }
  const where = user.type === 'XS'
    ? { type: 'KH', salesId: String(user._id) }
    : { type: 'KH' }
  const res = await db.collection('users').where(where).limit(1000).get()
  const list = res.data
    .map(item => ({
      _id: item._id,
      name: item.name || '',
      phone: item.phone || '',
      shopName: item.shopName || ''
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  return { list }
}

async function listMyCustomers(user) {
  if (user.type !== 'XS') throw new Error('仅销售可查看我的客户')
  const now = Date.now()
  const currentStart = chinaMonthStart(0)
  const prevStart = chinaMonthStart(-1)
  const [customerRes, currentRes, prevRes] = await Promise.all([
    db.collection('users').where({ type: 'KH', salesId: String(user._id) }).limit(1000).get(),
    db.collection('orders').where({
      salesId: String(user._id),
      status: 'DONE',
      createdAt: _.gte(new Date(currentStart)).and(_.lte(new Date(now)))
    }).limit(1000).get(),
    db.collection('orders').where({
      salesId: String(user._id),
      status: 'DONE',
      createdAt: _.gte(new Date(prevStart)).and(_.lt(new Date(currentStart)))
    }).limit(1000).get()
  ])

  const customerIds = new Set(customerRes.data.map(item => String(item._id)))
  const currentMap = new Map()
  currentRes.data
    .filter(order => customerIds.has(String(order.userId)))
    .forEach(order => {
      const current = currentMap.get(order.userId) || { amount: 0, count: 0 }
      current.amount += Number(order.totalAmount) || 0
      current.count += 1
      currentMap.set(order.userId, current)
    })
  const prevMap = new Map()
  prevRes.data
    .filter(order => customerIds.has(String(order.userId)))
    .forEach(order => {
      const current = prevMap.get(order.userId) || { amount: 0 }
      current.amount += Number(order.totalAmount) || 0
      prevMap.set(order.userId, current)
    })

  let monthAmount = 0
  let monthOrderCount = 0
  let orderedCustomers = 0
  const list = customerRes.data.map(customer => {
    const current = currentMap.get(customer._id) || { amount: 0, count: 0 }
    const prev = prevMap.get(customer._id) || { amount: 0 }
    if (current.count > 0) orderedCustomers += 1
    monthAmount += current.amount
    monthOrderCount += current.count
    return {
      userId: customer._id,
      name: customer.name || '',
      phone: customer.phone || '',
      shopName: customer.shopName || '',
      address: customer.address || '',
      enabled: customer.enabled !== false,
      salesName: user.name || '',
      monthAmount: current.amount,
      monthOrderCount: current.count,
      prevMonthAmount: prev.amount,
      changeAmount: current.amount - prev.amount
    }
  }).sort((a, b) => b.monthAmount - a.monthAmount || String(a.name).localeCompare(String(b.name)))

  const local = new Date(now + 8 * 60 * 60 * 1000)
  return {
    summary: {
      totalCustomers: customerRes.data.length,
      orderedCustomers,
      unorderedCustomers: customerRes.data.length - orderedCustomers,
      monthAmount,
      monthOrderCount
    },
    list,
    truncated: customerRes.data.length >= 1000 || currentRes.data.length >= 1000 || prevRes.data.length >= 1000,
    monthLabel: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`
  }
}

async function getAssistCustomer(user, event) {
  const customer = await getScopedCustomer(user, event.customerId)
  return {
    customer: {
      _id: customer._id,
      name: customer.name || '',
      phone: customer.phone || '',
      shopName: customer.shopName || '',
      address: customer.address || '',
      enabled: customer.enabled !== false,
      categoryIds: Array.isArray(customer.categoryIds) ? customer.categoryIds : []
    }
  }
}

async function assistAddToCart(user, event) {
  const customer = await getScopedCustomer(user, event.customerId)
  const result = await resolveCheckoutItems(customer, event.items)
  const cart = await readCart(customer._id)
  const items = (cart.items || []).slice()
  result.items.forEach(item => {
    const existing = items.find(entry => entry.productId === item.productId)
    if (existing) {
      existing.quantity = Math.min(99, (Number(existing.quantity) || 0) + item.quantity)
      existing.checked = true
    } else {
      items.push({
        productId: item.productId,
        quantity: item.quantity,
        checked: true,
        addedAt: new Date()
      })
    }
  })
  await writeCart(customer._id, items)
  return { count: cartCount(items) }
}

async function assistCreateOrder(user, event) {
  const customer = await getScopedCustomer(user, event.customerId)
  const result = await resolveCheckoutItems(customer, event.items)

  const address = String(event.address || customer.address || '').trim()
  if (!address) throw new Error('请填写收货地址')
  if (address.length > 200) throw new Error('收货地址请控制在 200 字以内')
  const remark = String(event.remark || '').trim()
  if (remark.length > 200) throw new Error('备注请控制在 200 字以内')

  const now = new Date()
  const order = {
    orderNo: generateOrderNo(),
    userId: customer._id,
    openid: '',
    items: result.items,
    totalAmount: result.totalAmount,
    customerName: customer.name,
    phone: customer.phone,
    shopName: customer.shopName || '',
    address,
    salesId: user._id,
    salesName: user.name || '',
    remark,
    source: 'direct',
    orderSource: 'ASSIST',
    assistedById: user._id,
    assistedByName: user.name || '',
    status: 'DONE',
    createdAt: now,
    updatedAt: now
  }
  const addRes = await db.collection('orders').add({ data: order })

  await Promise.all(
    result.items.map(item =>
      db
        .collection('products')
        .doc(item.productId)
        .update({ data: { sales: _.inc(item.quantity), updatedAt: now } })
        .catch(err => console.warn('increase sales failed', err))
    )
  )

  if (address !== (customer.address || '')) {
    await db
      .collection('users')
      .doc(customer._id)
      .update({ data: { address, updatedAt: now } })
      .catch(err => console.warn('update customer address failed', err))
  }

  const cart = await readCart(customer._id)
  const purchased = new Set(result.items.map(item => item.productId))
  const nextItems = (cart.items || []).filter(item => !purchased.has(item.productId))
  if (nextItems.length !== (cart.items || []).length) {
    await writeCart(customer._id, nextItems).catch(err => console.warn('clear customer cart failed', err))
  }

  return {
    orderId: addRes._id,
    orderNo: order.orderNo,
    totalAmount: order.totalAmount
  }
}

async function listMyOrders(user, event) {
  if (user.type !== 'KH') {
    return { list: [], hasMore: false }
  }
  const page = toInt(event.page, 1, 1, 10000)
  const pageSize = toInt(event.pageSize, MINI_PAGE_SIZE, 1, 20)
  const where = { userId: user._id }

  const listRes = await db
    .collection('orders')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize + 1)
    .get()

  return {
    list: listRes.data.slice(0, pageSize).map(serializeOrder),
    hasMore: listRes.data.length > pageSize,
    page
  }
}

async function getMyOrder(user, event) {
  if (!['KH', 'XS', 'GLY'].includes(user.type)) throw new Error('订单不存在')
  if (!event.id) throw new Error('缺少订单编号')
  let order = null
  try {
    const res = await db.collection('orders').doc(String(event.id)).get()
    order = res.data
  } catch (err) {
    order = null
  }
  if (!order) throw new Error('订单不存在')
  if (user.type === 'KH' && String(order.userId) !== String(user._id)) {
    throw new Error('订单不存在')
  }
  if (user.type === 'XS' && String(order.salesId || '') !== String(user._id)) {
    throw new Error('订单不存在')
  }
  return { order: serializeOrder(order) }
}

async function handleMini(event, openid) {
  const action = event && event.action
  try {
    if (action === 'ping') {
      return { pong: true, time: Date.now() }
    }
    if (action === 'login') {
      return await login(event)
    }
    if (action === 'getSettings') {
      return { settings: await getSettings() }
    }

    const user = await requireMiniUser(event)
    switch (action) {
      case 'getCatalog':
        return await getCatalog(user, event)
      case 'getHome':
        return await getHome(user)
      case 'listProducts':
        return await listProducts(user, event)
      case 'getProduct':
        return await getProduct(user, event)
      case 'me':
        return await me(user)
      case 'updateProfile':
        return await updateProfile(user, event)
      case 'changePassword':
        return await changePassword(user, event)
      case 'getCart':
        return await getCart(user)
      case 'addToCart':
        return await addToCart(user, event)
      case 'updateCartItem':
        return await updateCartItem(user, event)
      case 'setCartCheckedAll':
        return await setCartCheckedAll(user, event)
      case 'removeCartItem':
        return await removeCartItem(user, event)
      case 'getCheckoutPreview':
        return await getCheckoutPreview(user, event)
      case 'createOrder':
        return await createOrder(user, event, openid)
      case 'listMyOrders':
        return await listMyOrders(user, event)
      case 'listStaffOrders':
        return await listStaffOrders(user, event)
      case 'exportStaffOrders':
        return await exportStaffOrders(user, event)
      case 'listSalesOptions':
        return await listSalesOptions(user)
      case 'listCustomerOptions':
        return await listCustomerOptions(user)
      case 'listMyCustomers':
        return await listMyCustomers(user)
      case 'getAssistCustomer':
        return await getAssistCustomer(user, event)
      case 'assistAddToCart':
        return await assistAddToCart(user, event)
      case 'assistCreateOrder':
        return await assistCreateOrder(user, event)
      case 'getMyOrder':
        return await getMyOrder(user, event)
      default:
        throw new Error('未知操作')
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new Error(friendlyDbError(err))
  }
}

module.exports = { handleMini }

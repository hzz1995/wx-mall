const { db, _ } = require('../lib/context')
const { toInt, escapeRegExp, friendlyDbError } = require('../lib/http')
const { AppError } = require('../lib/errors')
const { requireMiniUser } = require('../lib/auth')
const { getUserByPhone, getSalesName, sanitizeUser } = require('../lib/users')
const {
  getBoundProductIds,
  hasProductBinding,
  canAccessProduct,
  filterVisibleProducts
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

function visibleCartCount(user, items) {
  return cartCount((items || []).filter(item => canAccessProduct(user, item.productId)))
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
    if (hasProductBinding(user)) {
      const categoryIds = new Set(visibleProducts.map(item => item.categoryId).filter(Boolean))
      categoryDocs = categoryDocs.filter(item => categoryIds.has(item._id))
    }
  } else if (hasProductBinding(user)) {
    const bound = getBoundProductIds(user)
    const res = await db
      .collection('products')
      .where({ status: 'ON', _id: _.in(bound) })
      .field({ categoryId: true })
      .limit(bound.length)
      .get()
    const categoryIds = new Set(res.data.map(item => item.categoryId).filter(Boolean))
    categoryDocs = categoryDocs.filter(item => categoryIds.has(item._id))
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

async function listProducts(user, event) {
  const page = toInt(event.page, 1, 1, 100000)
  const categoryId = String(event.categoryId || '').trim()
  const keyword = String(event.keyword || '').trim().slice(0, 50)
  const sort = ['sales', 'new'].includes(event.sort) ? event.sort : 'default'

  const where = { status: 'ON' }
  if (categoryId && categoryId !== 'all') where.categoryId = categoryId
  if (keyword) where.name = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
  const bound = getBoundProductIds(user)
  if (bound.length) where._id = _.in(bound)

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
  if (!product || !canAccessProduct(user, product._id)) {
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
    if (!product || !canAccessProduct(user, product._id)) return
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
  if (!product || product.status !== 'ON' || !canAccessProduct(user, product._id)) {
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
  return { count: visibleCartCount(user, items) }
}

async function updateCartItem(user, event) {
  ensureCustomer(user, '只有客户账号可以操作购物车')
  const productId = String(event.productId || '')
  if (!productId) throw new Error('缺少商品信息')
  const cart = await readCart(user._id)
  const items = (cart.items || []).slice()
  const item = items.find(entry => entry.productId === productId)
  if (!item || !canAccessProduct(user, productId)) throw new Error('购物车中没有该商品')

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
  return { count: visibleCartCount(user, items) }
}

async function setCartCheckedAll(user, event) {
  ensureCustomer(user, '只有客户账号可以操作购物车')
  const checked = Boolean(event.checked)
  const cart = await readCart(user._id)
  const items = (cart.items || [])
    .filter(item => canAccessProduct(user, item.productId))
    .map(item => ({ ...item, checked }))
  await writeCart(user._id, items)
  return { count: visibleCartCount(user, items) }
}

async function removeCartItem(user, event) {
  ensureCustomer(user, '只有客户账号可以操作购物车')
  const productId = String(event.productId || '')
  if (!productId) throw new Error('缺少商品信息')
  const cart = await readCart(user._id)
  const items = (cart.items || []).filter(item => item.productId !== productId)
  await writeCart(user._id, items)
  return { count: visibleCartCount(user, items) }
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
    if (!canAccessProduct(user, product._id)) throw new Error(`「${product.name}」暂不可购买`)
    return {
      productId: product._id,
      name: product.name,
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
  if (user.type !== 'KH') throw new Error('订单不存在')
  if (!event.id) throw new Error('缺少订单编号')
  let order = null
  try {
    const res = await db.collection('orders').doc(String(event.id)).get()
    order = res.data
  } catch (err) {
    order = null
  }
  if (!order || order.userId !== user._id) {
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

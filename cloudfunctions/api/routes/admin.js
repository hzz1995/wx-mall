const { cloud, db, _ } = require('../lib/context')
const {
  CORS_HEADERS,
  HttpError,
  response,
  normalizePath,
  parseBody,
  toInt,
  escapeRegExp,
  friendlyDbError
} = require('../lib/http')
const { AppError } = require('../lib/errors')
const { requireStaff } = require('../lib/auth')
const { ADMIN_TTL_MS, issueToken, safeEqual } = require('../lib/token')
const { hashPassword, verifyPassword } = require('../lib/password')
const {
  getUserByPhone,
  getUserById,
  getSalesMap,
  sanitizeUser
} = require('../lib/users')
const {
  getSettings,
  saveSettings,
  serializeProduct,
  serializeOrder,
  sortBySort,
  withTempUrls,
  getTempUrlMap,
  generateUniqueProductCode,
  getProductById,
  isCloudFile,
  toTimestamp
} = require('../lib/store')

const ORDER_STATUS = ['DONE', 'CANCELLED']
const USER_TYPES = ['KH', 'XS', 'GLY', 'YY']
const MAX_IMAGES = 4
const MAX_VIDEOS = 2
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const MAX_VIDEO_BYTES = 40 * 1024 * 1024
const MAX_VIDEO_CHUNKS = 64
const MAX_CHUNK_BYTES = 3 * 1024 * 1024
const MAX_BOUND_PRODUCTS = 100
const AUDIT_ACTIONS = [
  'PRODUCT_CREATE',
  'PRODUCT_UPDATE',
  'PRODUCT_DELETE',
  'CATEGORY_CREATE',
  'CATEGORY_UPDATE',
  'CATEGORY_DELETE'
]
let auditCollectionReady = false

function requireText(value, label, maxLength) {
  const text = String(value == null ? '' : value).trim()
  if (!text) throw new HttpError(400, `请填写${label}`)
  if (text.length > maxLength) throw new HttpError(400, `${label}请控制在 ${maxLength} 字以内`)
  return text
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength)
}

function auditProductSnapshot(product) {
  if (!product) return null
  return {
    name: product.name || '',
    categoryId: product.categoryId || '',
    price: Number(product.price) || 0,
    originalPrice: Number(product.originalPrice) || 0,
    images: Array.isArray(product.images) ? product.images : [],
    videos: Array.isArray(product.videos) ? product.videos : [],
    description: product.description || '',
    spec: product.spec || '',
    productionDate: product.productionDate || '',
    origin: product.origin || '',
    sort: Number(product.sort) || 0,
    status: product.status || 'ON',
    code: product.code || '',
    sales: Number(product.sales) || 0
  }
}

function auditCategorySnapshot(category) {
  if (!category) return null
  return {
    name: category.name || '',
    sort: Number(category.sort) || 0,
    enabled: category.enabled !== false
  }
}

function auditBase(staff, action, resource, resourceId, resourceName) {
  return {
    action,
    resource,
    resourceId: String(resourceId || ''),
    resourceName: resourceName || '',
    operatorId: String(staff._id),
    operatorName: staff.name || '',
    operatorPhone: staff.phone || '',
    operatorType: staff.type,
    createdAt: new Date()
  }
}

async function writeAuditLog(entry) {
  try {
    if (!auditCollectionReady) {
      try {
        await db.createCollection('audit_logs')
      } catch (err) {
        // 集合已存在时忽略
      }
    }
    await db.collection('audit_logs').add({ data: entry })
    auditCollectionReady = true
    return ''
  } catch (err) {
    console.error('writeAuditLog failed', err)
    return '操作已完成，但操作日志写入失败，请检查 audit_logs 集合'
  }
}

function validatePhone(value) {
  const phone = String(value || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new HttpError(400, '请填写正确的手机号')
  return phone
}

function validateUserType(value) {
  const type = String(value || '')
  if (!USER_TYPES.includes(type)) throw new HttpError(400, '用户类型不合法')
  return type
}

function validateNewPassword(value) {
  const password = String(value || '')
  if (password.length < 6 || password.length > 32) {
    throw new HttpError(400, '密码需为 6-32 位')
  }
  return password
}

function parsePrice(value, label) {
  const price = Number(value)
  if (!Number.isInteger(price) || price < 0 || price > 99999999) {
    throw new HttpError(400, `${label}需为有效金额（最高 999999.99 元）`)
  }
  return price
}

function parseSort(value) {
  const sort = Number(value)
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) {
    throw new HttpError(400, '排序需为 0-9999 的整数')
  }
  return sort
}

function normalizeMedia(value, label, maxCount) {
  if (!Array.isArray(value)) throw new HttpError(400, `${label}格式不正确`)
  if (value.length > maxCount) throw new HttpError(400, `最多上传 ${maxCount} 个${label}`)
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .map(item => {
      if (!/^(cloud:\/\/|https:\/\/)/.test(item)) throw new HttpError(400, `${label}地址不合法`)
      return item
    })
}

async function validateSalesId(salesId, selfId, required) {
  const id = String(salesId || '').trim()
  if (!id) {
    if (required) throw new HttpError(400, '请选择负责销售')
    return ''
  }
  if (selfId && id === String(selfId)) throw new HttpError(400, '不能将自己设为负责销售')
  const sales = await getUserById(id)
  if (!sales || sales.type !== 'XS') throw new HttpError(400, '负责销售必须是销售账号')
  return id
}

async function validateBoundProductIds(value) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new HttpError(400, '可售商品格式不正确')
  const ids = Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
  if (ids.length > MAX_BOUND_PRODUCTS) {
    throw new HttpError(400, `每个客户最多绑定 ${MAX_BOUND_PRODUCTS} 件商品`)
  }
  if (!ids.length) return []
  const res = await db.collection('products').where({ _id: _.in(ids) }).limit(MAX_BOUND_PRODUCTS).get()
  const found = new Set(res.data.map(item => String(item._id)))
  return ids.filter(id => found.has(id))
}

async function validateProductPayload(body, partial) {
  const data = {}
  if (!partial || body.name !== undefined) {
    data.name = requireText(body.name, '商品名称', 50)
  }
  if (!partial || body.categoryId !== undefined) {
    const categoryId = String(body.categoryId || '').trim()
    if (!categoryId) throw new HttpError(400, '请选择商品分类')
    let category = null
    try {
      const res = await db.collection('categories').doc(categoryId).get()
      category = res.data
    } catch (err) {
      category = null
    }
    if (!category) throw new HttpError(400, '所选分类不存在')
    data.categoryId = categoryId
  }
  if (!partial || body.price !== undefined) {
    data.price = parsePrice(body.price, '售价')
  }
  if (!partial || body.originalPrice !== undefined) {
    data.originalPrice = body.originalPrice == null ? 0 : parsePrice(body.originalPrice, '划线价')
  }
  if (!partial || body.images !== undefined) {
    data.images = normalizeMedia(body.images || [], '图片', MAX_IMAGES)
  }
  if (!partial || body.videos !== undefined) {
    data.videos = normalizeMedia(body.videos || [], '视频', MAX_VIDEOS)
  }
  if (!partial || body.description !== undefined) {
    data.description = String(body.description == null ? '' : body.description).trim().slice(0, 2000)
  }
  if (!partial || body.spec !== undefined) {
    data.spec = cleanText(body.spec, 50)
  }
  if (!partial || body.productionDate !== undefined) {
    data.productionDate = cleanText(body.productionDate, 20)
  }
  if (!partial || body.origin !== undefined) {
    data.origin = cleanText(body.origin, 50)
  }
  if (!partial || body.status !== undefined) {
    const status = String(body.status || '')
    if (!['ON', 'OFF'].includes(status)) throw new HttpError(400, '商品状态不合法')
    data.status = status
  }
  if (!partial || body.sort !== undefined) {
    data.sort = parseSort(body.sort == null ? 0 : body.sort)
  }
  return data
}

async function setupStatus() {
  try {
    const res = await db.collection('users').where({ type: 'GLY' }).count()
    return { needSetup: res.total === 0 }
  } catch (err) {
    return { needSetup: true, warning: friendlyDbError(err) }
  }
}

async function createUserRecord(body) {
  const phone = validatePhone(body.phone)
  const existing = await getUserByPhone(phone)
  if (existing) throw new HttpError(400, '该手机号已存在')

  const type = validateUserType(body.type || 'KH')
  const name = requireText(body.name, '姓名', 20)
  const password = validateNewPassword(body.password)
  const { passwordSalt, passwordHash } = hashPassword(password)
  const shopName = cleanText(body.shopName, 50)
  const address = cleanText(body.address, 200)
  let salesId = ''
  let productIds = []
  if (type === 'KH') {
    if (!shopName) throw new HttpError(400, '客户类型必须填写门店名称')
    if (!address) throw new HttpError(400, '客户类型必须填写收货地址')
    salesId = await validateSalesId(body.salesId, null, true)
    productIds = await validateBoundProductIds(body.productIds)
  }

  const now = new Date()
  const record = {
    phone,
    name,
    type,
    shopName,
    address,
    salesId,
    productIds,
    enabled: body.enabled !== false,
    passwordSalt,
    passwordHash,
    createdAt: now,
    updatedAt: now
  }
  const res = await db.collection('users').add({ data: record })
  return { _id: res._id, ...record }
}

async function setup(body) {
  const setupCode = process.env.SETUP_CODE || ''
  if (!setupCode) throw new HttpError(500, '云函数未配置 SETUP_CODE 环境变量')
  if (!safeEqual(String(body.setupCode || ''), setupCode)) {
    throw new HttpError(401, '初始化校验码错误')
  }
  const countRes = await db.collection('users').where({ type: 'GLY' }).count()
  if (countRes.total > 0) throw new HttpError(400, '管理员已初始化，请直接登录')

  const user = await createUserRecord({
    phone: body.phone,
    name: body.name,
    password: body.password,
    type: 'GLY'
  })
  return {
    token: issueToken(user, ADMIN_TTL_MS),
    user: sanitizeUser(user),
    expiresIn: ADMIN_TTL_MS / 1000
  }
}

async function login(body) {
  const phone = validatePhone(body.phone)
  const user = await getUserByPhone(phone)
  if (!user || !verifyPassword(body.password, user.passwordSalt, user.passwordHash)) {
    throw new HttpError(401, '手机号或密码错误')
  }
  if (user.enabled === false) throw new HttpError(403, '账号已停用')
  if (!['GLY', 'XS', 'YY'].includes(user.type)) {
    throw new HttpError(403, '客户账号请在小程序登录')
  }

  await db
    .collection('users')
    .doc(user._id)
    .update({ data: { lastLoginAt: new Date() } })
    .catch(err => console.warn('update lastLoginAt failed', err))

  return {
    token: issueToken(user, ADMIN_TTL_MS),
    user: sanitizeUser(user),
    expiresIn: ADMIN_TTL_MS / 1000
  }
}

async function listUsers(query) {
  const type = String(query.type || '').trim()
  if (type && !USER_TYPES.includes(type)) throw new HttpError(400, '用户类型不合法')
  const keyword = String(query.keyword || '').trim()

  let where = {}
  if (keyword) {
    const reg = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    const branches = [{ name: reg }, { phone: reg }, { shopName: reg }]
    if (type) branches.forEach(branch => { branch.type = type })
    where = _.or(branches)
  } else if (type) {
    where = { type }
  }

  const page = toInt(query.page, 1, 1, 100000)
  const pageSize = toInt(query.pageSize, 10, 1, 100)
  const [countRes, listRes] = await Promise.all([
    db.collection('users').where(where).count(),
    db.collection('users').where(where).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ])

  const salesMap = await getSalesMap(listRes.data.map(user => user.salesId))
  const list = listRes.data.map(user => ({
    ...sanitizeUser(user),
    salesName: (salesMap[user.salesId] || {}).name || ''
  }))

  return { list, total: countRes.total, page, pageSize }
}

async function listSales() {
  const res = await db.collection('users').where({ type: 'XS', enabled: true }).limit(200).get()
  return {
    list: res.data.map(user => ({ _id: user._id, name: user.name, phone: user.phone }))
  }
}

async function createUser(body) {
  const user = await createUserRecord(body)
  const salesMap = await getSalesMap(user.salesId ? [user.salesId] : [])
  return {
    user: { ...sanitizeUser(user), salesName: (salesMap[user.salesId] || {}).name || '' }
  }
}

async function updateUser(id, body, admin) {
  const current = await getUserById(id)
  if (!current) throw new HttpError(404, '用户不存在')

  const nextType = body.type !== undefined ? validateUserType(body.type) : current.type
  const nextEnabled = body.enabled !== undefined ? Boolean(body.enabled) : current.enabled !== false
  if (String(id) === String(admin._id)) {
    if (nextType !== 'GLY') throw new HttpError(400, '不能修改自己的管理员类型')
    if (!nextEnabled) throw new HttpError(400, '不能停用当前登录账号')
  }

  const phone = body.phone !== undefined ? validatePhone(body.phone) : current.phone
  if (phone !== current.phone) {
    const other = await getUserByPhone(phone)
    if (other && String(other._id) !== String(id)) throw new HttpError(400, '该手机号已被使用')
  }

  const salesId = nextType === 'KH'
    ? await validateSalesId(body.salesId !== undefined ? body.salesId : current.salesId, id, true)
    : ''

  const nextShopName = body.shopName !== undefined ? cleanText(body.shopName, 50) : (current.shopName || '')
  const nextAddress = body.address !== undefined ? cleanText(body.address, 200) : (current.address || '')
  if (nextType === 'KH') {
    if (!nextShopName) throw new HttpError(400, '客户类型必须填写门店名称')
    if (!nextAddress) throw new HttpError(400, '客户类型必须填写收货地址')
  }
  const nextProductIds = nextType === 'KH'
    ? (body.productIds !== undefined
      ? await validateBoundProductIds(body.productIds)
      : (Array.isArray(current.productIds) ? current.productIds.map(String) : []))
    : []

  const data = {
    phone,
    name: body.name !== undefined ? requireText(body.name, '姓名', 20) : current.name,
    shopName: nextShopName,
    address: nextAddress,
    type: nextType,
    salesId,
    productIds: nextProductIds,
    enabled: nextEnabled,
    updatedAt: new Date()
  }
  await db.collection('users').doc(String(id)).update({ data })
  const salesMap = await getSalesMap(salesId ? [salesId] : [])
  return {
    user: { ...sanitizeUser({ ...current, ...data }), salesName: (salesMap[salesId] || {}).name || '' }
  }
}

async function resetUserPassword(id, body) {
  const user = await getUserById(id)
  if (!user) throw new HttpError(404, '用户不存在')
  const rawPassword = body.password === undefined || body.password === '' ? '123456' : body.password
  const password = validateNewPassword(rawPassword)
  const { passwordSalt, passwordHash } = hashPassword(password)
  await db.collection('users').doc(String(id)).update({
    data: { passwordSalt, passwordHash, updatedAt: new Date() }
  })
  return { ok: true }
}

async function withOrderImageUrls(orders) {
  const fileList = []
  orders.forEach(order => {
    ;(order.items || []).forEach(item => {
      if (isCloudFile(item.image)) fileList.push(item.image)
    })
  })
  const urlMap = await getTempUrlMap(fileList)
  return orders.map(order => ({
    ...order,
    items: (order.items || []).map(item => ({
      ...item,
      imageUrl: urlMap[item.image] || (isCloudFile(item.image) ? '' : item.image || '')
    }))
  }))
}

async function listOrders(query, staff) {
  const status = String(query.status || '').trim()
  if (status && !ORDER_STATUS.includes(status)) {
    throw new HttpError(400, '订单状态不合法')
  }
  const salesId = staff.type === 'XS' ? String(staff._id) : String(query.salesId || '').trim()
  const keyword = String(query.keyword || '').trim()

  let where = {}
  if (keyword) {
    const reg = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    const branches = [{ customerName: reg }, { phone: reg }, { orderNo: reg }, { shopName: reg }]
    if (status) branches.forEach(branch => { branch.status = status })
    if (salesId) branches.forEach(branch => { branch.salesId = salesId })
    where = _.or(branches)
  } else {
    if (status) where.status = status
    if (salesId) where.salesId = salesId
  }

  const page = toInt(query.page, 1, 1, 100000)
  const pageSize = toInt(query.pageSize, 10, 1, 100)
  const [countRes, listRes] = await Promise.all([
    db.collection('orders').where(where).count(),
    db.collection('orders').where(where).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ])

  return {
    list: await withOrderImageUrls(listRes.data.map(serializeOrder)),
    total: countRes.total,
    page,
    pageSize
  }
}

async function getOrderDoc(id) {
  try {
    const res = await db.collection('orders').doc(String(id)).get()
    return res.data
  } catch (err) {
    return null
  }
}

async function getOrder(id, staff) {
  const order = await getOrderDoc(id)
  if (!order) throw new HttpError(404, '订单不存在')
  if (staff.type === 'XS' && order.salesId !== staff._id) {
    throw new HttpError(403, '无权查看该订单')
  }
  const [withUrl] = await withOrderImageUrls([serializeOrder(order)])
  return { order: withUrl }
}

async function cancelOrder(id) {
  const order = await getOrderDoc(id)
  if (!order) throw new HttpError(404, '订单不存在')
  if (order.status === 'CANCELLED') {
    const [withUrl] = await withOrderImageUrls([serializeOrder(order)])
    return { order: withUrl }
  }

  const now = new Date()
  await db.collection('orders').doc(String(id)).update({
    data: { status: 'CANCELLED', updatedAt: now }
  })

  await Promise.all(
    (order.items || []).map(item =>
      db.collection('products').doc(item.productId).update({
        data: { sales: _.inc(-Number(item.quantity || 0)), updatedAt: now }
      }).catch(err => console.warn('rollback sales failed', err))
    )
  )

  const updatedOrder = await withOrderImageUrls([
    serializeOrder({ ...order, status: 'CANCELLED', updatedAt: now })
  ])
  return { order: updatedOrder[0] }
}

async function getProductsByIds(ids) {
  const uniqueIds = Array.from(new Set((ids || []).map(String).filter(Boolean)))
  const map = {}
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const chunk = uniqueIds.slice(index, index + 100)
    if (!chunk.length) continue
    const res = await db.collection('products').where({ _id: _.in(chunk) }).limit(chunk.length).get()
    res.data.forEach(product => {
      map[product._id] = product
    })
  }
  return map
}

async function listProducts(query) {
  const page = toInt(query && query.page, 1, 1, 100000)
  const pageSize = toInt(query && query.pageSize, 20, 1, 100)
  const keyword = String((query && query.keyword) || '').trim()
  const categoryId = String((query && query.categoryId) || '').trim()
  const simple = String((query && query.simple) || '') === '1'
  const ids = String((query && query.ids) || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  const uniqueIds = Array.from(new Set(ids)).slice(0, 100)

  let where = {}
  if (uniqueIds.length) {
    where._id = _.in(uniqueIds)
  } else {
    if (keyword) where.name = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    if (categoryId) where.categoryId = categoryId
  }

  let listQuery = db.collection('products').where(where)
  if (!uniqueIds.length) {
    listQuery = listQuery.orderBy('sort', 'asc').orderBy('createdAt', 'desc')
  }
  const skip = uniqueIds.length ? 0 : (page - 1) * pageSize
  const limit = uniqueIds.length ? uniqueIds.length : pageSize

  const [countRes, listRes] = await Promise.all([
    db.collection('products').where(where).count(),
    listQuery.skip(skip).limit(limit).get()
  ])
  const products = listRes.data.map(serializeProduct)
  return {
    list: simple ? products : await withTempUrls(products),
    total: countRes.total,
    page,
    pageSize
  }
}

async function createProduct(body, staff) {
  const data = await validateProductPayload(body, false)
  const now = new Date()
  const record = {
    ...data,
    videos: data.videos || [],
    code: await generateUniqueProductCode(),
    sales: 0,
    createdAt: now,
    updatedAt: now
  }
  const addRes = await db.collection('products').add({ data: record })
  const product = serializeProduct({ _id: addRes._id, ...record })
  const [withUrl] = await withTempUrls([product])
  const auditWarning = await writeAuditLog({
    ...auditBase(staff, 'PRODUCT_CREATE', 'product', addRes._id, record.name),
    before: null,
    after: auditProductSnapshot(record)
  })
  return auditWarning ? { product: withUrl, auditWarning } : { product: withUrl }
}

async function updateProduct(id, body, staff) {
  const existing = await getProductById(id)
  if (!existing) throw new HttpError(404, '商品不存在')
  const before = auditProductSnapshot(existing)
  const data = await validateProductPayload(body, true)
  data.updatedAt = new Date()
  await db.collection('products').doc(String(id)).update({ data })
  const mergedDoc = { ...existing, ...data }
  const merged = serializeProduct(mergedDoc)
  const [withUrl] = await withTempUrls([merged])
  const auditWarning = await writeAuditLog({
    ...auditBase(staff, 'PRODUCT_UPDATE', 'product', id, mergedDoc.name),
    before,
    after: auditProductSnapshot(mergedDoc)
  })
  return auditWarning ? { product: withUrl, auditWarning } : { product: withUrl }
}

async function deleteProduct(id, staff) {
  const existing = await getProductById(id)
  if (!existing) throw new HttpError(404, '商品不存在')
  const before = auditProductSnapshot(existing)
  await db.collection('products').doc(String(id)).remove()
  const auditWarning = await writeAuditLog({
    ...auditBase(staff, 'PRODUCT_DELETE', 'product', id, existing.name),
    before,
    after: null
  })
  return auditWarning ? { ok: true, auditWarning } : { ok: true }
}

async function listCategories() {
  const res = await db.collection('categories').limit(200).get()
  const list = sortBySort(res.data).map(item => ({
    _id: item._id,
    name: item.name,
    sort: Number(item.sort) || 0,
    enabled: item.enabled !== false
  }))
  return { list }
}

async function createCategory(body, staff) {
  const now = new Date()
  const data = {
    name: requireText(body.name, '分类名称', 20),
    sort: body.sort == null ? 0 : parseSort(body.sort),
    enabled: body.enabled !== false,
    createdAt: now,
    updatedAt: now
  }
  const res = await db.collection('categories').add({ data })
  const auditWarning = await writeAuditLog({
    ...auditBase(staff, 'CATEGORY_CREATE', 'category', res._id, data.name),
    before: null,
    after: auditCategorySnapshot(data)
  })
  return auditWarning
    ? { category: { _id: res._id, ...data }, auditWarning }
    : { category: { _id: res._id, ...data } }
}

async function updateCategory(id, body, staff) {
  let existing = null
  try {
    const res = await db.collection('categories').doc(String(id)).get()
    existing = res.data
  } catch (err) {
    existing = null
  }
  if (!existing) throw new HttpError(404, '分类不存在')

  const data = {}
  if (body.name !== undefined) data.name = requireText(body.name, '分类名称', 20)
  if (body.sort !== undefined) data.sort = parseSort(body.sort)
  if (body.enabled !== undefined) data.enabled = body.enabled !== false
  data.updatedAt = new Date()
  await db.collection('categories').doc(String(id)).update({ data })
  const merged = { ...existing, ...data }
  const auditWarning = await writeAuditLog({
    ...auditBase(staff, 'CATEGORY_UPDATE', 'category', id, merged.name),
    before: auditCategorySnapshot(existing),
    after: auditCategorySnapshot(merged)
  })
  return auditWarning
    ? { category: merged, auditWarning }
    : { category: merged }
}

async function deleteCategory(id, staff) {
  let existing = null
  try {
    const res = await db.collection('categories').doc(String(id)).get()
    existing = res.data
  } catch (err) {
    existing = null
  }
  if (!existing) throw new HttpError(404, '分类不存在')
  const productCount = await db.collection('products').where({ categoryId: String(id) }).count()
  if (productCount.total > 0) {
    throw new HttpError(400, '该分类下还有商品，请先移动或删除商品')
  }
  await db.collection('categories').doc(String(id)).remove()
  const auditWarning = await writeAuditLog({
    ...auditBase(staff, 'CATEGORY_DELETE', 'category', id, existing.name),
    before: auditCategorySnapshot(existing),
    after: null
  })
  return auditWarning ? { ok: true, auditWarning } : { ok: true }
}

function resolveAuditRange(query) {
  const dayMs = 24 * 60 * 60 * 1000
  const rawStart = query && query.start
  const rawEnd = query && query.end
  const hasStart = rawStart !== undefined && rawStart !== ''
  const hasEnd = rawEnd !== undefined && rawEnd !== ''

  if (!hasStart && !hasEnd) {
    const now = new Date()
    const offset = 8 * 60 * 60 * 1000
    const local = new Date(now.getTime() + offset)
    const todayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset
    return { start: todayStart - 6 * dayMs, end: now.getTime() }
  }
  if (!hasStart || !hasEnd) throw new HttpError(400, '日志查询时间范围不合法')

  const start = Number(rawStart)
  const end = Number(rawEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end) {
    throw new HttpError(400, '日志查询时间范围不合法')
  }
  if (Math.ceil((end - start) / dayMs) > 14) {
    throw new HttpError(400, '日志查询范围不能超过两周')
  }
  return { start, end }
}

async function listAuditLogs(query) {
  const page = toInt(query && query.page, 1, 1, 100000)
  const pageSize = toInt(query && query.pageSize, 20, 1, 100)
  const action = String((query && query.action) || '').trim()
  const resource = String((query && query.resource) || '').trim()
  const resourceId = String((query && query.resourceId) || '').trim()
  const keyword = String((query && query.keyword) || '').trim().slice(0, 50)
  if (action && !AUDIT_ACTIONS.includes(action)) throw new HttpError(400, '操作类型不合法')
  if (resource && !['product', 'category'].includes(resource)) throw new HttpError(400, '日志对象类型不合法')
  const range = resolveAuditRange(query)

  const where = {
    createdAt: _.gte(new Date(range.start)).and(_.lte(new Date(range.end)))
  }
  if (action) where.action = action
  if (resource) where.resource = resource
  if (resourceId) where.resourceId = resourceId
  if (keyword) where.resourceName = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })

  try {
    const [countRes, listRes] = await Promise.all([
      db.collection('audit_logs').where(where).count(),
      db
        .collection('audit_logs')
        .where(where)
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
    ])
    return {
      list: listRes.data.map(item => ({ ...item, createdAt: toTimestamp(item.createdAt) })),
      total: countRes.total,
      page,
      pageSize,
      range
    }
  } catch (err) {
    console.warn('read audit logs failed', err)
    return {
      list: [],
      total: 0,
      page,
      pageSize,
      range,
      warning: '操作日志集合尚未创建或读取失败'
    }
  }
}

async function listCustomers(staff, query) {
  const isSales = staff.type === 'XS'
  const requestedSalesId = String(query.salesId || '').trim()
  const salesId = isSales ? String(staff._id) : requestedSalesId
  const userWhere = salesId ? { type: 'KH', salesId } : { type: 'KH' }
  const [userRes, orderRes] = await Promise.all([
    db.collection('users').where(userWhere).limit(1000).get(),
    db.collection('orders').where({ status: 'DONE' }).orderBy('createdAt', 'desc').limit(1000).get()
  ])

  const map = new Map()
  userRes.data.forEach(user => {
    map.set(user._id, {
      userId: user._id,
      name: user.name,
      phone: user.phone,
      shopName: user.shopName || '',
      address: user.address || '',
      salesId: user.salesId || '',
      enabled: user.enabled !== false,
      orderCount: 0,
      totalAmount: 0,
      lastOrderAt: 0,
      lastOrderNo: ''
    })
  })

  orderRes.data.forEach(order => {
    const entry = map.get(order.userId)
    if (!entry) return
    entry.orderCount += 1
    entry.totalAmount += Number(order.totalAmount) || 0
    if (!entry.lastOrderAt) {
      entry.lastOrderAt = toTimestamp(order.createdAt)
      entry.lastOrderNo = order.orderNo || ''
    }
  })

  const salesMap = await getSalesMap(Array.from(map.values()).map(entry => entry.salesId))
  const list = Array.from(map.values())
    .map(entry => ({ ...entry, salesName: (salesMap[entry.salesId] || {}).name || '' }))
    .sort((a, b) => b.lastOrderAt - a.lastOrderAt || String(a.name).localeCompare(String(b.name)))

  return {
    list,
    total: list.length,
    truncated: userRes.data.length >= 1000 || orderRes.data.length >= 1000
  }
}

function resolveReportRange(query) {
  const rawStart = query && query.start
  const rawEnd = query && query.end
  const hasStart = rawStart !== undefined && rawStart !== ''
  const hasEnd = rawEnd !== undefined && rawEnd !== ''
  const dayMs = 24 * 60 * 60 * 1000

  if (!hasStart && !hasEnd) {
    const now = new Date()
    const offset = 8 * 60 * 60 * 1000
    const local = new Date(now.getTime() + offset)
    const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset
    return { start, end: now.getTime() }
  }
  if (!hasStart || !hasEnd) throw new HttpError(400, '统计时间范围不合法')

  const start = Number(rawStart)
  const end = Number(rawEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end) {
    throw new HttpError(400, '统计时间范围不合法')
  }
  if (Math.ceil((end - start) / dayMs) > 366) {
    throw new HttpError(400, '统计时间跨度不能超过一年')
  }
  return { start, end }
}

async function getReports(query) {
  const range = resolveReportRange(query)
  const orderWhere = {
    status: 'DONE',
    createdAt: _.gte(new Date(range.start)).and(_.lte(new Date(range.end)))
  }

  const countRes = await db.collection('orders').where(orderWhere).count()
  const maxFetch = 3000
  const target = Math.min(countRes.total, maxFetch)
  const pageSize = 1000
  const pages = Math.ceil(target / pageSize)
  const orders = []

  if (pages > 0) {
    const requests = []
    for (let index = 0; index < pages; index += 1) {
      requests.push(
        db
          .collection('orders')
          .where(orderWhere)
          .orderBy('createdAt', 'desc')
          .skip(index * pageSize)
          .limit(pageSize)
          .get()
      )
    }
    const results = await Promise.all(requests)
    results.forEach(result => {
      orders.push(...result.data)
    })
  }

  const productMap = new Map()
  const customerMap = new Map()
  const salesMap = new Map()
  let totalAmount = 0
  let totalItems = 0

  orders.forEach(order => {
    const amount = Number(order.totalAmount) || 0
    totalAmount += amount

    const seenProducts = new Set()
    ;(order.items || []).forEach(item => {
      const quantity = Number(item.quantity) || 0
      totalItems += quantity
      const key = item.productId || item.name || 'unknown'
      let stat = productMap.get(key)
      if (!stat) {
        stat = {
          productId: item.productId || '',
          name: item.name || '商品',
          quantity: 0,
          orderCount: 0,
          amount: 0
        }
        productMap.set(key, stat)
      }
      stat.quantity += quantity
      stat.amount += (Number(item.price) || 0) * quantity
      if (!seenProducts.has(key)) {
        stat.orderCount += 1
        seenProducts.add(key)
      }
    })

    if (order.userId) {
      let customer = customerMap.get(order.userId)
      if (!customer) {
        customer = {
          userId: order.userId,
          name: order.customerName || '未填写',
          phone: order.phone || '',
          shopName: order.shopName || '',
          orderCount: 0,
          totalAmount: 0,
          lastOrderAt: 0
        }
        customerMap.set(order.userId, customer)
      }
      customer.orderCount += 1
      customer.totalAmount += amount
      customer.lastOrderAt = Math.max(customer.lastOrderAt, toTimestamp(order.createdAt))
    }

    if (order.salesId) {
      let sales = salesMap.get(order.salesId)
      if (!sales) {
        sales = {
          salesId: order.salesId,
          name: order.salesName || '未命名销售',
          phone: '',
          orderCount: 0,
          totalAmount: 0,
          customerIds: new Set()
        }
        salesMap.set(order.salesId, sales)
      }
      sales.orderCount += 1
      sales.totalAmount += amount
      if (order.userId) sales.customerIds.add(order.userId)
    }
  })

  const productList = Array.from(productMap.values())
  const customerList = Array.from(customerMap.values())
  const salesList = Array.from(salesMap.values()).map(sales => ({
    salesId: sales.salesId,
    name: sales.name,
    phone: sales.phone,
    orderCount: sales.orderCount,
    totalAmount: sales.totalAmount,
    customerCount: sales.customerIds.size
  }))

  return {
    range,
    summary: {
      orderCount: orders.length,
      totalAmount,
      totalItems,
      customerCount: customerMap.size,
      productCount: productMap.size,
      salesCount: salesList.length
    },
    topProducts: productList
      .slice()
      .sort((a, b) => b.quantity - a.quantity || b.amount - a.amount)
      .slice(0, 10),
    bottomProducts: productList
      .slice()
      .sort((a, b) => a.quantity - b.quantity || a.amount - b.amount)
      .slice(0, 10),
    topCustomers: customerList
      .slice()
      .sort((a, b) => b.orderCount - a.orderCount || b.totalAmount - a.totalAmount)
      .slice(0, 10),
    bottomCustomers: customerList
      .slice()
      .sort((a, b) => a.orderCount - b.orderCount || a.totalAmount - b.totalAmount)
      .slice(0, 10),
    salesRanking: salesList
      .slice()
      .sort((a, b) => b.totalAmount - a.totalAmount || b.orderCount - a.orderCount)
      .slice(0, 10),
    truncated: countRes.total > orders.length
  }
}

async function listCarts(staff, query) {
  const isSales = staff.type === 'XS'
  const salesId = isSales ? String(staff._id) : String(query.salesId || '').trim()
  const keyword = String(query.keyword || '').trim()
  const page = toInt(query.page, 1, 1, 100000)
  const pageSize = toInt(query.pageSize, 10, 1, 100)

  const userQuery = isSales
    ? db.collection('users').where({ type: 'KH', salesId: staff._id })
    : db.collection('users')
  const userRes = await userQuery.limit(1000).get()
  const userMap = {}
  userRes.data.forEach(user => {
    userMap[user._id] = user
  })

  const cartRes = await db.collection('carts').orderBy('updatedAt', 'desc').limit(500).get()
  const cartProductIds = []
  cartRes.data.forEach(cart => {
    ;(cart.items || []).forEach(item => {
      if (item.productId) cartProductIds.push(item.productId)
    })
  })
  const productMap = await getProductsByIds(cartProductIds)

  const list = cartRes.data
    .filter(cart => Array.isArray(cart.items) && cart.items.length && userMap[cart.userId])
    .map(cart => {
      const user = userMap[cart.userId]
      const items = cart.items.map(item => {
        const product = productMap[item.productId]
        return {
          productId: item.productId,
          name: product ? product.name : '商品已删除',
          price: product ? Number(product.price) || 0 : 0,
          quantity: Number(item.quantity) || 0,
          checked: item.checked !== false,
          onSale: Boolean(product && product.status === 'ON')
        }
      })
      return {
        _id: cart._id,
        userId: cart.userId,
        userName: user.name || '',
        phone: user.phone || '',
        shopName: user.shopName || '',
        address: user.address || '',
        salesId: user.salesId || '',
        items,
        hasOffSale: items.some(item => !item.onSale),
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        totalAmount: items
          .filter(item => item.onSale)
          .reduce((sum, item) => sum + item.price * item.quantity, 0),
        updatedAt: toTimestamp(cart.updatedAt)
      }
    })
    .filter(cart => {
      if (salesId && cart.salesId !== salesId) return false
      if (!keyword) return true
      return `${cart.userName}${cart.phone}${cart.shopName}`.indexOf(keyword) >= 0
    })

  const salesMap = await getSalesMap(list.map(cart => cart.salesId))
  list.forEach(cart => {
    cart.salesName = (salesMap[cart.salesId] || {}).name || ''
  })

  return {
    list: list.slice((page - 1) * pageSize, page * pageSize),
    total: list.length,
    page,
    pageSize
  }
}

async function uploadImage(body, headers) {
  let buffer = null
  let contentType = String(
    (headers && (headers['content-type'] || headers['Content-Type'])) || 'image/jpeg'
  )

  if (Buffer.isBuffer(body)) {
    buffer = body
  } else {
    const base64 = String((body && body.base64) || '').replace(/^data:[^,]+,/, '')
    if (!base64) throw new HttpError(400, '缺少图片数据')
    buffer = Buffer.from(base64, 'base64')
    if (body && body.contentType) contentType = String(body.contentType)
  }

  if (!buffer || !buffer.length) throw new HttpError(400, '图片数据无效')
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(400, '图片超过 2MB，请压缩后再上传')
  }

  contentType = contentType.split(';')[0].trim().toLowerCase()
  if (buffer[0] === 0xff && buffer[1] === 0xd8) contentType = 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) contentType = 'image/png'

  const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
  const ext = extMap[contentType] || 'jpg'
  const cloudPath = `mall/products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer })
  let url = ''
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
    url = (urlRes.fileList[0] || {}).tempFileURL || ''
  } catch (err) {
    console.warn('getTempFileURL failed', err)
  }
  return { fileID: uploadRes.fileID, url }
}

async function uploadVideoChunk(body, query) {
  const data = Buffer.isBuffer(body) ? {} : (body || {})
  const uploadId = String((query && query.uploadId) || data.uploadId || '')
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(uploadId)) {
    throw new HttpError(400, '上传会话不合法')
  }
  const index = Number(query && query.index !== undefined ? query.index : data.index)
  const totalChunks = Number(
    query && query.totalChunks !== undefined ? query.totalChunks : data.totalChunks
  )
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_VIDEO_CHUNKS) {
    throw new HttpError(400, '视频分片数量不合法')
  }
  if (!Number.isInteger(index) || index < 0 || index >= totalChunks) {
    throw new HttpError(400, '视频分片序号不合法')
  }

  let buffer = null
  if (Buffer.isBuffer(body)) {
    buffer = body
  } else {
    const base64 = String((body && body.base64) || '').replace(/^data:[^,]+,/, '')
    if (!base64) throw new HttpError(400, '缺少分片数据')
    buffer = Buffer.from(base64, 'base64')
  }
  if (!buffer || !buffer.length) throw new HttpError(400, '分片数据无效')
  if (buffer.length > MAX_CHUNK_BYTES) throw new HttpError(400, '单个分片过大')

  const cloudPath = `mall/tmp/${uploadId}/${String(index).padStart(4, '0')}`
  const res = await cloud.uploadFile({ cloudPath, fileContent: buffer })
  return { fileID: res.fileID, index, totalChunks }
}

async function completeVideo(body) {
  if (Number(body.size) > MAX_VIDEO_BYTES) {
    throw new HttpError(400, '视频不能超过 40MB')
  }
  const fileIDs = Array.isArray(body.fileIDs) ? body.fileIDs.map(String) : []
  if (!fileIDs.length || fileIDs.length > MAX_VIDEO_CHUNKS) {
    throw new HttpError(400, '视频分片缺失，请重新上传')
  }
  fileIDs.forEach(fileID => {
    if (!isCloudFile(fileID) || !fileID.includes('/mall/tmp/')) {
      throw new HttpError(400, '视频分片地址不合法')
    }
  })

  const buffers = []
  let totalBytes = 0
  for (const fileID of fileIDs) {
    const res = await cloud.downloadFile({ fileID })
    const buffer = res.fileContent
    if (!buffer || !buffer.length) throw new HttpError(400, '视频分片读取失败，请重试')
    totalBytes += buffer.length
    if (totalBytes > MAX_VIDEO_BYTES) {
      throw new HttpError(400, '视频不能超过 40MB')
    }
    buffers.push(buffer)
  }

  const extMap = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v'
  }
  const ext = extMap[String(body.contentType || '')] || 'mp4'
  const cloudPath = `mall/videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.concat(buffers, totalBytes)
  })

  await cloud
    .deleteFile({ fileList: fileIDs.slice(0, 50) })
    .catch(err => console.warn('delete video chunks failed', err))
  if (fileIDs.length > 50) {
    await cloud
      .deleteFile({ fileList: fileIDs.slice(50) })
      .catch(err => console.warn('delete video chunks failed', err))
  }

  let url = ''
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
    url = (urlRes.fileList[0] || {}).tempFileURL || ''
  } catch (err) {
    console.warn('getTempFileURL failed', err)
  }

  return { fileID: uploadRes.fileID, url, size: totalBytes }
}

async function generateQrcode(body) {
  const type = body.type === 'product' ? 'product' : 'home'
  const envVersion = ['release', 'trial', 'develop'].includes(body.envVersion) ? body.envVersion : 'release'
  let scene = 'home'
  let page = 'pages/products/index'

  if (type === 'product') {
    const code = String(body.productCode || '').trim()
    if (!code) throw new HttpError(400, '请选择要生成二维码的商品')
    scene = `p=${code}`
    if (scene.length > 32) throw new HttpError(400, '商品码超过 32 个字符，无法生成小程序码')
    page = 'pages/product/index'
  }

  const res = await cloud.openapi.wxacode.getUnlimited({
    scene,
    page,
    checkPath: false,
    envVersion,
    width: 430
  })
  const buffer = res && res.buffer
  if (!buffer) throw new Error('小程序码生成失败，请稍后重试')
  return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}` }
}

async function route({ method, path, query, headers, body }) {
  if (method === 'GET' && path === '/health') {
    return { ok: true, service: 'wx-mall-api', time: Date.now() }
  }
  if (method === 'GET' && path === '/setup/status') {
    return setupStatus()
  }
  if (method === 'POST' && path === '/setup') {
    return setup(body)
  }
  if (method === 'POST' && path === '/login') {
    return login(body)
  }

  const staff = await requireStaff(headers)
  const isAdmin = staff.type === 'GLY'
  const isOps = staff.type === 'YY'
  const canViewSalesData = isAdmin || staff.type === 'XS'
  const segments = path.split('/').filter(Boolean)
  const resource = segments[0] || ''
  const id = segments[1] || ''

  if (method === 'GET' && path === '/me') {
    return { user: sanitizeUser(staff) }
  }

  if (resource === 'orders') {
    if (!canViewSalesData) throw new HttpError(403, '无权查看订单')
    if (method === 'GET' && !id) return listOrders(query, staff)
    if (method === 'GET' && id) return getOrder(id, staff)
    if (method === 'PATCH' && id) {
      if (!isAdmin) throw new HttpError(403, '仅管理员可取消订单')
      return cancelOrder(id)
    }
  }
  if (resource === 'customers' && method === 'GET') {
    if (!canViewSalesData) throw new HttpError(403, '无权查看客户')
    return listCustomers(staff, query)
  }
  if (resource === 'carts' && method === 'GET') {
    if (!canViewSalesData) throw new HttpError(403, '无权查看购物车')
    return listCarts(staff, query)
  }

  if (resource === 'products') {
    if (!isAdmin && !isOps) throw new HttpError(403, '无权操作商品')
    if (method === 'GET' && !id) return listProducts(query)
    if (method === 'POST' && !id) return createProduct(body, staff)
    if (method === 'PUT' && id) return updateProduct(id, body, staff)
    if (method === 'DELETE' && id) return deleteProduct(id, staff)
  }
  if (resource === 'categories') {
    if (!isAdmin && !isOps) throw new HttpError(403, '无权管理分类')
    if (method === 'GET' && !id) return listCategories()
    if (method === 'POST' && !id) return createCategory(body, staff)
    if (method === 'PUT' && id) return updateCategory(id, body, staff)
    if (method === 'DELETE' && id) return deleteCategory(id, staff)
  }
  if (resource === 'upload') {
    if (!isAdmin && !isOps) throw new HttpError(403, '无权上传文件')
    if (method === 'POST' && !id) return uploadImage(body, headers)
    if (method === 'POST' && id === 'chunk') return uploadVideoChunk(body, query)
    if (method === 'POST' && id === 'video') return completeVideo(body)
  }

  if (!isAdmin) {
    throw new HttpError(403, '仅管理员可操作')
  }

  if (resource === 'audit-logs' && method === 'GET') {
    return listAuditLogs(query)
  }

  if (resource === 'reports' && method === 'GET') {
    return getReports(query)
  }

  if (resource === 'users') {
    if (method === 'GET' && !id) return listUsers(query)
    if (method === 'GET' && id === 'sales') return listSales()
    if (method === 'POST' && !id) return createUser(body)
    if (method === 'PUT' && id) return updateUser(id, body, staff)
    if (method === 'POST' && id && segments[2] === 'password') return resetUserPassword(id, body)
  }
  if (resource === 'settings') {
    if (method === 'GET') return { settings: await getSettings() }
    if (method === 'PUT') return { settings: await saveSettings(body) }
  }
  if (resource === 'qrcode' && method === 'POST') {
    return generateQrcode(body)
  }

  throw new HttpError(404, '接口不存在')
}

async function handleHttp(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  const method = String(event.httpMethod || 'GET').toUpperCase()
  const path = normalizePath(event.path)
  const query = event.queryStringParameters || {}
  const headers = event.headers || {}

  try {
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? parseBody(event) : {}
    const data = await route({ method, path, query, headers, body })
    return response(200, data)
  } catch (err) {
    if (err instanceof HttpError) {
      return response(err.status, { error: err.message })
    }
    if (err instanceof AppError) {
      return response(err.status || 400, { error: err.message, code: err.code })
    }
    if (err && err.setup) {
      return response(500, { error: err.message })
    }
    console.error('[http]', method, path, err)
    return response(500, { error: friendlyDbError(err) })
  }
}

module.exports = { handleHttp }

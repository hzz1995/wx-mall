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
const { buildOrderExport, parseSheetRows } = require('../lib/excel')
const {
  listShops,
  createShop,
  updateShop,
  deleteShop,
  setDefaultShop,
  listShopsForUsers,
  pickDefaultShop
} = require('../lib/shops')
const {
  getSettings,
  saveSettings,
  serializeProduct,
  serializeOrder,
  sortBySort,
  withTempUrls,
  getTempUrlMap,
  randomCode,
  generateUniqueProductCode,
  getProductById,
  isCloudFile,
  toTimestamp
} = require('../lib/store')

const ORDER_STATUS = ['DONE', 'CLOSED', 'CANCELLED']
const USER_TYPES = ['KH', 'XS', 'GLY', 'YY']
const MAX_IMAGES = 4
const MAX_VIDEOS = 2
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const MAX_VIDEO_BYTES = 40 * 1024 * 1024
const MAX_VIDEO_CHUNKS = 64
const MAX_CHUNK_BYTES = 3 * 1024 * 1024
const MAX_BOUND_CATEGORIES = 100
const MAX_EXPORT_SELECTED = 100
const MAX_IMPORT_ROWS = 2000
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
    categoryIds: Array.isArray(product.categoryIds) && product.categoryIds.length
      ? product.categoryIds.map(String)
      : (product.categoryId ? [String(product.categoryId)] : []),
    price: Number(product.price) || 0,
    originalPrice: Number(product.originalPrice) || 0,
    images: Array.isArray(product.images) ? product.images : [],
    videos: Array.isArray(product.videos) ? product.videos : [],
    description: product.description || '',
    spec: product.spec || '',
    unit: product.unit || '',
    productCode: product.productCode || '',
    validUntil: product.validUntil || '',
    productionDate: product.productionDate || '',
    origin: product.origin || '',
    sort: Number(product.sort) || 0,
    status: product.status || 'ON',
    code: product.code || '',
    initialSales: Number(product.initialSales) || 0,
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

function parseInitialSales(value) {
  const sales = Number(value)
  if (!Number.isInteger(sales) || sales < 0 || sales > 99999999) {
    throw new HttpError(400, '初始化已售数量需为 0-99999999 的整数')
  }
  return sales
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

async function validateBoundCategoryIds(value) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new HttpError(400, '可售分类格式不正确')
  const ids = Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
  if (ids.length > MAX_BOUND_CATEGORIES) {
    throw new HttpError(400, `每个客户最多绑定 ${MAX_BOUND_CATEGORIES} 个分类`)
  }
  if (!ids.length) return []
  const res = await db.collection('categories').where({ _id: _.in(ids) }).limit(MAX_BOUND_CATEGORIES).get()
  const found = new Set(res.data.map(item => String(item._id)))
  return ids.filter(id => found.has(id))
}

async function validateProductPayload(body, partial) {
  const data = {}
  if (!partial || body.name !== undefined) {
    data.name = requireText(body.name, '商品名称', 50)
  }
  if (!partial || body.categoryIds !== undefined || body.categoryId !== undefined) {
    const raw = body.categoryIds !== undefined
      ? body.categoryIds
      : (body.categoryId ? [body.categoryId] : [])
    if (!Array.isArray(raw)) throw new HttpError(400, '商品分类格式不正确')
    const categoryIds = Array.from(new Set(raw.map(item => String(item || '').trim()).filter(Boolean)))
    if (!categoryIds.length) throw new HttpError(400, '请选择商品分类')
    if (categoryIds.length > 20) throw new HttpError(400, '一个商品最多选择 20 个分类')
    const res = await db.collection('categories').where({ _id: _.in(categoryIds) }).limit(categoryIds.length).get()
    if (res.data.length !== categoryIds.length) throw new HttpError(400, '部分所选分类不存在')
    data.categoryIds = categoryIds
    data.categoryId = categoryIds[0]
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
  if (!partial || body.unit !== undefined) {
    data.unit = cleanText(body.unit, 20)
  }
  if (!partial || body.productCode !== undefined) {
    data.productCode = cleanText(body.productCode, 50)
  }
  if (!partial || body.validUntil !== undefined) {
    data.validUntil = cleanText(body.validUntil, 20)
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
  if (!partial || body.initialSales !== undefined) {
    data.initialSales = parseInitialSales(body.initialSales == null ? 0 : body.initialSales)
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
  let categoryIds = []
  if (type === 'KH') {
    if (!shopName) throw new HttpError(400, '客户类型必须填写首个店铺名称')
    if (!address) throw new HttpError(400, '客户类型必须填写首个店铺收货地址')
    salesId = await validateSalesId(body.salesId, null, true)
    categoryIds = await validateBoundCategoryIds(body.categoryIds)
  }

  const now = new Date()
  const record = {
    phone,
    name,
    type,
    salesId,
    categoryIds,
    shopCount: 0,
    enabled: body.enabled !== false,
    passwordSalt,
    passwordHash,
    createdAt: now,
    updatedAt: now
  }
  const res = await db.collection('users').add({ data: record })
  if (type === 'KH') {
    try {
      await createShop(res._id, { shopName, address })
    } catch (err) {
      await db.collection('users').doc(String(res._id)).remove().catch(() => null)
      throw err
    }
  }
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
  if (user.enabled === false || user.deleted === true) throw new HttpError(403, '账号已停用')
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

  let where = { deleted: _.neq(true) }
  if (keyword) {
    const reg = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    const branches = [
      { name: reg, deleted: _.neq(true) },
      { phone: reg, deleted: _.neq(true) }
    ]
    try {
      const shopRes = await db.collection('shops').where({ shopName: reg }).limit(1000).get()
      const shopUserIds = Array.from(new Set(shopRes.data.map(shop => String(shop.userId))))
      if (shopUserIds.length) branches.push({ _id: _.in(shopUserIds), deleted: _.neq(true) })
    } catch (err) {
      console.warn('search shops failed', err)
    }
    if (type) branches.forEach(branch => { branch.type = type })
    where = _.or(branches)
  } else if (type) {
    where = { type, deleted: _.neq(true) }
  }

  const page = toInt(query.page, 1, 1, 100000)
  const pageSize = toInt(query.pageSize, 10, 1, 100)
  const [countRes, listRes] = await Promise.all([
    db.collection('users').where(where).count(),
    db.collection('users').where(where).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ])

  const salesMap = await getSalesMap(listRes.data.map(user => user.salesId))
  const shopMap = await listShopsForUsers(listRes.data.map(user => user._id))
  const list = listRes.data.map(user => {
    const shops = shopMap[user._id] || []
    const defaultShop = pickDefaultShop(shops)
    return {
      ...sanitizeUser(user),
      salesName: (salesMap[user.salesId] || {}).name || '',
      shops,
      defaultShopId: defaultShop ? defaultShop._id : '',
      shopName: defaultShop ? defaultShop.shopName : '',
      address: defaultShop ? defaultShop.address : '',
      shopCount: shops.length
    }
  })

  return { list, total: countRes.total, page, pageSize }
}

async function listSales() {
  const res = await db.collection('users').where({ type: 'XS', enabled: true }).limit(200).get()
  return {
    list: res.data.map(user => ({ _id: user._id, name: user.name, phone: user.phone }))
  }
}

async function decorateUser(user) {
  const shops = user.type === 'KH' ? await listShops(user._id) : []
  const defaultShop = pickDefaultShop(shops)
  const salesMap = await getSalesMap(user.salesId ? [user.salesId] : [])
  return {
    ...sanitizeUser(user),
    salesName: (salesMap[user.salesId] || {}).name || '',
    shops,
    defaultShopId: defaultShop ? defaultShop._id : '',
    shopName: defaultShop ? defaultShop.shopName : '',
    address: defaultShop ? defaultShop.address : '',
    shopCount: shops.length
  }
}

async function listShopOptions(staff, query) {
  const isSales = staff.type === 'XS'
  const userWhere = isSales
    ? { type: 'KH', salesId: staff._id, deleted: _.neq(true) }
    : { type: 'KH', deleted: _.neq(true) }
  const keyword = String(query.keyword || '').trim()
  const userRes = await db.collection('users').where(userWhere).limit(1000).get()
  const shopMap = await listShopsForUsers(userRes.data.map(user => user._id))
  const list = []
  userRes.data.forEach(user => {
    ;(shopMap[user._id] || []).forEach(shop => {
      list.push({
        _id: shop._id,
        shopName: shop.shopName,
        address: shop.address,
        enabled: shop.enabled !== false,
        userId: user._id,
        customerName: user.name || '',
        phone: user.phone || ''
      })
    })
  })
  const filtered = keyword
    ? list.filter(item => `${item.shopName}${item.customerName}${item.phone}`.indexOf(keyword) >= 0)
    : list
  filtered.sort((a, b) => String(a.shopName).localeCompare(String(b.shopName)))
  return { list: filtered, truncated: userRes.data.length >= 1000 }
}

async function createUser(body) {
  const user = await createUserRecord(body)
  return { user: await decorateUser(user) }
}

async function createCustomer(staff, body) {
  if (staff.type !== 'GLY' && staff.type !== 'XS') {
    throw new HttpError(403, '无权创建客户')
  }
  const salesId = staff.type === 'XS' ? String(staff._id) : body.salesId
  const user = await createUserRecord({
    phone: body.phone,
    name: body.name,
    password: body.password,
    type: 'KH',
    shopName: body.shopName,
    address: body.address,
    salesId,
    categoryIds: staff.type === 'GLY' ? body.categoryIds : [],
    enabled: body.enabled
  })
  return { user: await decorateUser(user) }
}

async function updateUser(id, body, admin) {
  const current = await getUserById(id)
  if (!current || current.deleted === true) throw new HttpError(404, '用户不存在')

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

  const nextCategoryIds = nextType === 'KH'
    ? (body.categoryIds !== undefined
      ? await validateBoundCategoryIds(body.categoryIds)
      : (Array.isArray(current.categoryIds) ? current.categoryIds.map(String) : []))
    : []

  const data = {
    phone,
    name: body.name !== undefined ? requireText(body.name, '姓名', 20) : current.name,
    type: nextType,
    salesId,
    categoryIds: nextCategoryIds,
    enabled: nextEnabled,
    updatedAt: new Date()
  }
  await db.collection('users').doc(String(id)).update({ data })
  return { user: await decorateUser({ ...current, ...data }) }
}

async function deleteOrder(id) {
  const order = await getOrderDoc(id)
  if (!order) throw new HttpError(404, '订单不存在')
  if (order.status !== 'CANCELLED' && !order.isDemo) {
    const now = new Date()
    await Promise.all(
      (order.items || []).map(item =>
        db.collection('products').doc(item.productId).update({
          data: { sales: _.inc(-Number(item.quantity || 0)), updatedAt: now }
        }).catch(err => console.warn('rollback sales failed', err))
      )
    )
  }
  await db.collection('orders').doc(String(id)).remove()
  return { ok: true, orderId: id }
}

async function removeWhere(collectionName, where) {
  let removed = 0
  for (let round = 0; round < 20; round += 1) {
    const res = await db.collection(collectionName).where(where).limit(100).get()
    if (!res.data.length) break
    await Promise.all(
      res.data.map(doc => db.collection(collectionName).doc(String(doc._id)).remove().catch(() => null))
    )
    removed += res.data.length
    if (res.data.length < 100) break
  }
  return removed
}

async function deleteUser(id, admin) {
  if (String(id) === String(admin._id)) throw new HttpError(400, '不能删除当前登录账号')
  const user = await getUserById(id)
  if (!user || user.deleted === true) throw new HttpError(404, '用户不存在')
  const now = new Date()

  try {
    await removeWhere('shops', { userId: String(id) })
  } catch (err) {
    console.warn('remove user shops failed', err)
  }
  try {
    await removeWhere('carts', { userId: String(id) })
  } catch (err) {
    console.warn('remove user carts failed', err)
  }

  if (user.type === 'XS') {
    for (let round = 0; round < 20; round += 1) {
      const res = await db.collection('users').where({
        type: 'KH',
        salesId: String(id),
        deleted: _.neq(true)
      }).limit(100).get()
      if (!res.data.length) break
      await Promise.all(
        res.data.map(item =>
          db.collection('users').doc(String(item._id)).update({
            data: { salesId: '', updatedAt: now }
          })
        )
      )
      if (res.data.length < 100) break
    }
  }

  await db.collection('users').doc(String(id)).update({
    data: {
      deleted: true,
      enabled: false,
      deletedAt: now,
      deletedPhone: user.phone || '',
      phone: `deleted_${String(id)}`,
      passwordSalt: '',
      passwordHash: '',
      shopCount: 0,
      updatedAt: now
    }
  })
  return { ok: true, userId: id, softDeleted: true }
}

async function resetUserPassword(id, body) {
  const user = await getUserById(id)
  if (!user || user.deleted === true) throw new HttpError(404, '用户不存在')
  const rawPassword = body.password === undefined || body.password === '' ? '123456' : body.password
  const password = validateNewPassword(rawPassword)
  const { passwordSalt, passwordHash } = hashPassword(password)
  await db.collection('users').doc(String(id)).update({
    data: { passwordSalt, passwordHash, updatedAt: new Date() }
  })
  return { ok: true }
}

async function changeStaffPassword(staff, body) {
  if (!verifyPassword(body.oldPassword, staff.passwordSalt, staff.passwordHash)) {
    throw new HttpError(400, '原密码不正确')
  }
  const password = validateNewPassword(body.newPassword)
  if (password === String(body.oldPassword || '')) {
    throw new HttpError(400, '新密码不能与原密码相同')
  }
  const { passwordSalt, passwordHash } = hashPassword(password)
  const updatedAt = new Date()
  await db.collection('users').doc(String(staff._id)).update({
    data: { passwordSalt, passwordHash, updatedAt }
  })
  const token = issueToken({ ...staff, passwordSalt, passwordHash, updatedAt }, ADMIN_TTL_MS)
  return { ok: true, token, expiresIn: ADMIN_TTL_MS / 1000 }
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

function buildOrderWhere(query, staff) {
  const status = String(query.status || '').trim()
  if (status && !ORDER_STATUS.includes(status)) {
    throw new HttpError(400, '订单状态不合法')
  }
  const orderType = String(query.orderType || '').trim() || 'normal'
  if (!['normal', 'demo', 'all'].includes(orderType)) {
    throw new HttpError(400, '订单类型不合法')
  }
  const salesId = staff.type === 'XS' ? String(staff._id) : String(query.salesId || '').trim()
  const shopId = String(query.shopId || '').trim()
  const keyword = String(query.keyword || '').trim()
  const demoFilter = orderType === 'demo' ? true : (orderType === 'normal' ? _.neq(true) : null)

  if (keyword) {
    const reg = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    const branches = [{ customerName: reg }, { phone: reg }, { orderNo: reg }, { shopName: reg }]
    if (status) branches.forEach(branch => { branch.status = status })
    if (salesId) branches.forEach(branch => { branch.salesId = salesId })
    if (shopId) branches.forEach(branch => { branch.shopId = shopId })
    if (demoFilter !== null) branches.forEach(branch => { branch.isDemo = demoFilter })
    return _.or(branches)
  }
  const where = {}
  if (status) where.status = status
  if (salesId) where.salesId = salesId
  if (shopId) where.shopId = shopId
  if (demoFilter !== null) where.isDemo = demoFilter
  return where
}

async function listOrders(query, staff) {
  const where = buildOrderWhere(query, staff)
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

async function exportOrders(query, staff) {
  const ids = Array.from(new Set(
    String(query.ids || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  ))
  if (!ids.length) throw new HttpError(400, '请选择要导出的订单')
  if (ids.length > MAX_EXPORT_SELECTED) {
    throw new HttpError(400, `一次最多导出 ${MAX_EXPORT_SELECTED} 单`)
  }

  const where = { _id: _.in(ids) }
  if (staff.type === 'XS') where.salesId = String(staff._id)
  const res = await db.collection('orders').where(where).limit(ids.length).get()
  if (!res.data.length) throw new HttpError(400, '没有可导出的订单')
  const orders = res.data
    .slice()
    .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
  await attachOrderProductCodes(orders)

  return {
    ...buildOrderExport(orders),
    orderCount: orders.length
  }
}

async function attachOrderProductCodes(orders) {
  const ids = []
  ;(orders || []).forEach(order => {
    ;(order.items || []).forEach(item => {
      if (item.productId && !item.productCode) ids.push(item.productId)
    })
  })
  if (!ids.length) return
  const productMap = await getProductsByIds(ids)
  ;(orders || []).forEach(order => {
    order.items = (order.items || []).map(item => ({
      ...item,
      productCode: item.productCode || (productMap[item.productId] && productMap[item.productId].productCode) || ''
    }))
  })
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

async function updateOrderStatus(id, status) {
  const order = await getOrderDoc(id)
  if (!order) throw new HttpError(404, '订单不存在')
  if (order.status === status) {
    const [withUrl] = await withOrderImageUrls([serializeOrder(order)])
    return { order: withUrl }
  }
  if (order.status !== 'DONE') {
    throw new HttpError(400, status === 'CLOSED' ? '当前订单状态不能关闭' : '当前订单状态不能取消')
  }

  const now = new Date()
  const data = { status, updatedAt: now }
  if (status === 'CLOSED') {
    data.closedAt = now
  } else {
    data.cancelledAt = now
  }
  await db.collection('orders').doc(String(id)).update({ data })

  if (status === 'CANCELLED' && !order.isDemo) {
    await Promise.all(
      (order.items || []).map(item =>
        db.collection('products').doc(item.productId).update({
          data: { sales: _.inc(-Number(item.quantity || 0)), updatedAt: now }
        }).catch(err => console.warn('rollback sales failed', err))
      )
    )
  }

  const updatedOrder = await withOrderImageUrls([
    serializeOrder({ ...order, ...data })
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
    const reg = keyword
      ? db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
      : null
    if (keyword && categoryId) {
      where = _.or([
        { name: reg, categoryId },
        { name: reg, categoryIds: _.in([categoryId]) },
        { productCode: reg, categoryId },
        { productCode: reg, categoryIds: _.in([categoryId]) }
      ])
    } else if (keyword) {
      where = _.or([{ name: reg }, { productCode: reg }])
    } else if (categoryId) {
      where = _.or([
        { categoryId },
        { categoryIds: _.in([categoryId]) }
      ])
    }
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

async function ensureUniqueProductCode(productCode, excludeId) {
  const code = String(productCode || '').trim()
  if (!code) return
  const res = await db.collection('products').where({ productCode: code }).limit(2).get()
  const conflict = res.data.find(item => String(item._id) !== String(excludeId || ''))
  if (conflict) throw new HttpError(400, `商品编码「${code}」已存在`)
}

async function createProduct(body, staff) {
  const data = await validateProductPayload(body, false)
  await ensureUniqueProductCode(data.productCode)
  const now = new Date()
  const record = {
    ...data,
    videos: data.videos || [],
    code: await generateUniqueProductCode(),
    sales: Number(data.initialSales) || 0,
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
  if (data.productCode !== undefined) {
    await ensureUniqueProductCode(data.productCode, id)
  }
  const oldInitialSales = Number(existing.initialSales) || 0
  const salesDelta = data.initialSales !== undefined ? data.initialSales - oldInitialSales : 0
  const now = new Date()
  const updateData = { ...data, updatedAt: now }
  if (salesDelta !== 0) updateData.sales = _.inc(salesDelta)
  await db.collection('products').doc(String(id)).update({ data: updateData })
  const mergedDoc = { ...existing, ...data, updatedAt: now }
  if (salesDelta !== 0) {
    mergedDoc.sales = Math.max(0, (Number(existing.sales) || 0) + salesDelta)
  }
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

function normalizeBatchValue(field, value) {
  if (field === 'status') {
    const status = String(value || '')
    if (!['ON', 'OFF'].includes(status)) throw new HttpError(400, '商品状态不合法')
    return status
  }
  if (field === 'price') return parsePrice(value, '售价')
  if (field === 'originalPrice') return parsePrice(value, '划线价')
  if (field === 'validUntil' || field === 'productionDate') return cleanText(value, 20)
  if (field === 'origin') return cleanText(value, 50)
  if (field === 'spec') return cleanText(value, 50)
  if (field === 'unit') return cleanText(value, 20)
  if (field === 'sort') return parseSort(value)
  if (field === 'images') return normalizeMedia(value, '图片', MAX_IMAGES)
  throw new HttpError(400, '不支持批量修改该属性')
}

async function batchUpdateProducts(body, staff) {
  const field = String(body.field || '').trim()
  let updates = []
  if (Array.isArray(body.updates)) {
    updates = body.updates
      .map(item => ({
        id: String((item && (item.id || item._id)) || '').trim(),
        value: item && item.value
      }))
      .filter(item => item.id)
  } else {
    const ids = Array.isArray(body.ids) ? body.ids : []
    updates = ids
      .map(id => ({ id: String(id || '').trim(), value: body.value }))
      .filter(item => item.id)
  }

  const updateMap = new Map()
  updates.forEach(item => updateMap.set(item.id, item.value))
  if (!updateMap.size) throw new HttpError(400, '请选择要修改的商品')
  if (updateMap.size > 100) throw new HttpError(400, '一次最多批量修改 100 件商品')

  const normalized = Array.from(updateMap.entries()).map(([id, value]) => ({
    id,
    value: normalizeBatchValue(field, value)
  }))
  const ids = normalized.map(item => item.id)

  const res = await db.collection('products').where({ _id: _.in(ids) }).limit(ids.length).get()
  if (!res.data.length) throw new HttpError(404, '所选商品不存在')
  const productMap = new Map(res.data.map(product => [String(product._id), product]))
  const now = new Date()
  let auditWarning = ''
  let updated = 0

  await Promise.all(normalized.map(async item => {
    const product = productMap.get(item.id)
    if (!product) return
    const before = auditProductSnapshot(product)
    await db.collection('products').doc(String(product._id)).update({
      data: { [field]: item.value, updatedAt: now }
    })
    updated += 1
    const afterProduct = { ...product, [field]: item.value, updatedAt: now }
    const warning = await writeAuditLog({
      ...auditBase(staff, 'PRODUCT_UPDATE', 'product', product._id, product.name),
      before,
      after: auditProductSnapshot(afterProduct)
    })
    if (warning && !auditWarning) auditWarning = warning
  }))

  return auditWarning ? { updated, auditWarning } : { updated }
}

function importCell(row, aliases) {
  const keys = Object.keys(row || {})
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias]
  }
  const normalized = {}
  keys.forEach(key => {
    normalized[String(key).replace(/^\ufeff/, '').replace(/\s+/g, '')] = row[key]
  })
  for (const alias of aliases) {
    const key = String(alias).replace(/^\ufeff/, '').replace(/\s+/g, '')
    if (Object.prototype.hasOwnProperty.call(normalized, key)) return normalized[key]
  }
  return ''
}

function isEmptyImportCell(value) {
  return value == null || (typeof value === 'string' && !value.trim())
}

function parseImportPrice(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label}格式不正确`)
    const cents = Math.round(value * 100)
    if (cents > 99999999) throw new Error(`${label}超出范围`)
    return cents
  }
  const text = String(value == null ? '' : value).replace(/[¥￥,，\s]/g, '')
  if (!text) return null
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`${label}格式不正确`)
  const cents = Math.round(Number(text) * 100)
  if (!Number.isInteger(cents) || cents < 0 || cents > 99999999) {
    throw new Error(`${label}超出范围`)
  }
  return cents
}

function formatImportValue(field, value) {
  if (field === 'price' || field === 'originalPrice') {
    return `¥${(Number(value || 0) / 100).toFixed(2)}`
  }
  return String(value == null || value === '' ? '—' : value)
}

async function importProducts(body, staff) {
  const base64 = String((body && body.fileBase64) || '').replace(/^data:[^,]+,/, '')
  if (!base64) throw new HttpError(400, '请选择导入文件')
  let buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch (err) {
    throw new HttpError(400, '导入文件格式不正确')
  }
  if (!buffer || !buffer.length) throw new HttpError(400, '导入文件为空')
  if (buffer.length > 5 * 1024 * 1024) throw new HttpError(400, '导入文件不能超过 5MB')

  let rawRows
  try {
    rawRows = parseSheetRows(buffer)
  } catch (err) {
    throw new HttpError(400, `无法解析导入文件：${err.message}`)
  }
  rawRows = (rawRows || []).filter(row => row && Object.keys(row).some(key => !isEmptyImportCell(row[key])))
  if (!rawRows.length) throw new HttpError(400, '导入文件没有数据')
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new HttpError(400, `一次最多导入 ${MAX_IMPORT_ROWS} 行`)
  }
  if (body.metaOnly === true) {
    const seenCodes = new Set()
    const duplicateCodes = []
    rawRows.forEach((row, index) => {
      const productCode = cleanText(importCell(row, ['商品编码', '编码', 'productCode']), 50)
      if (!productCode) return
      if (seenCodes.has(productCode)) {
        duplicateCodes.push({ row: index + 2, productCode })
      } else {
        seenCodes.add(productCode)
      }
    })
    return { totalRows: rawRows.length, duplicateCodes }
  }
  const defaultCategoryId = String(body.defaultCategoryId || '').trim()
  if (defaultCategoryId && (body.rowOffset === undefined || Number(body.rowOffset) === 0)) {
    const category = await db.collection('categories').doc(defaultCategoryId).get().catch(() => null)
    if (!category || !category.data) throw new HttpError(400, '默认分类不存在')
  }

  const errors = []
  const prepared = []
  const seenCodes = new Set()
  const rawRowOffset = Number(body.rowOffset)
  const rowOffset = Number.isFinite(rawRowOffset) && rawRowOffset > 0 ? Math.floor(rawRowOffset) : 0
  const rawRowLimit = Number(body.rowLimit)
  const rowLimit = Number.isFinite(rawRowLimit) && rawRowLimit > 0
    ? Math.min(50, Math.floor(rawRowLimit))
    : rawRows.length
  const selectedRows = body.rowOffset !== undefined
    ? rawRows.slice(rowOffset, rowOffset + rowLimit)
    : rawRows
  selectedRows.forEach((row, index) => {
    const rowNo = rowOffset + index + 2
    try {
      const productCode = cleanText(importCell(row, ['商品编码', '编码', 'productCode']), 50)
      if (!productCode) throw new Error('缺少商品编码')
      if (seenCodes.has(productCode)) throw new Error(`商品编码「${productCode}」在文件中重复`)
      seenCodes.add(productCode)

      const changes = {}
      const name = importCell(row, ['商品名称', '名称', 'name'])
      let nameValue = ''
      if (!isEmptyImportCell(name)) {
        nameValue = requireText(name, '商品名称', 50)
        changes.name = nameValue
      }
      const spec = importCell(row, ['规格', '规格型号', 'spec'])
      if (!isEmptyImportCell(spec)) changes.spec = cleanText(spec, 50)
      const unit = importCell(row, ['单位', 'unit'])
      if (!isEmptyImportCell(unit)) changes.unit = cleanText(unit, 20)
      const originalPrice = importCell(row, ['原价', '划线价', 'originalPrice'])
      if (!isEmptyImportCell(originalPrice)) {
        changes.originalPrice = parseImportPrice(originalPrice, '原价')
      }
      const price = importCell(row, ['售价', '价格', 'price'])
      if (!isEmptyImportCell(price)) {
        changes.price = parseImportPrice(price, '售价')
      }
      prepared.push({ rowNo, productCode, nameValue, changes })
    } catch (err) {
      errors.push({ row: rowNo, message: err.message })
    }
  })

  const codes = Array.from(new Set(prepared.map(item => item.productCode)))
  const productMap = new Map()
  const duplicateProductCodes = new Set()
  for (let start = 0; start < codes.length; start += 100) {
    const chunk = codes.slice(start, start + 100)
    const res = await db.collection('products').where({ productCode: _.in(chunk) }).limit(1000).get()
    res.data.forEach(product => {
      const code = String(product.productCode || '')
      if (!code) return
      if (productMap.has(code)) duplicateProductCodes.add(code)
      else productMap.set(code, product)
    })
  }

  const nameCandidates = Array.from(new Set(
    prepared
      .filter(item => !productMap.has(item.productCode) && item.nameValue)
      .map(item => item.nameValue)
  ))
  const nameMap = new Map()
  for (let start = 0; start < nameCandidates.length; start += 100) {
    const chunk = nameCandidates.slice(start, start + 100)
    const res = await db.collection('products').where({ name: _.in(chunk) }).limit(1000).get()
    res.data.forEach(product => {
      const name = String(product.name || '')
      if (!nameMap.has(name)) nameMap.set(name, [])
      nameMap.get(name).push(product)
    })
  }

  const preview = []
  const tasks = []
  const usedProducts = new Set()
  let matched = 0
  let unchanged = 0
  let createdCount = 0
  let updatedCount = 0
  prepared.forEach(item => {
    if (duplicateProductCodes.has(item.productCode)) {
      errors.push({ row: item.rowNo, message: `商品编码「${item.productCode}」对应多个商品` })
      return
    }
    let product = productMap.get(item.productCode)
    if (!product && item.nameValue) {
      const candidates = (nameMap.get(item.nameValue) || []).filter(candidate => {
        return !String(candidate.productCode || '').trim() && !usedProducts.has(String(candidate._id))
      })
      if (candidates.length === 1) {
        product = candidates[0]
        item.changes.productCode = item.productCode
      } else if (candidates.length > 1) {
        errors.push({
          row: item.rowNo,
          message: `商品名称「${item.nameValue}」匹配到多个无编码商品，请先维护商品编码`
        })
        return
      }
    }

    const labels = {
      productCode: '商品编码',
      name: '商品名称',
      spec: '规格',
      unit: '单位',
      originalPrice: '原价',
      price: '售价'
    }

    if (!product) {
      if (!item.nameValue) {
        errors.push({ row: item.rowNo, message: '商品不存在，且缺少商品名称，无法新增' })
        return
      }
      if (item.changes.price === undefined) {
        errors.push({ row: item.rowNo, message: '新商品缺少售价，无法新增' })
        return
      }
      const createChanges = { ...item.changes, productCode: item.productCode }
      const changeText = Object.keys(createChanges)
        .map(field => `${labels[field]}：— → ${formatImportValue(field, createChanges[field])}`)
        .join('；')
      preview.push({
        row: item.rowNo,
        productCode: item.productCode,
        productName: item.nameValue,
        action: 'create',
        changeText
      })
      createdCount += 1
      tasks.push({ type: 'create', rowNo: item.rowNo, changes: createChanges })
      return
    }

    usedProducts.add(String(product._id))
    matched += 1
    const fields = Object.keys(item.changes)
    if (!fields.length) {
      unchanged += 1
      preview.push({
        row: item.rowNo,
        productCode: item.productCode,
        productName: product.name || '',
        action: 'unchanged',
        changeText: '无变化'
      })
      return
    }
    const changeText = fields
      .map(field => `${labels[field]}：${formatImportValue(field, product[field])} → ${formatImportValue(field, item.changes[field])}`)
      .join('；')
    preview.push({
      row: item.rowNo,
      productCode: item.productCode,
      productName: product.name || '',
      action: 'update',
      changeText
    })
    updatedCount += 1
    tasks.push({ type: 'update', rowNo: item.rowNo, changes: item.changes, product })
  })

  const summary = {
    total: rawRows.length,
    processedRows: selectedRows.length,
    matched,
    created: createdCount,
    updated: updatedCount,
    unchanged,
    taskTotal: tasks.length,
    errors
  }
  if (body.dryRun !== false) {
    const previewLimit = 500
    return {
      ...summary,
      dryRun: true,
      preview: preview.slice(0, previewLimit),
      previewTotal: preview.length,
      previewTruncated: preview.length > previewLimit
    }
  }

  const now = new Date()
  const chunk = tasks
  const chunkErrors = []
  let applied = 0
  let createdApplied = 0

  const updateChunk = chunk.filter(task => task.type === 'update')
  const createChunk = chunk.filter(task => task.type === 'create')

  for (let start = 0; start < updateChunk.length; start += 20) {
    await Promise.all(updateChunk.slice(start, start + 20).map(async task => {
      try {
        await db.collection('products').doc(String(task.product._id)).update({
          data: { ...task.changes, updatedAt: now }
        })
        applied += 1
      } catch (err) {
        chunkErrors.push({ row: task.rowNo, message: err.message || '更新失败' })
      }
    }))
  }
  for (let start = 0; start < createChunk.length; start += 20) {
    await Promise.all(createChunk.slice(start, start + 20).map(async task => {
      try {
        const changes = task.changes
        await db.collection('products').add({
          data: {
            productCode: changes.productCode,
            name: changes.name,
            spec: changes.spec || '',
            unit: changes.unit || '',
            originalPrice: changes.originalPrice == null ? 0 : changes.originalPrice,
            price: changes.price,
            categoryIds: defaultCategoryId ? [defaultCategoryId] : [],
            categoryId: defaultCategoryId || '',
            images: [],
            videos: [],
            description: '',
            status: 'ON',
            code: randomCode(),
            initialSales: 0,
            sales: 0,
            sort: 0,
            createdAt: now,
            updatedAt: now
          }
        })
        createdApplied += 1
      } catch (err) {
        chunkErrors.push({ row: task.rowNo, message: err.message || '新增失败' })
      }
    }))
  }
  if (rowOffset + selectedRows.length >= rawRows.length) {
    writeAuditLog({
      ...auditBase(staff, 'PRODUCT_UPDATE', 'product', 'import', body.filename || '商品导入'),
      before: null,
      after: {
        rowOffset,
        rowLimit,
        processedRows: selectedRows.length,
        created: createdApplied,
        updated: applied,
        taskTotal: tasks.length
      }
    }).catch(err => console.warn('write import audit failed', err))
  }
  return {
    dryRun: false,
    rowOffset,
    rowLimit,
    processedRows: selectedRows.length,
    totalRows: rawRows.length,
    updated: applied,
    created: createdApplied,
    errors: errors.concat(chunkErrors)
  }
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
  const productCount = await db.collection('products').where(_.or([
    { categoryId: String(id) },
    { categoryIds: _.in([String(id)]) }
  ])).count()
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
  const userWhere = salesId
    ? { type: 'KH', salesId, deleted: _.neq(true) }
    : { type: 'KH', deleted: _.neq(true) }
  const [userRes, orderRes] = await Promise.all([
    db.collection('users').where(userWhere).limit(1000).get(),
    db.collection('orders').where({ status: _.in(['DONE', 'CLOSED']), isDemo: _.neq(true) }).orderBy('createdAt', 'desc').limit(1000).get()
  ])

  const map = new Map()
  const shopMap = await listShopsForUsers(userRes.data.map(user => user._id))
  userRes.data.forEach(user => {
    const shops = shopMap[user._id] || []
    const defaultShop = pickDefaultShop(shops)
    map.set(user._id, {
      userId: user._id,
      name: user.name,
      phone: user.phone,
      shopName: defaultShop ? defaultShop.shopName : '',
      address: defaultShop ? defaultShop.address : '',
      shops,
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
  const salesId = String((query && query.salesId) || '').trim()
  const shopId = String((query && query.shopId) || '').trim()
  const shopName = String((query && query.shopName) || '').trim().slice(0, 50)
  const orderWhere = {
    status: _.in(['DONE', 'CLOSED']),
    isDemo: _.neq(true),
    createdAt: _.gte(new Date(range.start)).and(_.lte(new Date(range.end)))
  }
  if (salesId) orderWhere.salesId = salesId
  if (shopId) orderWhere.shopId = shopId
  if (shopName) orderWhere.shopName = db.RegExp({ regexp: escapeRegExp(shopName), options: 'i' })

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
    ? db.collection('users').where({ type: 'KH', salesId: staff._id, deleted: _.neq(true) })
    : db.collection('users').where({ type: 'KH', deleted: _.neq(true) })
  const userRes = await userQuery.limit(1000).get()
  const userMap = {}
  userRes.data.forEach(user => {
    userMap[user._id] = user
  })
  const shopMap = await listShopsForUsers(userRes.data.map(user => user._id))

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
      const shops = shopMap[cart.userId] || []
      const shop = shops.find(item => String(item._id) === String(cart.shopId)) || pickDefaultShop(shops)
      const items = cart.items.map(item => {
        const product = productMap[item.productId]
        return {
          productId: item.productId,
          name: product ? product.name : '商品已删除',
          spec: product ? product.spec || '' : '',
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
        shopId: shop ? shop._id : '',
        shopName: shop ? shop.shopName : '',
        address: shop ? shop.address : '',
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
  if (method === 'POST' && path === '/me/password') {
    return changeStaffPassword(staff, body)
  }

  if (resource === 'orders') {
    if (!canViewSalesData) throw new HttpError(403, '无权查看订单')
    if (method === 'GET' && id === 'export') return exportOrders(query, staff)
    if (method === 'GET' && !id) return listOrders(query, staff)
    if (method === 'GET' && id) return getOrder(id, staff)
    if (method === 'PATCH' && id) {
      if (!isAdmin) throw new HttpError(403, '仅管理员可操作订单状态')
      const status = String((body && body.status) || '').toUpperCase()
      if (!['CANCELLED', 'CLOSED'].includes(status)) {
        throw new HttpError(400, '订单状态不合法')
      }
      return updateOrderStatus(id, status)
    }
    if (method === 'DELETE' && id) {
      if (!isAdmin) throw new HttpError(403, '仅管理员可删除订单')
      return deleteOrder(id)
    }
  }
  if (resource === 'customers') {
    if (!canViewSalesData) throw new HttpError(403, '无权操作客户')
    if (method === 'GET' && !id) return listCustomers(staff, query)
    if (method === 'POST' && !id) return createCustomer(staff, body)
  }
  if (resource === 'carts' && method === 'GET') {
    if (!canViewSalesData) throw new HttpError(403, '无权查看购物车')
    return listCarts(staff, query)
  }

  if (resource === 'shops' && method === 'GET') {
    if (!canViewSalesData) throw new HttpError(403, '无权查看店铺')
    return listShopOptions(staff, query)
  }

  if (resource === 'products') {
    if (!isAdmin && !isOps) throw new HttpError(403, '无权操作商品')
    if (method === 'GET' && !id) return listProducts(query)
    if (method === 'POST' && id === 'batch') return batchUpdateProducts(body, staff)
    if (method === 'POST' && id === 'import') return importProducts(body, staff)
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
    if (segments[2] === 'shops') {
      const target = await getUserById(id)
      if (!target || target.type !== 'KH' || target.deleted === true) throw new HttpError(404, '客户不存在')
      const shopId = segments[3] || ''
      const action = segments[4] || ''
      if (method === 'GET' && !shopId) {
        const shops = await listShops(id)
        const defaultShop = pickDefaultShop(shops)
        return { shops, defaultShopId: defaultShop ? defaultShop._id : '' }
      }
      if (method === 'POST' && !shopId) {
        const shop = await createShop(id, body)
        return { shop, shops: await listShops(id) }
      }
      if (method === 'PUT' && shopId) {
        const shop = await updateShop(id, shopId, body)
        return { shop, shops: await listShops(id) }
      }
      if (method === 'DELETE' && shopId) {
        await deleteShop(id, shopId)
        return { shops: await listShops(id) }
      }
      if (method === 'POST' && shopId && action === 'default') {
        const shop = await setDefaultShop(id, shopId)
        return { shop, shops: await listShops(id) }
      }
    }
    if (method === 'GET' && !id) return listUsers(query)
    if (method === 'GET' && id === 'sales') return listSales()
    if (method === 'POST' && !id) return createUser(body)
    if (method === 'PUT' && id) return updateUser(id, body, staff)
    if (method === 'DELETE' && id && !segments[2]) return deleteUser(id, staff)
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

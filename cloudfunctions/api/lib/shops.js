const { db } = require('./context')

const MAX_SHOPS = 20

function cleanText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength)
}

function normalizeInput(body, partial) {
  const data = {}
  if (!partial || body.shopName !== undefined) {
    const shopName = cleanText(body.shopName, 50)
    if (!shopName) throw new Error('请填写店铺名称')
    data.shopName = shopName
  }
  if (!partial || body.address !== undefined) {
    const address = cleanText(body.address, 200)
    if (!address) throw new Error('请填写收货地址')
    data.address = address
  }
  if (!partial || body.contactName !== undefined) {
    data.contactName = cleanText(body.contactName, 20)
  }
  if (!partial || body.phone !== undefined) {
    data.phone = cleanText(body.phone, 20)
  }
  if (body.enabled !== undefined) {
    data.enabled = Boolean(body.enabled)
  }
  return data
}

function sortShops(shops) {
  return shops.slice().sort((a, b) => {
    if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? -1 : 1
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  })
}

async function listShops(userId, { enabledOnly = false } = {}) {
  if (!userId) return []
  const where = { userId: String(userId) }
  if (enabledOnly) where.enabled = true
  try {
    const res = await db.collection('shops').where(where).limit(100).get()
    return sortShops(res.data)
  } catch (err) {
    return []
  }
}

async function getShopById(shopId) {
  if (!shopId) return null
  try {
    const res = await db.collection('shops').doc(String(shopId)).get()
    return res.data || null
  } catch (err) {
    return null
  }
}

async function getOwnedShop(userId, shopId) {
  const shop = await getShopById(shopId)
  if (!shop || String(shop.userId) !== String(userId)) return null
  return shop
}

async function getDefaultShop(userId) {
  const shops = await listShops(userId, { enabledOnly: true })
  return shops.find(item => item.isDefault) || shops[0] || null
}

async function resolveShop(user, shopId, { required = true } = {}) {
  if (!user || user.type !== 'KH') return null
  if (shopId) {
    const shop = await getOwnedShop(user._id, shopId)
    if (!shop || shop.enabled === false) throw new Error('店铺不存在或已停用')
    return shop
  }
  const shop = await getDefaultShop(user._id)
  if (!shop && required) throw new Error('请先添加店铺')
  return shop
}

async function clearDefaultFlags(userId) {
  await db.collection('shops').where({ userId: String(userId) }).update({
    data: { isDefault: false }
  })
}

async function setDefaultShop(userId, shopId) {
  const shop = await getOwnedShop(userId, shopId)
  if (!shop) throw new Error('店铺不存在')
  if (shop.enabled === false) throw new Error('停用的店铺不能设为默认')
  await clearDefaultFlags(userId)
  await db.collection('shops').doc(String(shopId)).update({
    data: { isDefault: true, updatedAt: new Date() }
  })
  return { ...shop, isDefault: true }
}

async function ensureDefaultShop(userId) {
  const shops = await listShops(userId)
  if (!shops.length) return null
  const current = shops.find(item => item.isDefault && item.enabled !== false)
  if (current) return current
  const target = shops.find(item => item.enabled !== false) || shops[0]
  if (target) {
    await setDefaultShop(userId, target._id)
    return { ...target, isDefault: true }
  }
  return null
}

async function syncShopCount(userId, count) {
  try {
    await db.collection('users').doc(String(userId)).update({
      data: { shopCount: Number(count) || 0 }
    })
  } catch (err) {
    console.warn('sync shop count failed', err)
  }
}

async function createShop(userId, body) {
  const data = normalizeInput(body, false)
  let count = 0
  try {
    const countRes = await db.collection('shops').where({ userId: String(userId) }).count()
    count = countRes.total
  } catch (err) {
    count = 0
  }
  if (count >= MAX_SHOPS) {
    throw new Error(`一个客户最多维护 ${MAX_SHOPS} 个店铺`)
  }
  const isFirst = count === 0
  const now = new Date()
  const shop = {
    userId: String(userId),
    ...data,
    enabled: data.enabled !== false,
    isDefault: isFirst,
    createdAt: now,
    updatedAt: now
  }
  const res = await db.collection('shops').add({ data: shop })
  await syncShopCount(userId, count + 1)
  return { _id: res._id, ...shop }
}

async function updateShop(userId, shopId, body) {
  const shop = await getOwnedShop(userId, shopId)
  if (!shop) throw new Error('店铺不存在')
  const data = normalizeInput(body, true)
  if (data.enabled === false) {
    const shops = await listShops(userId)
    const enabledCount = shops.filter(item => item.enabled !== false).length
    if (enabledCount <= 1 && shop.enabled !== false) {
      throw new Error('至少保留一个启用中的店铺')
    }
  }
  if (!Object.keys(data).length) return shop
  data.updatedAt = new Date()
  await db.collection('shops').doc(String(shopId)).update({ data })
  if (data.enabled === false && shop.isDefault) {
    await ensureDefaultShop(userId)
  }
  return { ...shop, ...data }
}

async function deleteShop(userId, shopId) {
  const shop = await getOwnedShop(userId, shopId)
  if (!shop) throw new Error('店铺不存在')
  let count = 0
  try {
    const countRes = await db.collection('shops').where({ userId: String(userId) }).count()
    count = countRes.total
  } catch (err) {
    count = 0
  }
  if (count <= 1) throw new Error('至少保留一个店铺')
  await db.collection('shops').doc(String(shopId)).remove()
  await db
    .collection('carts')
    .doc(`${String(userId)}_${String(shopId)}`)
    .remove()
    .catch(() => null)
  await syncShopCount(userId, count - 1)
  await ensureDefaultShop(userId)
}

async function listShopsForUsers(userIds) {
  const uniqueIds = Array.from(new Set((userIds || []).filter(Boolean).map(String)))
  const map = {}
  if (!uniqueIds.length) return map
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const chunk = uniqueIds.slice(start, start + 100)
    try {
      const res = await db.collection('shops').where({ userId: db.command.in(chunk) }).limit(1000).get()
      res.data.forEach(shop => {
        const key = String(shop.userId)
        if (!map[key]) map[key] = []
        map[key].push(shop)
      })
    } catch (err) {
      console.warn('list shops failed', err)
    }
  }
  Object.keys(map).forEach(key => {
    map[key] = sortShops(map[key])
  })
  return map
}

function pickDefaultShop(shops) {
  if (!Array.isArray(shops) || !shops.length) return null
  return shops.find(item => item.isDefault) || shops.find(item => item.enabled !== false) || shops[0]
}

module.exports = {
  MAX_SHOPS,
  cleanText,
  listShops,
  getShopById,
  getOwnedShop,
  getDefaultShop,
  resolveShop,
  setDefaultShop,
  ensureDefaultShop,
  createShop,
  updateShop,
  deleteShop,
  syncShopCount,
  listShopsForUsers,
  pickDefaultShop
}

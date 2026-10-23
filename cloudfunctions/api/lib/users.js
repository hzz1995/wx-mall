const { db } = require('./context')

function toTimestamp(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function sanitizeUser(user) {
  if (!user) return null
  return {
    _id: user._id,
    phone: user.phone,
    name: user.name,
    shopName: user.shopName || '',
    address: user.address || '',
    salesId: user.salesId || '',
    productIds: Array.isArray(user.productIds) ? user.productIds.map(String) : [],
    type: user.type,
    enabled: user.enabled !== false,
    createdAt: toTimestamp(user.createdAt),
    updatedAt: toTimestamp(user.updatedAt)
  }
}

async function getUserById(id) {
  if (!id) return null
  try {
    const res = await db.collection('users').doc(String(id)).get()
    return res.data || null
  } catch (err) {
    return null
  }
}

async function getUserByPhone(phone) {
  if (!phone) return null
  const res = await db.collection('users').where({ phone: String(phone) }).limit(1).get()
  return res.data[0] || null
}

async function getSalesMap(ids) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)))
  const map = {}
  if (!uniqueIds.length) return map
  const res = await db.collection('users').where({ _id: db.command.in(uniqueIds) }).limit(200).get()
  res.data.forEach(user => {
    map[user._id] = { name: user.name, phone: user.phone, enabled: user.enabled !== false }
  })
  return map
}

async function getSalesName(salesId) {
  const user = await getUserById(salesId)
  return user && user.type === 'XS' ? user.name : ''
}

module.exports = {
  sanitizeUser,
  getUserById,
  getUserByPhone,
  getSalesMap,
  getSalesName,
  toTimestamp
}

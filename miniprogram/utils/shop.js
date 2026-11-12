function currentUserId() {
  const user = wx.getStorageSync('mall_user') || {}
  return user._id || ''
}

function shopsKey() {
  const userId = currentUserId()
  return userId ? `mall_shops_${userId}` : ''
}

function activeKey() {
  const userId = currentUserId()
  return userId ? `mall_active_shop_${userId}` : ''
}

function getShops() {
  const key = shopsKey()
  if (!key) return []
  const shops = wx.getStorageSync(key)
  return Array.isArray(shops) ? shops : []
}

function saveShops(shops) {
  const key = shopsKey()
  if (!key) return
  wx.setStorageSync(key, Array.isArray(shops) ? shops : [])
  ensureActive()
}

function ensureActive() {
  const key = activeKey()
  if (!key) return ''
  const shops = getShops().filter(shop => shop.enabled !== false)
  const current = wx.getStorageSync(key)
  if (current && shops.some(shop => shop._id === current)) return current
  const target = shops.find(shop => shop.isDefault) || shops[0]
  if (!target) {
    wx.removeStorageSync(key)
    return ''
  }
  wx.setStorageSync(key, target._id)
  return target._id
}

function getActiveShopId() {
  return ensureActive()
}

function getActiveShop() {
  const id = ensureActive()
  if (!id) return null
  return getShops().find(shop => shop._id === id) || null
}

function setActiveShopId(shopId) {
  const key = activeKey()
  if (!key) return null
  const shop = getShops().find(item => item._id === shopId && item.enabled !== false)
  if (!shop) return null
  wx.setStorageSync(key, shopId)
  return shop
}

function clearShopCache() {
  const key = shopsKey()
  const active = activeKey()
  if (key) wx.removeStorageSync(key)
  if (active) wx.removeStorageSync(active)
}

module.exports = {
  getShops,
  saveShops,
  getActiveShopId,
  getActiveShop,
  setActiveShopId,
  clearShopCache
}

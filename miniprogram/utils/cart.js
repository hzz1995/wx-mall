function syncCartBadge(count) {
  const total = Number(count) || 0
  wx.setStorageSync('mall_cart_count', total)

  try {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (current && typeof current.getTabBar === 'function') {
      const tabBar = current.getTabBar()
      if (tabBar) {
        tabBar.setData({ cartCount: total })
      }
    }
  } catch (err) {
    // 非 TabBar 页面或组件尚未挂载时只更新缓存
  }
}

async function refreshCartBadge() {
  const { getToken, getUser } = require('./session')
  const user = getUser()
  if (!getToken() || (user && user.type !== 'KH')) {
    syncCartBadge(0)
    return 0
  }
  try {
    const { call } = require('./api')
    const data = await call('getCart')
    syncCartBadge(data.count)
    return Number(data.count) || 0
  } catch (err) {
    return 0
  }
}

module.exports = { syncCartBadge, refreshCartBadge }

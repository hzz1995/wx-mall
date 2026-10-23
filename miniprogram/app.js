const { ENV_ID } = require('./config')
const { isLoggedIn } = require('./utils/session')

function buildRedirect(options) {
  const path = options && options.path
  if (!path || path === 'pages/login/index') return ''
  if (path === 'pages/index/index') return '/pages/products/index'
  const query = options.query || {}
  const search = Object.keys(query)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`)
    .join('&')
  return `/${path}${search ? `?${search}` : ''}`
}

App({
  globalData: {
    envReady: false
  },

  onLaunch(options) {
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请使用 2.2.3 及以上版本')
      return
    }
    if (!ENV_ID || ENV_ID === 'YOUR-CLOUD-ENV-ID') {
      console.error('请先在 miniprogram/config.js 中填写云开发环境 ID')
      return
    }
    wx.cloud.init({ env: ENV_ID, traceUser: false })
    this.globalData.envReady = true

    if (!isLoggedIn()) {
      const redirect = buildRedirect(options)
      if (redirect) {
        wx.setStorageSync('mall_login_redirect', redirect)
      }
      wx.reLaunch({ url: '/pages/login/index' })
    }
  }
})

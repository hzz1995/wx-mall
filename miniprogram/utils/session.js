const TOKEN_KEY = 'mall_token'
const USER_KEY = 'mall_user'

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function getUser() {
  return wx.getStorageSync(USER_KEY) || null
}

function saveSession(token, user) {
  wx.setStorageSync(TOKEN_KEY, token)
  wx.setStorageSync(USER_KEY, user)
}

function updateUser(user) {
  wx.setStorageSync(USER_KEY, user)
}

function clearSession() {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(USER_KEY)
}

function isLoggedIn() {
  return Boolean(getToken())
}

function goLogin() {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  if (current && current.route === 'pages/login/index') return
  wx.navigateTo({
    url: '/pages/login/index',
    fail: () => wx.reLaunch({ url: '/pages/login/index' })
  })
}

function goLoginFull(redirectUrl) {
  if (redirectUrl) {
    wx.setStorageSync('mall_login_redirect', redirectUrl)
  }
  wx.reLaunch({ url: '/pages/login/index' })
}

function consumeLoginRedirect() {
  const url = wx.getStorageSync('mall_login_redirect') || ''
  wx.removeStorageSync('mall_login_redirect')
  return url
}

function ensureLogin() {
  if (isLoggedIn()) return true
  goLogin()
  return false
}

function requireLogin(redirectUrl) {
  if (isLoggedIn()) return true
  goLoginFull(redirectUrl)
  return false
}

module.exports = {
  getToken,
  getUser,
  saveSession,
  updateUser,
  clearSession,
  isLoggedIn,
  goLogin,
  goLoginFull,
  consumeLoginRedirect,
  ensureLogin,
  requireLogin
}

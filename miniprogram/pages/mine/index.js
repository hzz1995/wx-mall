const api = require('../../utils/api')
const {
  isLoggedIn,
  getUser,
  updateUser,
  clearSession,
  requireLogin
} = require('../../utils/session')
const { syncCartBadge } = require('../../utils/cart')

const TYPE_TEXT = { KH: '客户', XS: '销售', YY: '运营', GLY: '管理员' }

Page({
  data: {
    loggedIn: false,
    user: null,
    salesName: '',
    serviceWechat: '',
    typeText: '',
    initial: '店'
  },

  onShow() {
    if (!requireLogin('/pages/mine/index')) return
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    const loggedIn = isLoggedIn()
    this.setData({ loggedIn })
    if (!loggedIn) {
      this.setData({ user: null, salesName: '', typeText: '', initial: '店' })
      return
    }
    const cached = getUser()
    if (cached) this.applyUser(cached, this.data.salesName)
    this.load()
  },

  applyUser(user, salesName) {
    this.setData({
      user,
      salesName: salesName || '',
      typeText: TYPE_TEXT[user.type] || '用户',
      initial: (user.name || '店').slice(0, 1)
    })
  },

  async load() {
    try {
      const [meData, settingsData] = await Promise.all([
        api.call('me'),
        api.call('getSettings')
      ])
      const user = meData.user
      updateUser(user)
      this.applyUser(user, meData.salesName)
      this.setData({
        serviceWechat: (settingsData.settings && settingsData.settings.serviceWechat) || ''
      })
    } catch (err) {
      api.toastError(err)
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/index' })
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' })
  },

  goPassword() {
    wx.navigateTo({ url: '/pages/password/index' })
  },

  copyWechat() {
    if (!this.data.serviceWechat) return
    wx.setClipboardData({
      data: this.data.serviceWechat,
      success: () => wx.showToast({ title: '微信号已复制', icon: 'none' })
    })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新输入密码，确认退出？',
      success: res => {
        if (!res.confirm) return
        clearSession()
        syncCartBadge(0)
        wx.reLaunch({ url: '/pages/login/index' })
      }
    })
  }
})

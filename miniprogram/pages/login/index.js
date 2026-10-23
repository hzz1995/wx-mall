const api = require('../../utils/api')
const {
  isLoggedIn,
  saveSession,
  consumeLoginRedirect
} = require('../../utils/session')
const { refreshCartBadge } = require('../../utils/cart')

Page({
  data: {
    shopName: '祥哥小铺',
    phone: '',
    password: '',
    showPassword: false,
    submitting: false
  },

  onLoad() {
    if (isLoggedIn()) {
      this.backOrHome()
      return
    }
    api.call('getSettings')
      .then(data => {
        if (data.settings && data.settings.shopName) {
          this.setData({ shopName: data.settings.shopName })
          wx.setNavigationBarTitle({ title: `${data.settings.shopName} · 登录` })
        }
      })
      .catch(() => {})
  },

  backOrHome() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/products/index' })
  },

  goRedirect(url) {
    const path = String(url || '').split('?')[0]
    if (['/pages/products/index', '/pages/cart/index', '/pages/mine/index'].indexOf(path) >= 0) {
      wx.switchTab({ url: path })
      return
    }
    wx.redirectTo({
      url,
      fail: () => wx.reLaunch({ url: '/pages/products/index' })
    })
  },

  onPhoneInput(event) {
    this.setData({ phone: event.detail.value })
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value })
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword })
  },

  async submit() {
    if (this.data.submitting) return
    const phone = this.data.phone.trim()
    const password = this.data.password

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请填写正确的手机号', icon: 'none' })
      return
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const data = await api.call('login', { phone, password })
      saveSession(data.token, data.user)
      await refreshCartBadge()
      wx.showToast({ title: '登录成功', icon: 'success' })
      const redirect = consumeLoginRedirect()
      setTimeout(() => {
        if (redirect) {
          this.goRedirect(redirect)
        } else {
          this.backOrHome()
        }
      }, 500)
    } catch (err) {
      this.setData({ submitting: false })
      api.toastError(err)
    }
  }
})

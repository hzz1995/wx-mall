const api = require('../../utils/api')
const {
  getToken,
  getUser,
  updateUser,
  requireLogin
} = require('../../utils/session')
const { getShops, saveShops } = require('../../utils/shop')

Page({
  data: {
    phone: '',
    name: '',
    salesName: '',
    shopCount: 0,
    isCustomer: false,
    saving: false,
    loading: true
  },

  onLoad() {
    this.init()
  },

  onShow() {
    if (!getToken()) return
    if (!this.initialized) {
      this.init()
    }
  },

  init() {
    if (!getToken()) {
      requireLogin('/pages/profile/index')
      return
    }
    if (this.initialized) return
    this.initialized = true

    const cached = getUser()
    if (cached) {
      this.setData({
        phone: cached.phone || '',
        name: cached.name || '',
        shopCount: getShops().length
      })
    }
    this.load()
  },

  async load() {
    try {
      const data = await api.call('me')
      const user = data.user
      updateUser(user)
      if (Array.isArray(data.shops)) saveShops(data.shops)
      this.setData({
        phone: user.phone,
        name: user.name,
        salesName: data.salesName || '',
        shopCount: Array.isArray(data.shops) ? data.shops.length : getShops().length,
        isCustomer: user.type === 'KH',
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      this.initialized = false
      api.toastError(err)
    }
  },

  onNameInput(event) {
    this.setData({ name: event.detail.value })
  },

  goShops() {
    wx.navigateTo({ url: '/pages/shops/index' })
  },

  async save() {
    if (this.data.saving) return
    const name = this.data.name.trim()
    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const data = await api.call('updateProfile', { name })
      updateUser(data.user)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (err) {
      this.setData({ saving: false })
      api.toastError(err)
    }
  }
})

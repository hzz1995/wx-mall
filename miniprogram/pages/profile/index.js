const api = require('../../utils/api')
const {
  getToken,
  getUser,
  updateUser,
  requireLogin
} = require('../../utils/session')

Page({
  data: {
    phone: '',
    name: '',
    shopName: '',
    address: '',
    salesName: '',
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
        shopName: cached.shopName || '',
        address: cached.address || ''
      })
    }
    this.load()
  },

  async load() {
    try {
      const data = await api.call('me')
      const user = data.user
      updateUser(user)
      this.setData({
        phone: user.phone,
        name: user.name,
        shopName: user.shopName || '',
        address: user.address || '',
        salesName: data.salesName || '',
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

  onShopInput(event) {
    this.setData({ shopName: event.detail.value })
  },

  onAddressInput(event) {
    this.setData({ address: event.detail.value })
  },

  async save() {
    if (this.data.saving) return
    const name = this.data.name.trim()
    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    if (this.data.isCustomer && !this.data.shopName.trim()) {
      wx.showToast({ title: '请填写门店名称', icon: 'none' })
      return
    }
    if (this.data.isCustomer && !this.data.address.trim()) {
      wx.showToast({ title: '请填写收货地址', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const payload = { name }
      if (this.data.isCustomer) {
        payload.shopName = this.data.shopName.trim()
        payload.address = this.data.address.trim()
      }
      const data = await api.call('updateProfile', payload)
      updateUser(data.user)
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (err) {
      this.setData({ saving: false })
      api.toastError(err)
    }
  }
})

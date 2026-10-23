const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  getToken,
  getUser,
  requireLogin,
  updateUser
} = require('../../utils/session')
const { refreshCartBadge } = require('../../utils/cart')

Page({
  data: {
    items: [],
    totalText: '0',
    address: '',
    remark: '',
    user: null,
    source: 'direct',
    editable: false,
    loading: true,
    error: '',
    needLogin: false,
    submitting: false
  },

  onLoad() {
    this.init()
  },

  onShow() {
    if (!getToken()) return
    if (this.pendingInit || (this.initialized && this.data.error)) {
      this.initialized = false
      this.init()
    }
  },

  init() {
    if (!getToken()) {
      requireLogin('/pages/checkout/index')
      return
    }
    this.pendingInit = false
    this.setData({ needLogin: false })
    if (this.initialized) return
    this.initialized = true

    const payload = wx.getStorageSync('mall_checkout')
    if (!payload || !Array.isArray(payload.items) || !payload.items.length) {
      this.setData({ loading: false, error: '结算信息已失效，请重新选择商品' })
      return
    }
    this.rawItems = payload.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity
    }))
    this.source = payload.source === 'cart' ? 'cart' : 'direct'
    this.editable = payload.editable === true
    this.setData({ editable: this.editable })
    this.loadPreview()
  },

  async loadPreview() {
    try {
      const data = await api.call('getCheckoutPreview', { items: this.rawItems })
      const cached = getUser() || {}
      const items = (data.items || []).map(item => ({
        ...item,
        priceText: formatPrice(item.price),
        lineTotalText: formatPrice(item.price * item.quantity),
        initial: (item.name || '·').slice(0, 1)
      }))
      this.rawItems = items.map(item => ({
        productId: item.productId,
        quantity: item.quantity
      }))
      this.setData({
        items,
        totalText: formatPrice(data.totalAmount || 0),
        address: data.address || cached.address || '',
        user: data.user || cached,
        source: this.source,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    }
  },

  changeQuantity(event) {
    if (!this.data.editable) return
    const dataset = event.currentTarget.dataset || {}
    const rawId = dataset.productId !== undefined ? dataset.productId : dataset.id
    const productId = String(rawId || '')
    const delta = Number(dataset.delta)
    if (!productId || !Number.isFinite(delta) || delta === 0) return

    let changed = false
    const items = this.data.items.map(item => {
      if (String(item.productId) !== productId) return item
      changed = true
      const quantity = Math.min(99, Math.max(1, Number(item.quantity || 1) + delta))
      return {
        ...item,
        quantity,
        lineTotalText: formatPrice(item.price * quantity)
      }
    })
    if (!changed) return

    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    this.rawItems = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity
    }))
    this.setData({
      items,
      totalText: formatPrice(totalAmount)
    })
  },

  onAddressInput(event) {
    this.setData({ address: event.detail.value })
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value })
  },

  async submit() {
    if (this.data.submitting || !this.data.items.length) return
    const address = this.data.address.trim()
    if (!address) {
      wx.showToast({ title: '请填写收货地址', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const result = await api.call('createOrder', {
        items: this.rawItems,
        source: this.source,
        address,
        remark: this.data.remark.trim()
      })

      const cached = getUser()
      if (cached) updateUser({ ...cached, address })
      wx.removeStorageSync('mall_checkout')
      if (this.source === 'cart') refreshCartBadge()
      wx.redirectTo({ url: `/pages/order-detail/index?id=${result.orderId}&created=1` })
    } catch (err) {
      this.setData({ submitting: false })
      api.toastError(err)
    }
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/index' })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  }
})

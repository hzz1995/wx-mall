const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  getToken,
  getUser,
  requireLogin
} = require('../../utils/session')
const { refreshCartBadge } = require('../../utils/cart')
const { getActiveShopId } = require('../../utils/shop')

Page({
  data: {
    items: [],
    totalText: '0',
    address: '',
    remark: '',
    user: null,
    shop: null,
    isKh: false,
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
    const user = getUser() || {}
    this.isKh = user.type === 'KH'
    this.payloadShopId = payload.shopId || ''
    this.setData({ editable: this.editable, isKh: this.isKh })
    this.loadPreview()
  },

  async loadPreview() {
    try {
      const shopId = this.isKh ? (this.payloadShopId || getActiveShopId()) : ''
      if (this.isKh && !shopId) {
        this.setData({ loading: false, error: '请先添加店铺' })
        return
      }
      this.payloadShopId = shopId
      const data = await api.call(
        'getCheckoutPreview',
        shopId ? { items: this.rawItems, shopId } : { items: this.rawItems }
      )
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
        address: data.address || '',
        shop: data.shop || {},
        user: data.user || getUser(),
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
    if (this.data.isKh && !this.payloadShopId) {
      wx.showToast({ title: '请先添加店铺', icon: 'none' })
      return
    }
    if (!this.data.isKh && !address) {
      wx.showToast({ title: '请填写收货地址', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const payload = {
        items: this.rawItems,
        source: this.source,
        remark: this.data.remark.trim()
      }
      if (this.data.isKh) {
        payload.shopId = this.payloadShopId
      } else {
        payload.address = address
      }
      const result = await api.call('createOrder', payload)

      wx.removeStorageSync('mall_checkout')
      if (this.source === 'cart') {
        refreshCartBadge(0, this.data.isKh ? this.payloadShopId : '')
      }
      wx.redirectTo({ url: `/pages/order-detail/index?id=${result.orderId}&created=1` })
    } catch (err) {
      this.setData({ submitting: false })
      api.toastError(err)
    }
  },

  goShops() {
    wx.navigateTo({ url: '/pages/shops/index' })
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/index' })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  }
})

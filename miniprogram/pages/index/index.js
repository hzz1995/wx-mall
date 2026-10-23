const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const { isLoggedIn } = require('../../utils/session')
const { refreshCartBadge } = require('../../utils/cart')

Page({
  data: {
    settings: {},
    categories: [],
    featured: [],
    zones: [],
    cartCount: 0,
    skeletonItems: [1, 2, 3, 4],
    loading: true,
    error: '',
    loaded: false
  },

  onLoad(options) {
    if (options && options.scene) {
      const scene = decodeURIComponent(options.scene)
      const matched = /(?:^|&)p=([a-z0-9]+)/i.exec(scene)
      if (matched) {
        wx.redirectTo({ url: `/pages/product/index?code=${matched[1]}` })
        return
      }
    }
    this.load()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadCartCount()
  },

  onPullDownRefresh() {
    this.load(true)
  },

  decorate(products) {
    return (products || []).map(item => ({
      ...item,
      priceText: formatPrice(item.price),
      initial: (item.name || '·').slice(0, 1)
    }))
  },

  async load(fromPullDown) {
    this.setData({ loading: true, error: '' })
    try {
      const data = await api.call('getCatalog')
      const products = this.decorate(data.products)
      const categories = (data.categories || []).map(item => ({
        ...item,
        initial: (item.name || '·').slice(0, 1)
      }))
      const knownCategoryIds = categories.map(item => item._id)

      const zones = categories
        .map((category, index) => {
          const all = products.filter(product => product.categoryId === category._id)
          return {
            key: category._id,
            _id: category._id,
            name: category.name,
            initial: category.initial,
            count: all.length,
            theme: index % 4,
            products: all.slice(0, 4)
          }
        })
        .filter(zone => zone.products.length)

      const others = products.filter(product => knownCategoryIds.indexOf(product.categoryId) < 0)
      if (others.length) {
        zones.push({
          key: 'other',
          _id: 'all',
          name: '更多好物',
          initial: '荐',
          count: others.length,
          theme: zones.length % 4,
          products: others.slice(0, 4)
        })
      }

      this.setData({
        settings: data.settings || {},
        categories,
        featured: products.slice(0, 4),
        zones,
        loading: false,
        loaded: true
      })
      if (data.settings && data.settings.shopName) {
        wx.setNavigationBarTitle({ title: data.settings.shopName })
      }
      this.loadCartCount()
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  async loadCartCount() {
    if (!isLoggedIn()) {
      this.setData({ cartCount: 0 })
      return
    }
    const count = await refreshCartBadge()
    this.setData({ cartCount: count })
  },

  contactService() {
    const wechat = this.data.settings.serviceWechat
    if (!wechat) {
      wx.showModal({ title: '联系店主', content: '店主还没有设置客服微信号', showCancel: false })
      return
    }
    wx.showModal({
      title: '客服微信',
      content: wechat,
      confirmText: '复制',
      success: res => {
        if (!res.confirm) return
        wx.setClipboardData({
          data: wechat,
          success: () => wx.showToast({ title: '微信号已复制', icon: 'none' })
        })
      }
    })
  },

  goProduct(event) {
    wx.navigateTo({ url: `/pages/product/index?id=${event.currentTarget.dataset.id}` })
  },

  goProducts() {
    wx.removeStorageSync('mall_pending_category')
    wx.switchTab({ url: '/pages/products/index' })
  },

  goCategory(event) {
    const id = event.currentTarget.dataset.id || 'all'
    if (id === 'all') {
      wx.removeStorageSync('mall_pending_category')
    } else {
      wx.setStorageSync('mall_pending_category', id)
    }
    wx.switchTab({ url: '/pages/products/index' })
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/index' })
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/index' })
  }
})

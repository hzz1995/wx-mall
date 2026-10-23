const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  ensureLogin,
  getToken,
  getUser,
  requireLogin
} = require('../../utils/session')
const { syncCartBadge, refreshCartBadge } = require('../../utils/cart')

Page({
  data: {
    product: null,
    loading: true,
    error: '',
    current: 0,
    adding: false,
    canShop: false,
    cartCount: 0,
    qtyVisible: false,
    qtyProduct: {},
    qtyValue: 1
  },

  onLoad(options) {
    this.pageOptions = options || {}
    const search = Object.keys(options || {})
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(options[key])}`)
      .join('&')
    const redirect = `/pages/product/index${search ? `?${search}` : ''}`
    if (!requireLogin(redirect)) return

    const user = getUser()
    this.setData({ canShop: Boolean(user && user.type === 'KH') })
    this.load(this.pageOptions)
  },

  onShow() {
    if (getToken() && !this.data.product && !this.data.loading) {
      this.load(this.pageOptions || {})
    }
    if (this.data.canShop) {
      refreshCartBadge().then(count => {
        this.setData({ cartCount: Number(count) || 0 })
      })
    }
  },

  async load(options) {
    const query = {}
    if (options.id) query.id = options.id
    if (options.code) query.code = options.code

    if (!query.id && !query.code && options.scene) {
      const scene = decodeURIComponent(options.scene)
      const matched = /(?:^|&)p=([a-z0-9]+)/i.exec(scene)
      if (matched) query.code = matched[1]
    }

    if (!query.id && !query.code) {
      this.setData({ loading: false, error: '商品不存在' })
      return
    }

    try {
      const data = await api.call('getProduct', query)
      const product = data.product
      product.priceText = formatPrice(product.price)
      product.originalPriceText = formatPrice(product.originalPrice)
      product.onSale = product.status === 'ON'
      product.initial = (product.name || '·').slice(0, 1)
      this.setData({ product, loading: false, current: 0 })
      if (product.name) {
        wx.setNavigationBarTitle({ title: product.name })
      }
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    }
  },

  onSwiperChange(event) {
    this.setData({ current: event.detail.current })
  },

  previewImage(event) {
    const images = (this.data.product && this.data.product.images) || []
    if (!images.length) return
    const index = Number(event.currentTarget.dataset.index) || 0
    const cloudFiles = images.filter(src => src.indexOf('cloud://') === 0)
    if (!cloudFiles.length) {
      wx.previewImage({ urls: images, current: images[index] })
      return
    }
    wx.cloud.getTempFileURL({
      fileList: cloudFiles,
      success: res => {
        const map = {}
        ;(res.fileList || []).forEach(file => {
          if (file.tempFileURL) map[file.fileID] = file.tempFileURL
        })
        const urls = images.map(src => map[src] || src)
        wx.previewImage({ urls, current: urls[index] })
      },
      fail: () => wx.previewImage({ urls: images, current: images[index] })
    })
  },

  openQtyDialog() {
    const { product } = this.data
    if (!product || !product.onSale || this.data.adding) return
    if (!this.data.canShop) {
      wx.showToast({ title: '只有客户账号可以加入购物车', icon: 'none' })
      return
    }
    this.setData({
      qtyVisible: true,
      qtyValue: 1,
      qtyProduct: {
        _id: product._id,
        name: product.name,
        priceText: product.priceText,
        cover: (product.images && product.images[0]) || '',
        initial: product.initial
      }
    })
  },

  closeQtyDialog() {
    this.setData({ qtyVisible: false })
  },

  async confirmAddToCart(event) {
    const product = this.data.product
    if (!product || !product.onSale || this.data.adding) return
    const quantity = Number(event.detail.quantity) || 1

    this.setData({ qtyVisible: false, adding: true })
    try {
      const data = await api.call('addToCart', {
        productId: product._id,
        quantity
      })
      syncCartBadge(data.count)
      this.setData({ cartCount: Number(data.count) || 0 })
      wx.showToast({ title: `已加入 ${quantity} 件`, icon: 'success' })
    } catch (err) {
      api.toastError(err)
    } finally {
      this.setData({ adding: false })
    }
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/index' })
  },

  buyNow() {
    const { product } = this.data
    if (!product || !product.onSale) return
    if (!this.data.canShop) {
      wx.showToast({ title: '只有客户账号可以下单', icon: 'none' })
      return
    }
    if (!ensureLogin()) return
    wx.setStorageSync('mall_checkout', {
      source: 'direct',
      items: [{ productId: product._id, quantity: 1 }]
    })
    wx.navigateTo({ url: '/pages/checkout/index' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/products/index' })
  }
})

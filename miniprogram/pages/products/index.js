const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  isLoggedIn,
  getToken,
  getUser,
  requireLogin
} = require('../../utils/session')
const { syncCartBadge, refreshCartBadge } = require('../../utils/cart')
const { getShops, saveShops, getActiveShop, getActiveShopId, setActiveShopId } = require('../../utils/shop')

const PAGE_SIZE = 10

Page({
  data: {
    settings: {},
    categories: [],
    products: [],
    activeCategory: 'all',
    keyword: '',
    page: 1,
    hasMore: true,
    cartCount: 0,
    canShop: false,
    isCustomer: false,
    shops: [],
    shopNames: [],
    shopIndex: 0,
    shopCount: 0,
    activeShop: null,
    addingId: '',
    qtyVisible: false,
    qtyProduct: {},
    qtyValue: 1,
    showTop: false,
    railTop: 88,
    skeletonItems: [1, 2, 3],
    loading: true,
    loadingMore: false,
    error: '',
    loaded: false
  },

  onLoad() {
    if (!requireLogin('/pages/products/index')) return
    const user = getUser()
    this.setData({
      canShop: Boolean(user && ['KH', 'XS'].includes(user.type)),
      isCustomer: Boolean(user && user.type === 'KH')
    })
    this.applyShops(getShops())
    const cached = this.readHomeCache()
    if (cached) this.applyHome(cached)
    this.load()
  },

  onReady() {
    this.measureSticky()
  },

  onShow() {
    if (!getToken()) {
      requireLogin('/pages/products/index')
      return
    }
    const user = getUser()
    this.setData({
      canShop: Boolean(user && ['KH', 'XS'].includes(user.type)),
      isCustomer: Boolean(user && user.type === 'KH')
    })
    this.applyShops(getShops())
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    if (!this.data.loaded && !this.data.loading) {
      this.load()
    }
    const pending = wx.getStorageSync('mall_pending_category')
    if (pending) {
      wx.removeStorageSync('mall_pending_category')
      this.setData({ activeCategory: pending })
      this.reloadProducts()
    }
    this.loadCartCount()
  },

  onPullDownRefresh() {
    if (this.data.activeCategory !== 'all' || this.data.keyword.trim()) {
      this.reloadProducts().finally(() => wx.stopPullDownRefresh())
      return
    }
    this.load(true)
  },

  onReachBottom() {
    if (this.searchTimer) return
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      this.loadMore()
    }
  },

  onPageScroll(event) {
    const showTop = event.scrollTop > 600
    if (showTop !== this.data.showTop) {
      this.setData({ showTop })
    }
  },

  measureSticky() {
    wx.nextTick(() => {
      wx.createSelectorQuery()
        .select('.top-fixed')
        .boundingClientRect(rect => {
          if (!rect || !rect.height) return
          const railTop = Math.round(rect.height)
          if (railTop !== this.data.railTop) this.setData({ railTop })
        })
        .exec()
    })
  },

  decorate(products) {
    return (products || []).map(item => {
      const price = Number(item.price) || 0
      const originalPrice = Number(item.originalPrice) || 0
      const hasDiscount = originalPrice > price
      return {
        ...item,
        priceText: formatPrice(price),
        originalPriceText: formatPrice(originalPrice),
        hasDiscount,
        discountText: formatPrice(hasDiscount ? originalPrice - price : 0),
        initial: (item.name || '·').slice(0, 1)
      }
    })
  },

  buildQuery(page) {
    return {
      page,
      pageSize: PAGE_SIZE,
      categoryId: this.data.activeCategory,
      keyword: this.data.keyword.trim()
    }
  },

  homeCacheKey() {
    const user = getUser() || {}
    return user._id ? `mall_home_${user._id}` : ''
  },

  readHomeCache() {
    const key = this.homeCacheKey()
    if (!key) return null
    try {
      const cache = wx.getStorageSync(key)
      if (!cache || !Array.isArray(cache.products) || !Array.isArray(cache.categories)) return null
      return cache
    } catch (err) {
      return null
    }
  },

  applyShops(shops) {
    const list = Array.isArray(shops) ? shops : []
    const enabled = list.filter(shop => shop.enabled !== false)
    const currentId = getActiveShopId()
    let active = enabled.find(shop => shop._id === currentId) || enabled.find(shop => shop.isDefault) || enabled[0] || null
    if (active) setActiveShopId(active._id)
    const index = active ? enabled.findIndex(shop => shop._id === active._id) : 0
    this.setData({
      shops: list,
      shopCount: enabled.length,
      activeShop: active,
      shopNames: enabled.map(shop => shop.shopName),
      shopIndex: index < 0 ? 0 : index
    })
    this.measureSticky()
  },

  onShopChange(event) {
    const index = Number(event.detail.value) || 0
    const shop = this.data.shops.filter(item => item.enabled !== false)[index]
    if (!shop) return
    setActiveShopId(shop._id)
    this.setData({ activeShop: shop, shopIndex: index })
    refreshCartBadge(0, shop._id).then(count => {
      this.setData({ cartCount: Number(count) || 0 })
    })
  },

  writeHomeCache(data) {
    const key = this.homeCacheKey()
    if (!key) return
    try {
      wx.setStorageSync(key, {
        ts: Date.now(),
        settings: data.settings || {},
        categories: data.categories || [],
        products: data.products || [],
        shops: data.shops || [],
        page: data.page || 1,
        hasMore: Boolean(data.hasMore)
      })
    } catch (err) {
      console.warn('cache home failed', err)
    }
  },

  applyHome(data) {
    if (Array.isArray(data.shops)) {
      saveShops(data.shops)
      this.applyShops(data.shops)
    }
    const categories = (data.categories || []).map(item => ({
      ...item,
      initial: (item.name || '·').slice(0, 1)
    }))
    this.setData({
      settings: data.settings || {},
      categories,
      products: this.decorate(data.products),
      page: data.page || 1,
      hasMore: Boolean(data.hasMore),
      loading: false,
      loaded: true,
      error: ''
    })
    this.loadCartCount()
    this.measureSticky()
  },

  async load(fromPullDown) {
    this.requestSeq = (this.requestSeq || 0) + 1
    const seq = this.requestSeq
    this.setData({ loading: true, loadingMore: false, error: '', page: 1, hasMore: true })
    try {
      const data = await api.call('getHome')
      if (seq !== this.requestSeq) return
      this.applyHome(data)
      this.writeHomeCache(data)
    } catch (err) {
      if (seq !== this.requestSeq) return
      this.setData({ loading: false, error: err.message || '加载失败' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  async reloadProducts() {
    if (!this.data.loaded) return this.load()
    this.requestSeq = (this.requestSeq || 0) + 1
    const seq = this.requestSeq
    this.setData({ loading: true, loadingMore: false, page: 1, hasMore: true })
    try {
      const data = await api.call('listProducts', this.buildQuery(1))
      if (seq !== this.requestSeq) return
      this.setData({
        products: this.decorate(data.list),
        page: 1,
        hasMore: Boolean(data.hasMore),
        loading: false
      })
    } catch (err) {
      if (seq !== this.requestSeq) return
      this.setData({ loading: false })
      api.toastError(err)
    }
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return
    const seq = this.requestSeq
    const nextPage = this.data.page + 1
    this.setData({ loadingMore: true })
    try {
      const data = await api.call('listProducts', this.buildQuery(nextPage))
      if (seq !== this.requestSeq) return
      const existing = new Set(this.data.products.map(item => item._id))
      const more = this.decorate(data.list).filter(item => !existing.has(item._id))
      this.setData({
        products: this.data.products.concat(more),
        page: nextPage,
        hasMore: Boolean(data.hasMore)
      })
    } catch (err) {
      if (seq !== this.requestSeq) return
      api.toastError(err)
    } finally {
      if (seq === this.requestSeq) this.setData({ loadingMore: false })
    }
  },

  async loadCartCount() {
    if (!this.data.canShop || !isLoggedIn()) {
      this.setData({ cartCount: 0 })
      syncCartBadge(0)
      return
    }
    const user = getUser() || {}
    const shopId = user.type === 'KH' ? getActiveShopId() : ''
    if (user.type === 'KH' && !shopId) {
      this.setData({ cartCount: 0 })
      syncCartBadge(0)
      return
    }
    const count = await refreshCartBadge(60 * 1000, shopId)
    this.setData({ cartCount: count })
  },

  selectCategory(event) {
    const id = event.currentTarget.dataset.id
    if (id === this.data.activeCategory) return
    this.setData({ activeCategory: id })
    this.reloadProducts()
  },

  onSearchInput(event) {
    this.setData({ keyword: event.detail.value })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null
      this.reloadProducts()
    }, 300)
  },

  clearSearch() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
    if (!this.data.keyword) return
    this.setData({ keyword: '' })
    this.reloadProducts()
  },

  goProduct(event) {
    wx.navigateTo({ url: `/pages/product/index?id=${event.currentTarget.dataset.id}` })
  },

  onHide() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
    this.setTabBarHidden(false)
  },

  onUnload() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
    this.setTabBarHidden(false)
  },

  setTabBarHidden(hidden) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden })
    }
  },

  openQtyDialog(event) {
    if (this.data.addingId) return
    if (!this.data.canShop) {
      wx.showToast({ title: '只有客户和销售账号可以加入购物车', icon: 'none' })
      return
    }
    const user = getUser() || {}
    if (user.type === 'KH' && !getActiveShopId()) {
      wx.showModal({
        title: '请先添加店铺',
        content: '下单前需要先维护店铺和收货地址',
        confirmText: '去添加',
        success: res => {
          if (res.confirm) wx.navigateTo({ url: '/pages/shops/index?first=1' })
        }
      })
      return
    }
    const id = event.currentTarget.dataset.id
    const product = this.data.products.find(item => item._id === id)
    if (!product) return
    this.setTabBarHidden(true)
    this.setData({
      qtyVisible: true,
      qtyValue: 1,
      qtyProduct: {
        _id: product._id,
        name: product.name,
        priceText: product.priceText,
        cover: product.cover,
        initial: product.initial
      }
    })
  },

  closeQtyDialog() {
    this.setTabBarHidden(false)
    this.setData({ qtyVisible: false })
  },

  async confirmAddToCart(event) {
    const quantity = Number(event.detail.quantity) || 1
    const product = this.data.qtyProduct
    if (!product || !product._id) return

    this.setTabBarHidden(false)
    this.setData({ qtyVisible: false, addingId: product._id })
    try {
      const user = getUser() || {}
      const shopId = user.type === 'KH' ? getActiveShopId() : ''
      const payload = { productId: product._id, quantity }
      if (shopId) payload.shopId = shopId
      const data = await api.call('addToCart', payload)
      syncCartBadge(data.count)
      this.setData({ cartCount: Number(data.count) || 0 })
      wx.showToast({ title: `已加入 ${quantity} 件`, icon: 'success' })
    } catch (err) {
      api.toastError(err)
    } finally {
      this.setData({ addingId: '' })
    }
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/index' })
  },

  goOrders() {
    const user = getUser()
    const mine = user && user.type === 'XS'
    wx.navigateTo({ url: `/pages/orders/index${mine ? '?mine=1' : ''}` })
  },

  goHome() {
    wx.switchTab({ url: '/pages/products/index' })
  },

  scrollToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 260 })
  }
})

const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  isLoggedIn,
  getToken,
  getUser,
  requireLogin
} = require('../../utils/session')
const { syncCartBadge, refreshCartBadge } = require('../../utils/cart')

const PAGE_SIZE = 10

Page({
  data: {
    settings: {},
    categories: [],
    products: [],
    activeCategory: 'all',
    keyword: '',
    sort: 'default',
    page: 1,
    hasMore: true,
    cartCount: 0,
    canShop: false,
    addingId: '',
    qtyVisible: false,
    qtyProduct: {},
    qtyValue: 1,
    showTop: false,
    skeletonItems: [1, 2, 3],
    loading: true,
    loadingMore: false,
    error: '',
    loaded: false
  },

  onLoad() {
    if (!requireLogin('/pages/products/index')) return
    const user = getUser()
    this.setData({ canShop: Boolean(user && user.type === 'KH') })
    this.load()
  },

  onShow() {
    if (!getToken()) {
      requireLogin('/pages/products/index')
      return
    }
    const user = getUser()
    this.setData({ canShop: Boolean(user && user.type === 'KH') })
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

  decorate(products) {
    return (products || []).map(item => ({
      ...item,
      priceText: formatPrice(item.price),
      originalPriceText: formatPrice(item.originalPrice),
      initial: (item.name || '·').slice(0, 1)
    }))
  },

  buildQuery(page) {
    return {
      page,
      pageSize: PAGE_SIZE,
      categoryId: this.data.activeCategory,
      keyword: this.data.keyword.trim(),
      sort: this.data.sort
    }
  },

  async load(fromPullDown) {
    this.requestSeq = (this.requestSeq || 0) + 1
    const seq = this.requestSeq
    this.setData({ loading: true, loadingMore: false, error: '', page: 1, hasMore: true })
    try {
      const [meta, firstPage] = await Promise.all([
        api.call('getCatalog', { includeProducts: false }),
        api.call('listProducts', this.buildQuery(1))
      ])
      if (seq !== this.requestSeq) return
      const categories = (meta.categories || []).map(item => ({
        ...item,
        initial: (item.name || '·').slice(0, 1)
      }))
      this.setData({
        settings: meta.settings || {},
        categories,
        products: this.decorate(firstPage.list),
        page: 1,
        hasMore: Boolean(firstPage.hasMore),
        loading: false,
        loaded: true
      })
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
    const count = await refreshCartBadge()
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

  changeSort(event) {
    const sort = event.currentTarget.dataset.sort
    if (sort === this.data.sort) return
    this.setData({ sort })
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
      wx.showToast({ title: '只有客户账号可以加入购物车', icon: 'none' })
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
      this.setData({ addingId: '' })
    }
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

  goCart() {
    wx.switchTab({ url: '/pages/cart/index' })
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/index' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/products/index' })
  },

  scrollToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 260 })
  }
})

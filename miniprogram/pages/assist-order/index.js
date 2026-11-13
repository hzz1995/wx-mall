const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  getToken,
  getUser,
  requireLogin
} = require('../../utils/session')

const PAGE_SIZE = 10

function decorateProduct(product) {
  return {
    ...product,
    priceText: formatPrice(product.price),
    initial: (product.name || '·').slice(0, 1)
  }
}

Page({
  data: {
    customerId: '',
    customer: null,
    customerLoading: true,
    customerError: '',
    shops: [],
    shopNames: [],
    shopIndex: 0,
    shopId: '',
    shopName: '',
    products: [],
    productLoading: true,
    productLoadingMore: false,
    productError: '',
    productHasMore: true,
    productPage: 1,
    keyword: '',
    selected: [],
    selectedCount: 0,
    selectedTotalText: '0',
    address: '',
    remark: '',
    addingCart: false,
    submitting: false
  },

  onLoad(options) {
    const customerId = options && options.customerId
    const redirect = `/pages/assist-order/index${customerId ? `?customerId=${customerId}` : ''}`
    if (!requireLogin(redirect)) return
    const user = getUser()
    if (!user || user.type !== 'XS') {
      wx.showToast({ title: '仅销售账号可使用帮下单', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/mine/index' }), 700)
      return
    }
    if (!customerId) {
      this.setData({ customerLoading: false, customerError: '缺少客户信息' })
      return
    }
    this.setData({ customerId })
    this.loadCustomer()
    this.loadProducts(true)
  },

  onPullDownRefresh() {
    if (!getToken()) {
      wx.stopPullDownRefresh()
      return
    }
    Promise.all([this.loadCustomer(), this.loadProducts(true)]).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.productHasMore && !this.data.productLoadingMore && !this.data.productLoading) {
      this.loadMoreProducts()
    }
  },

  async loadCustomer() {
    this.setData({ customerLoading: true, customerError: '' })
    try {
      const data = await api.call('getAssistCustomer', { customerId: this.data.customerId })
      const customer = data.customer || null
      const shops = (data.shops || []).filter(shop => shop.enabled !== false)
      if (!shops.length) {
        this.setData({
          customer,
          customerLoading: false,
          customerError: '该客户还没有维护店铺，请先让客户或管理员添加店铺'
        })
        return
      }
      const index = Math.max(0, shops.findIndex(shop => shop._id === data.defaultShopId))
      const shop = shops[index] || shops[0]
      this.setData({
        customer,
        customerLoading: false,
        shops,
        shopNames: shops.map(item => item.shopName),
        shopIndex: index,
        shopId: shop._id,
        shopName: shop.shopName,
        address: shop.address || ''
      })
    } catch (err) {
      this.setData({ customerLoading: false, customerError: err.message || '客户加载失败' })
    }
  },

  onShopChange(event) {
    const index = Number(event.detail.value) || 0
    const shop = this.data.shops[index]
    if (!shop) return
    this.setData({
      shopIndex: index,
      shopId: shop._id,
      shopName: shop.shopName,
      address: shop.address || ''
    })
  },

  decorateProducts(products) {
    return (products || []).map(decorateProduct)
  },

  async loadProducts(reset) {
    const seq = (this.productSeq || 0) + 1
    this.productSeq = seq
    if (reset) {
      this.setData({
        productPage: 1,
        productHasMore: true,
        productLoading: true,
        productLoadingMore: false,
        productError: ''
      })
    }
    try {
      const data = await api.call('listProducts', {
        customerId: this.data.customerId,
        page: 1,
        pageSize: PAGE_SIZE,
        keyword: this.data.keyword.trim(),
        sort: 'default'
      })
      if (seq !== this.productSeq) return
      this.setData({
        products: this.decorateProducts(data.list),
        productPage: 1,
        productHasMore: Boolean(data.hasMore),
        productLoading: false
      })
    } catch (err) {
      if (seq !== this.productSeq) return
      this.setData({ productLoading: false, productError: err.message || '商品加载失败' })
    }
  },

  async loadMoreProducts() {
    if (!this.data.productHasMore || this.data.productLoadingMore || this.data.productLoading) return
    const seq = this.productSeq || 0
    const nextPage = this.data.productPage + 1
    this.setData({ productLoadingMore: true })
    try {
      const data = await api.call('listProducts', {
        customerId: this.data.customerId,
        page: nextPage,
        pageSize: PAGE_SIZE,
        keyword: this.data.keyword.trim(),
        sort: 'default'
      })
      if (seq !== this.productSeq) return
      const existing = new Set(this.data.products.map(item => item._id))
      const more = this.decorateProducts(data.list).filter(item => !existing.has(item._id))
      this.setData({
        products: this.data.products.concat(more),
        productPage: nextPage,
        productHasMore: Boolean(data.hasMore)
      })
    } catch (err) {
      if (seq === this.productSeq) api.toastError(err)
    } finally {
      if (seq === this.productSeq) this.setData({ productLoadingMore: false })
    }
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null
      this.loadProducts(true)
    }, 300)
  },

  onUnload() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
  },

  setSelected(selected) {
    const selectedCount = selected.reduce((total, item) => total + item.quantity, 0)
    const selectedTotal = selected.reduce((total, item) => total + item.price * item.quantity, 0)
    this.setData({
      selected,
      selectedCount,
      selectedTotalText: formatPrice(selectedTotal)
    })
  },

  addProduct(event) {
    const productId = event.currentTarget.dataset.id
    const product = this.data.products.find(item => item._id === productId)
    if (!product) return
    const selected = this.data.selected.slice()
    const existing = selected.find(item => item.productId === productId)
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + 1)
    } else {
      selected.push({
        productId: product._id,
        name: product.name,
        spec: product.spec || '',
        price: product.price,
        priceText: product.priceText,
        quantity: 1
      })
    }
    this.setSelected(selected)
    wx.showToast({ title: '已添加', icon: 'none', duration: 800 })
  },

  changeQty(event) {
    const productId = event.currentTarget.dataset.productId
    const delta = Number(event.currentTarget.dataset.delta) || 0
    const selected = this.data.selected
      .map(item => {
        if (item.productId !== productId) return item
        return { ...item, quantity: Math.min(99, Math.max(1, item.quantity + delta)) }
      })
    this.setSelected(selected)
  },

  removeSelected(event) {
    const productId = event.currentTarget.dataset.productId
    this.setSelected(this.data.selected.filter(item => item.productId !== productId))
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value })
  },

  selectedPayload() {
    return this.data.selected.map(item => ({
      productId: item.productId,
      quantity: item.quantity
    }))
  },

  async assistCart() {
    if (!this.data.selected.length) {
      wx.showToast({ title: '请先选择商品', icon: 'none' })
      return
    }
    if (!this.data.shopId) {
      wx.showToast({ title: '请先选择客户店铺', icon: 'none' })
      return
    }
    this.setData({ addingCart: true })
    try {
      await api.call('assistAddToCart', {
        customerId: this.data.customerId,
        shopId: this.data.shopId,
        items: this.selectedPayload()
      })
      this.setSelected([])
      wx.showToast({ title: '已加入客户购物车', icon: 'success' })
    } catch (err) {
      api.toastError(err)
    } finally {
      this.setData({ addingCart: false })
    }
  },

  async assistOrder() {
    if (!this.data.selected.length) {
      wx.showToast({ title: '请先选择商品', icon: 'none' })
      return
    }
    if (!this.data.shopId) {
      wx.showToast({ title: '请先选择客户店铺', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const data = await api.call('assistCreateOrder', {
        customerId: this.data.customerId,
        shopId: this.data.shopId,
        items: this.selectedPayload(),
        remark: this.data.remark.trim()
      })
      wx.showModal({
        title: '下单成功',
        content: `订单号 ${data.orderNo}，客户可在小程序查看`,
        showCancel: false,
        success: () => wx.navigateBack()
      })
    } catch (err) {
      api.toastError(err)
    } finally {
      this.setData({ submitting: false })
    }
  }
})

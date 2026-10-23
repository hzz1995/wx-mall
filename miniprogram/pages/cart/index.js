const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  getUser,
  requireLogin
} = require('../../utils/session')
const { syncCartBadge } = require('../../utils/cart')

Page({
  data: {
    loggedIn: false,
    isCustomer: false,
    items: [],
    count: 0,
    selectedCount: 0,
    totalText: '0',
    allChecked: false,
    loading: false,
    error: ''
  },

  onShow() {
    if (!requireLogin('/pages/cart/index')) return
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const user = getUser() || {}
    const isCustomer = user.type === 'KH'
    this.setData({ loggedIn: true, isCustomer })
    if (!isCustomer) {
      syncCartBadge(0)
      this.setData({
        items: [],
        count: 0,
        selectedCount: 0,
        totalText: '0',
        allChecked: false,
        loading: false
      })
      return
    }
    this.load()
  },

  onPullDownRefresh() {
    if (!this.data.loggedIn) {
      wx.stopPullDownRefresh()
      return
    }
    this.load(true)
  },

  async load(fromPullDown) {
    this.setData({ loading: true, error: '' })
    try {
      const data = await api.call('getCart')
      const items = (data.items || []).map(item => ({
        ...item,
        priceText: formatPrice(item.price),
        lineTotalText: formatPrice(item.price * item.quantity),
        initial: (item.name || '·').slice(0, 1)
      }))
      const validItems = items.filter(item => item.onSale)
      this.setData({
        items,
        count: data.count || 0,
        selectedCount: data.selectedCount || 0,
        totalText: formatPrice(data.totalAmount || 0),
        allChecked: validItems.length > 0 && validItems.every(item => item.checked),
        loading: false
      })
      syncCartBadge(data.count || 0)
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  async toggleItem(event) {
    const { id, checked, onsale } = event.currentTarget.dataset
    if (!onsale) return
    try {
      await api.call('updateCartItem', { productId: id, checked: !checked })
      this.load()
    } catch (err) {
      api.toastError(err)
    }
  },

  async changeQuantity(event) {
    const { id, delta, quantity } = event.currentTarget.dataset
    const next = Math.min(99, Math.max(1, Number(quantity) + Number(delta)))
    if (next === Number(quantity)) return
    try {
      await api.call('updateCartItem', { productId: id, quantity: next })
      this.load()
    } catch (err) {
      api.toastError(err)
    }
  },

  removeItem(event) {
    const { id, name } = event.currentTarget.dataset
    wx.showModal({
      title: '移出购物车',
      content: `确认移除「${name}」？`,
      success: async res => {
        if (!res.confirm) return
        try {
          await api.call('removeCartItem', { productId: id })
          this.load()
        } catch (err) {
          api.toastError(err)
        }
      }
    })
  },

  async toggleAll() {
    if (!this.data.items.length) return
    try {
      await api.call('setCartCheckedAll', { checked: !this.data.allChecked })
      this.load()
    } catch (err) {
      api.toastError(err)
    }
  },

  checkout() {
    const selected = this.data.items.filter(item => item.checked && item.onSale)
    if (!selected.length) {
      wx.showToast({ title: '请选择要结算的商品', icon: 'none' })
      return
    }
    wx.setStorageSync('mall_checkout', {
      source: 'cart',
      items: selected.map(item => ({ productId: item.productId, quantity: item.quantity }))
    })
    wx.navigateTo({ url: '/pages/checkout/index' })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  },

  goProducts() {
    wx.switchTab({ url: '/pages/products/index' })
  }
})

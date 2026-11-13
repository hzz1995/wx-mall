const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  getUser,
  requireLogin
} = require('../../utils/session')
const { syncCartBadge } = require('../../utils/cart')
const {
  getShops,
  saveShops,
  getActiveShop,
  getActiveShopId,
  setActiveShopId
} = require('../../utils/shop')

Page({
  data: {
    loggedIn: false,
    isCustomer: false,
    isKh: false,
    noShop: false,
    shops: [],
    shopNames: [],
    shopIndex: 0,
    shopCount: 0,
    activeShop: null,
    shop: null,
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
    const isCustomer = ['KH', 'XS'].includes(user.type)
    const isKh = user.type === 'KH'
    this.setData({ loggedIn: true, isCustomer, isKh })
    if (!isCustomer) {
      syncCartBadge(0)
      this.setData({
        items: [],
        count: 0,
        selectedCount: 0,
        totalText: '0',
        allChecked: false,
        loading: false,
        noShop: false
      })
      return
    }
    if (isKh) {
      this.syncShops().then(hasShop => {
        if (hasShop) this.load()
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
    if (this.data.isKh && !getActiveShopId()) {
      wx.stopPullDownRefresh()
      return
    }
    this.load(true)
  },

  async syncShops() {
    let shops = getShops()
    if (!shops.length) {
      try {
        const data = await api.call('listMyShops')
        shops = data.shops || []
        saveShops(shops)
      } catch (err) {
        shops = []
      }
    }
    const enabled = shops.filter(shop => shop.enabled !== false)
    if (!enabled.length) {
      this.setData({
        shops,
        shopNames: [],
        shopIndex: 0,
        shopCount: 0,
        activeShop: null,
        noShop: true,
        loading: false,
        items: [],
        count: 0,
        selectedCount: 0,
        totalText: '0',
        allChecked: false,
        error: ''
      })
      syncCartBadge(0)
      return false
    }
    const currentId = getActiveShopId()
    const active = enabled.find(shop => shop._id === currentId) || enabled.find(shop => shop.isDefault) || enabled[0]
    if (active) setActiveShopId(active._id)
    const index = active ? enabled.findIndex(shop => shop._id === active._id) : 0
    this.setData({
      shops,
      shopNames: enabled.map(shop => shop.shopName),
      shopIndex: index < 0 ? 0 : index,
      shopCount: enabled.length,
      activeShop: active,
      noShop: false
    })
    return true
  },

  withShop(payload) {
    const shopId = this.data.isKh ? getActiveShopId() : ''
    return shopId ? { ...payload, shopId } : payload
  },

  async load(fromPullDown) {
    const shopId = this.data.isKh ? getActiveShopId() : ''
    if (this.data.isKh && !shopId) {
      this.setData({ loading: false, noShop: true })
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    this.setData({ loading: true, error: '' })
    try {
      const data = await api.call('getCart', shopId ? { shopId } : {})
      const items = (data.items || []).map(item => ({
        ...item,
        priceText: formatPrice(item.price),
        lineTotalText: formatPrice(item.price * item.quantity),
        initial: (item.name || '·').slice(0, 1)
      }))
      const validItems = items.filter(item => item.onSale)
      const totalAmount = Number(data.totalAmount) || 0
      this.setData({
        items,
        shop: data.shop || null,
        count: data.count || 0,
        selectedCount: data.selectedCount || 0,
        totalText: formatPrice(totalAmount),
        allChecked: validItems.length > 0 && validItems.every(item => item.checked),
        loading: false,
        noShop: false
      })
      syncCartBadge(data.count || 0)
    } catch (err) {
      const message = err.message || '加载失败'
      const noShop = message.indexOf('店铺') >= 0
      this.setData({
        loading: false,
        noShop,
        error: noShop ? '' : message
      })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  onShopChange(event) {
    const index = Number(event.detail.value) || 0
    const shop = this.data.shops.filter(item => item.enabled !== false)[index]
    if (!shop) return
    setActiveShopId(shop._id)
    this.setData({ activeShop: shop, shopIndex: index })
    this.load()
  },

  goShops() {
    wx.navigateTo({ url: '/pages/shops/index' })
  },

  async toggleItem(event) {
    const { id, checked, onsale } = event.currentTarget.dataset
    if (!onsale) return
    try {
      await api.call('updateCartItem', this.withShop({ productId: id, checked: !checked }))
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
      await api.call('updateCartItem', this.withShop({ productId: id, quantity: next }))
      this.load()
    } catch (err) {
      api.toastError(err)
    }
  },

  async onQuantityInput(event) {
    const { id, quantity } = event.currentTarget.dataset
    const raw = String(event.detail.value == null ? '' : event.detail.value).trim()
    const key = `${id}:${raw}`
    const now = Date.now()
    if (this._lastQuantityKey === key && now - this._lastQuantityAt < 800) return
    this._lastQuantityKey = key
    this._lastQuantityAt = now
    const next = Number(raw)
    if (!Number.isInteger(next) || next < 1 || next > 99) {
      wx.showToast({ title: '数量需在 1-99 之间', icon: 'none' })
      this.load()
      return
    }
    if (next === Number(quantity)) {
      if (raw !== String(next)) this.load()
      return
    }
    try {
      await api.call('updateCartItem', this.withShop({ productId: id, quantity: next }))
      this.load()
    } catch (err) {
      api.toastError(err)
      this.load()
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
          await api.call('removeCartItem', this.withShop({ productId: id }))
          this.load()
        } catch (err) {
          api.toastError(err)
        }
      }
    })
  },

  removeSelected() {
    const selected = this.data.items.filter(item => item.checked)
    if (!selected.length) {
      wx.showToast({ title: '请先勾选要删除的商品', icon: 'none' })
      return
    }
    wx.showModal({
      title: '批量移除商品',
      content: `确认从购物车移除选中的 ${selected.length} 个商品？`,
      confirmText: '移除',
      confirmColor: '#e2572b',
      success: async res => {
        if (!res.confirm) return
        try {
          await api.call('removeCartItem', this.withShop({
            productIds: selected.map(item => item.productId)
          }))
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
      await api.call('setCartCheckedAll', this.withShop({ checked: !this.data.allChecked }))
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
    const payload = {
      source: 'cart',
      items: selected.map(item => ({ productId: item.productId, quantity: item.quantity }))
    }
    const shopId = this.data.isKh ? getActiveShopId() : ''
    if (shopId) payload.shopId = shopId
    wx.setStorageSync('mall_checkout', payload)
    wx.navigateTo({ url: '/pages/checkout/index' })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  },

  goProducts() {
    wx.switchTab({ url: '/pages/products/index' })
  }
})

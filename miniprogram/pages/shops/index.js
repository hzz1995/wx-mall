const api = require('../../utils/api')
const { getToken, getUser, requireLogin } = require('../../utils/session')
const { saveShops, getActiveShopId, setActiveShopId } = require('../../utils/shop')
const { refreshCartBadge } = require('../../utils/cart')

function emptyForm() {
  return { shopId: '', shopName: '', address: '', contactName: '', phone: '' }
}

Page({
  data: {
    shops: [],
    defaultShopId: '',
    activeShopId: '',
    formVisible: false,
    form: emptyForm(),
    loading: true,
    saving: false
  },

  onLoad(options) {
    this.first = Boolean(options && options.first === '1')
    if (!requireLogin('/pages/shops/index')) return
    const user = getUser()
    if (!user || user.type !== 'KH') {
      wx.showToast({ title: '仅客户可以维护店铺', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/mine/index' }), 700)
      return
    }
    this.load(true)
  },

  onShow() {
    if (getToken() && this.initialized) this.load()
  },

  async load(first) {
    try {
      const data = await api.call('listMyShops')
      const shops = data.shops || []
      saveShops(shops)
      const enabledShops = shops.filter(item => item.enabled !== false)
      let activeShopId = getActiveShopId()
      if (!enabledShops.some(item => item._id === activeShopId)) {
        const fallback = enabledShops.find(item => item._id === data.defaultShopId)
          || enabledShops.find(item => item.isDefault)
          || enabledShops[0]
        activeShopId = fallback ? fallback._id : ''
        if (activeShopId) setActiveShopId(activeShopId)
      }
      this.initialized = true
      this.setData({
        shops,
        defaultShopId: data.defaultShopId || '',
        activeShopId,
        loading: false,
        formVisible: first ? !shops.length : this.data.formVisible
      })
    } catch (err) {
      this.setData({ loading: false })
      api.toastError(err)
    }
  },

  startAdd() {
    this.setData({ formVisible: true, form: emptyForm() })
  },

  cancelForm() {
    if (!this.data.shops.length) {
      wx.showToast({ title: '请先添加一个店铺', icon: 'none' })
      return
    }
    this.setData({ formVisible: false, form: emptyForm() })
  },

  editShop(event) {
    const shop = this.data.shops.find(item => item._id === event.currentTarget.dataset.id)
    if (!shop) return
    this.setData({
      formVisible: true,
      form: {
        shopId: shop._id,
        shopName: shop.shopName || '',
        address: shop.address || '',
        contactName: shop.contactName || '',
        phone: shop.phone || ''
      }
    })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    if (!field) return
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  async save() {
    if (this.data.saving) return
    const form = this.data.form
    const shopName = String(form.shopName || '').trim()
    const address = String(form.address || '').trim()
    if (!shopName) {
      wx.showToast({ title: '请填写店铺名称', icon: 'none' })
      return
    }
    if (!address) {
      wx.showToast({ title: '请填写收货地址', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const payload = {
        shopName,
        address,
        contactName: String(form.contactName || '').trim(),
        phone: String(form.phone || '').trim()
      }
      let data
      if (form.shopId) {
        data = await api.call('updateShop', { ...payload, shopId: form.shopId })
      } else {
        data = await api.call('createShop', payload)
      }
      const shops = data.shops || []
      saveShops(shops)
      let activeShopId = getActiveShopId()
      if (!activeShopId && data.defaultShopId) {
        setActiveShopId(data.defaultShopId)
        activeShopId = data.defaultShopId
      }
      this.setData({
        shops,
        defaultShopId: data.defaultShopId || '',
        activeShopId,
        formVisible: false,
        form: emptyForm()
      })
      refreshCartBadge(0, activeShopId)
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      api.toastError(err)
    } finally {
      this.setData({ saving: false })
    }
  },

  useShop(event) {
    const shopId = event.currentTarget.dataset.id
    const shop = setActiveShopId(shopId)
    if (!shop) return
    this.setData({ activeShopId: shopId })
    refreshCartBadge(0, shopId)
    wx.showToast({ title: `已切换到 ${shop.shopName}`, icon: 'none' })
  },

  toggleShop(event) {
    const shopId = event.currentTarget.dataset.id
    const enabled = event.currentTarget.dataset.enabled === 'on'
    const shop = this.data.shops.find(item => item._id === shopId)
    if (!shop) return
    if (enabled) {
      wx.showModal({
        title: '停用店铺',
        content: `确认停用「${shop.shopName}」？停用后该店铺不能用于下单。`,
        confirmText: '停用',
        confirmColor: '#e2572b',
        success: res => {
          if (res.confirm) this.updateShopEnabled(shopId, false)
        }
      })
      return
    }
    this.updateShopEnabled(shopId, true)
  },

  async updateShopEnabled(shopId, enabled) {
    try {
      const data = await api.call('updateShop', { shopId, enabled })
      const shops = data.shops || []
      saveShops(shops)
      const enabledShops = shops.filter(item => item.enabled !== false)
      let activeShopId = getActiveShopId()
      if (!enabledShops.some(item => item._id === activeShopId)) {
        const fallback = enabledShops.find(item => item._id === data.defaultShopId)
          || enabledShops.find(item => item.isDefault)
          || enabledShops[0]
        activeShopId = fallback ? fallback._id : ''
        if (activeShopId) setActiveShopId(activeShopId)
      }
      this.setData({
        shops,
        defaultShopId: data.defaultShopId || '',
        activeShopId
      })
      refreshCartBadge(0, activeShopId)
      wx.showToast({ title: enabled ? '已启用店铺' : '已停用店铺', icon: 'none' })
    } catch (err) {
      api.toastError(err)
    }
  },

  async setDefault(event) {
    const shopId = event.currentTarget.dataset.id
    try {
      const data = await api.call('setDefaultShop', { shopId })
      saveShops(data.shops || [])
      setActiveShopId(shopId)
      this.setData({
        shops: data.shops || [],
        defaultShopId: data.defaultShopId || shopId,
        activeShopId: shopId
      })
      refreshCartBadge(0, shopId)
      wx.showToast({ title: '已设为默认', icon: 'success' })
    } catch (err) {
      api.toastError(err)
    }
  },

  removeShop(event) {
    const shopId = event.currentTarget.dataset.id
    const shop = this.data.shops.find(item => item._id === shopId)
    if (!shop) return
    wx.showModal({
      title: '删除店铺',
      content: `确认删除「${shop.shopName}」？历史订单不会受影响。`,
      confirmText: '删除',
      confirmColor: '#e2572b',
      success: async res => {
        if (!res.confirm) return
        try {
          const data = await api.call('deleteShop', { shopId })
          const shops = data.shops || []
          saveShops(shops)
          const activeShopId = getActiveShopId()
          this.setData({
            shops,
            defaultShopId: data.defaultShopId || '',
            activeShopId,
            formVisible: !shops.length
          })
          refreshCartBadge(0, activeShopId)
          wx.showToast({ title: '已删除', icon: 'none' })
        } catch (err) {
          api.toastError(err)
        }
      }
    })
  }
})

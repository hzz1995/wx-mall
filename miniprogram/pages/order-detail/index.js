const api = require('../../utils/api')
const { formatPrice, formatTime, STATUS_TEXT } = require('../../utils/format')
const { getToken, requireLogin } = require('../../utils/session')

Page({
  data: {
    order: null,
    loading: true,
    error: '',
    created: false,
    serviceWechat: ''
  },

  onLoad(options) {
    const id = options && options.id
    if (!requireLogin(`/pages/order-detail/index${id ? `?id=${id}${options.created === '1' ? '&created=1' : ''}` : ''}`)) {
      return
    }
    this.orderId = id
    this.setData({ created: Boolean(options && options.created === '1') })
    this.load(this.orderId)
    this.loadSettings()
  },

  onShow() {
    if (getToken() && this.orderId && !this.data.order && !this.data.loading) {
      this.load(this.orderId)
    }
  },

  async loadSettings() {
    try {
      const data = await api.call('getSettings')
      this.setData({ serviceWechat: (data.settings && data.settings.serviceWechat) || '' })
    } catch (err) {
      console.warn('load settings failed', err)
    }
  },

  async load(id) {
    if (!id) {
      this.setData({ loading: false, error: '缺少订单编号' })
      return
    }
    try {
      const data = await api.call('getMyOrder', { id })
      const order = data.order
      order.statusText = STATUS_TEXT[order.status] || order.status
      order.statusClass = order.status === 'CANCELLED' ? 'tag-cancel' : 'tag-done'
      order.totalText = formatPrice(order.totalAmount)
      order.createdAtText = formatTime(order.createdAt)
      order.items = (order.items || []).map(item => ({
        ...item,
        priceText: formatPrice(item.price),
        lineTotalText: formatPrice(item.price * item.quantity),
        initial: (item.name || '·').slice(0, 1)
      }))
      this.setData({ order, loading: false })
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    }
  },

  copyOrderNo() {
    if (!this.data.order) return
    wx.setClipboardData({
      data: this.data.order.orderNo,
      success: () => wx.showToast({ title: '订单号已复制', icon: 'none' })
    })
  },

  copyServiceWechat() {
    if (!this.data.serviceWechat) return
    wx.setClipboardData({
      data: this.data.serviceWechat,
      success: () => wx.showToast({ title: '微信号已复制', icon: 'none' })
    })
  },

  goHome() {
    wx.switchTab({ url: '/pages/products/index' })
  },

  goOrders() {
    wx.switchTab({ url: '/pages/orders/index' })
  }
})

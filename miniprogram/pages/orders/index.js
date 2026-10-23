const api = require('../../utils/api')
const { formatPrice, formatTime, STATUS_TEXT } = require('../../utils/format')
const {
  getToken,
  getUser,
  requireLogin
} = require('../../utils/session')

const PAGE_SIZE = 10

function decorate(order) {
  const items = order.items || []
  const first = items[0] || {}
  const quantity = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0)
  return {
    ...order,
    statusText: STATUS_TEXT[order.status] || order.status,
    statusClass: order.status === 'CANCELLED' ? 'tag-cancel' : 'tag-done',
    totalText: formatPrice(order.totalAmount),
    createdAtText: formatTime(order.createdAt),
    itemName: first.name || '商品',
    itemQuantity: quantity,
    itemImage: first.image || '',
    itemInitial: (first.name || '·').slice(0, 1),
    extraCount: items.length > 1 ? items.length - 1 : 0
  }
}

Page({
  data: {
    list: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    page: 1,
    error: ''
  },

  onShow() {
    if (!requireLogin('/pages/orders/index')) return
    const user = getUser()
    if (!user || user.type !== 'KH') {
      wx.showToast({ title: '仅客户账号可查看订单', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/mine/index' }), 700)
      return
    }
    this.load(true)
  },

  onPullDownRefresh() {
    if (!getToken()) {
      wx.stopPullDownRefresh()
      return
    }
    this.load(true, true)
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      this.loadMore()
    }
  },

  async load(reset, fromPullDown) {
    if (reset) {
      this.setData({ page: 1, hasMore: true, error: '', loading: true, loadingMore: false })
    }
    try {
      const data = await api.call('listMyOrders', { page: 1, pageSize: PAGE_SIZE })
      this.setData({
        list: (data.list || []).map(decorate),
        page: 1,
        hasMore: Boolean(data.hasMore),
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return
    const nextPage = this.data.page + 1
    this.setData({ loadingMore: true })
    try {
      const data = await api.call('listMyOrders', { page: nextPage, pageSize: PAGE_SIZE })
      const more = (data.list || []).map(decorate)
      this.setData({
        list: this.data.list.concat(more),
        page: nextPage,
        hasMore: Boolean(data.hasMore),
        loadingMore: false
      })
    } catch (err) {
      this.setData({ loadingMore: false })
      api.toastError(err)
    }
  },

  goDetail(event) {
    wx.navigateTo({ url: `/pages/order-detail/index?id=${event.currentTarget.dataset.id}` })
  },

  reorder(event) {
    const order = this.data.list[event.currentTarget.dataset.index]
    if (!order || !Array.isArray(order.items) || !order.items.length) {
      wx.showToast({ title: '该订单没有可复购的商品', icon: 'none' })
      return
    }
    const items = order.items
      .filter(item => item.productId)
      .map(item => ({
        productId: item.productId,
        quantity: Math.max(1, Number(item.quantity) || 1)
      }))
    if (!items.length) {
      wx.showToast({ title: '商品信息已失效', icon: 'none' })
      return
    }
    wx.setStorageSync('mall_checkout', {
      source: 'reorder',
      editable: true,
      items
    })
    wx.navigateTo({ url: '/pages/checkout/index' })
  },

  goShopping() {
    wx.switchTab({ url: '/pages/products/index' })
  }
})

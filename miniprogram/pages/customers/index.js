const api = require('../../utils/api')
const { formatPrice } = require('../../utils/format')
const {
  getToken,
  getUser,
  requireLogin
} = require('../../utils/session')

Page({
  data: {
    summary: {},
    summaryAmountText: '0',
    monthLabel: '',
    list: [],
    filtered: [],
    keyword: '',
    activeFilter: 'all',
    loading: true,
    error: '',
    truncated: false
  },

  onShow() {
    if (!requireLogin('/pages/customers/index')) return
    const user = getUser()
    if (!user || user.type !== 'XS') {
      wx.showToast({ title: '仅销售账号可查看我的客户', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/mine/index' }), 700)
      return
    }
    this.load()
  },

  onPullDownRefresh() {
    if (!getToken()) {
      wx.stopPullDownRefresh()
      return
    }
    this.load(true)
  },

  async load(fromPullDown) {
    this.setData({ loading: true, error: '' })
    try {
      const data = await api.call('listMyCustomers')
      const list = (data.list || []).map(item => ({
        ...item,
        initial: (item.name || '·').slice(0, 1),
        amountText: formatPrice(item.monthAmount),
        changeText: formatPrice(Math.abs(item.changeAmount || 0)),
        changeUp: Number(item.changeAmount) > 0,
        changeDown: Number(item.changeAmount) < 0
      }))
      const summary = data.summary || {}
      this.setData({
        summary,
        summaryAmountText: formatPrice(summary.monthAmount),
        monthLabel: data.monthLabel || '',
        list,
        truncated: Boolean(data.truncated),
        loading: false
      })
      this.applyFilter()
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载失败' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  applyFilter() {
    const keyword = this.data.keyword.trim()
    const filter = this.data.activeFilter
    const filtered = this.data.list.filter(item => {
      if (filter === 'ordered' && Number(item.monthOrderCount) <= 0) return false
      if (filter === 'unordered' && Number(item.monthOrderCount) > 0) return false
      if (!keyword) return true
      return String(item.name || '').includes(keyword) ||
        String(item.phone || '').includes(keyword) ||
        String(item.shopName || '').includes(keyword)
    })
    this.setData({ filtered })
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
    this.applyFilter()
  },

  clearKeyword() {
    this.setData({ keyword: '' })
    this.applyFilter()
  },

  selectFilter(event) {
    const value = event.currentTarget.dataset.value
    if (!value || value === this.data.activeFilter) return
    this.setData({ activeFilter: value })
    this.applyFilter()
  },

  goAssist(event) {
    const customerId = event.currentTarget.dataset.id
    if (!customerId) return
    wx.navigateTo({ url: `/pages/assist-order/index?customerId=${customerId}` })
  }
})

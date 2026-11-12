const api = require('../../utils/api')
const { formatPrice, formatTime, STATUS_TEXT } = require('../../utils/format')
const {
  getToken,
  getUser,
  requireLogin
} = require('../../utils/session')
const { getShops, saveShops } = require('../../utils/shop')

const PAGE_SIZE = 10
const DAY_MS = 24 * 60 * 60 * 1000
const RANGE_OPTIONS = [
  { value: 'today', label: '今天' },
  { value: 'yesterday', label: '昨天' },
  { value: 'week', label: '最近一周' }
]
const NOW = new Date()
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const EARLIEST_MONTH_DATE = new Date(NOW.getFullYear(), NOW.getMonth() - 11, 1)
const EARLIEST_MONTH = `${EARLIEST_MONTH_DATE.getFullYear()}-${String(EARLIEST_MONTH_DATE.getMonth() + 1).padStart(2, '0')}`

function startOfDay(date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function endOfDay(date) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

function decorate(order) {
  const items = order.items || []
  const first = items[0] || {}
  const quantity = items.reduce((total, item) => total + (Number(item.quantity) || 0), 0)
  return {
    ...order,
    statusText: STATUS_TEXT[order.status] || order.status,
    statusClass: order.status === 'CANCELLED'
      ? 'tag-cancel'
      : (order.status === 'CLOSED' ? 'tag-closed' : 'tag-done'),
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
    isCustomer: false,
    isStaff: false,
    isAdmin: false,
    mineMode: false,
    list: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    page: 1,
    error: '',
    exporting: false,
    selectedIds: [],
    selectedCount: 0,
    rangeOptions: RANGE_OPTIONS,
    rangeType: 'month',
    monthValue: CURRENT_MONTH,
    monthStart: EARLIEST_MONTH,
    monthEnd: CURRENT_MONTH,
    customerOptions: [{ _id: '', name: '全部客户' }],
    customerNames: ['全部客户'],
    customerIndex: 0,
    customerId: '',
    salesOptions: [{ _id: '', name: '全部销售' }],
    salesNames: ['全部销售'],
    salesIndex: 0,
    salesId: '',
    myShopOptions: [{ _id: '', shopName: '全部店铺' }],
    myShopNames: ['全部店铺'],
    myShopIndex: 0,
    myShopId: '',
    staffShopOptions: [{ _id: '', shopName: '全部店铺' }],
    staffShopNames: ['全部店铺'],
    staffShopIndex: 0,
    staffShopId: ''
  },

  onLoad(options) {
    this.mineRequested = Boolean(options && options.mine === '1')
    this.setData({ mineMode: this.mineRequested })
  },

  onShow() {
    if (!requireLogin('/pages/orders/index')) return
    const user = getUser()
    const type = user && user.type
    const isCustomer = type === 'KH'
    const isStaff = type === 'XS' || type === 'GLY'
    if (!isCustomer && !isStaff) {
      wx.showToast({ title: '仅客户、销售和管理员可查看订单', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/mine/index' }), 700)
      return
    }

    const mineMode = Boolean(this.mineRequested && type === 'XS')
    this.setData({
      isCustomer,
      isStaff,
      isAdmin: type === 'GLY',
      mineMode
    })
    wx.setNavigationBarTitle({
      title: mineMode || isCustomer ? '我的订单' : '客户订单'
    })
    if (isStaff && !mineMode && !this.customersLoaded) {
      this.loadCustomerOptions()
    }
    if (type === 'GLY' && !mineMode && !this.salesLoaded) {
      this.loadSalesOptions()
    }
    if (isCustomer) {
      this.loadMyShopOptions().then(() => this.load(true))
    } else {
      this.load(true)
    }
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

  getRangeParams() {
    const type = this.data.rangeType
    const now = new Date()
    let start = null
    let end = null

    if (type === 'today') {
      start = startOfDay(now)
      end = now
    } else if (type === 'yesterday') {
      const yesterday = new Date(now.getTime() - DAY_MS)
      start = startOfDay(yesterday)
      end = endOfDay(yesterday)
    } else if (type === 'week') {
      start = startOfDay(new Date(now.getTime() - 6 * DAY_MS))
      end = now
    } else if (type === 'month') {
      const matched = /^(\d{4})-(\d{2})$/.exec(String(this.data.monthValue || ''))
      if (!matched) {
        wx.showToast({ title: '请选择正确的月份', icon: 'none' })
        return null
      }
      const year = Number(matched[1])
      const month = Number(matched[2])
      if (month < 1 || month > 12) {
        wx.showToast({ title: '请选择正确的月份', icon: 'none' })
        return null
      }
      start = new Date(year, month - 1, 1)
      const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
      end = isCurrentMonth ? now : endOfDay(new Date(year, month, 0))
    }

    if (!start || !end) return null
    return { start: start.getTime(), end: end.getTime() }
  },

  buildStaffQuery(page) {
    const range = this.getRangeParams()
    if (!range) return null
    const query = {
      page,
      pageSize: PAGE_SIZE,
      start: range.start,
      end: range.end
    }
    if (this.data.customerId) query.customerId = this.data.customerId
    if (this.data.isAdmin && this.data.salesId) query.salesId = this.data.salesId
    if (this.data.staffShopId) query.shopId = this.data.staffShopId
    return query
  },

  async load(reset, fromPullDown) {
    const seq = (this.loadSeq || 0) + 1
    this.loadSeq = seq
    if (reset) {
      this.setData({
        page: 1,
        hasMore: true,
        error: '',
        loading: true,
        loadingMore: false,
        selectedIds: [],
        selectedCount: 0
      })
    }

    let action = 'listMyOrders'
    let payload = { page: 1, pageSize: PAGE_SIZE }
    if (this.data.isStaff && !this.data.mineMode) {
      const query = this.buildStaffQuery(1)
      if (!query) {
        this.setData({ loading: false })
        if (fromPullDown) wx.stopPullDownRefresh()
        return
      }
      action = 'listStaffOrders'
      payload = query
    } else if (this.data.myShopId) {
      payload.shopId = this.data.myShopId
    }

    try {
      const data = await api.call(action, payload)
      if (seq !== this.loadSeq) return
      const selectedIds = reset ? [] : this.data.selectedIds
      const selectedSet = new Set(selectedIds)
      this.setData({
        list: (data.list || []).map(order => ({
          ...decorate(order),
          selected: selectedSet.has(order._id)
        })),
        page: 1,
        hasMore: Boolean(data.hasMore),
        loading: false
      })
    } catch (err) {
      if (seq !== this.loadSeq) return
      this.setData({ loading: false, error: err.message || '加载失败' })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  async loadMore() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return
    const seq = this.loadSeq || 0
    const nextPage = this.data.page + 1

    let action = 'listMyOrders'
    let payload = { page: nextPage, pageSize: PAGE_SIZE }
    if (this.data.isStaff && !this.data.mineMode) {
      const query = this.buildStaffQuery(nextPage)
      if (!query) return
      action = 'listStaffOrders'
      payload = query
    } else if (this.data.myShopId) {
      payload.shopId = this.data.myShopId
    }

    this.setData({ loadingMore: true })
    try {
      const data = await api.call(action, payload)
      if (seq !== this.loadSeq) return
      const selectedSet = new Set(this.data.selectedIds)
      const more = (data.list || []).map(order => ({
        ...decorate(order),
        selected: selectedSet.has(order._id)
      }))
      this.setData({
        list: this.data.list.concat(more),
        page: nextPage,
        hasMore: Boolean(data.hasMore)
      })
    } catch (err) {
      if (seq === this.loadSeq) api.toastError(err)
    } finally {
      if (seq === this.loadSeq) this.setData({ loadingMore: false })
    }
  },

  async loadSalesOptions() {
    this.salesLoaded = true
    try {
      const data = await api.call('listSalesOptions')
      const options = [{ _id: '', name: '全部销售' }].concat(data.list || [])
      this.setData({
        salesOptions: options,
        salesNames: options.map(item => item.name || '未命名销售'),
        salesIndex: 0,
        salesId: ''
      })
    } catch (err) {
      this.salesLoaded = false
      console.warn('load sales options failed', err)
    }
  },

  async loadCustomerOptions() {
    this.customersLoaded = true
    try {
      const data = await api.call('listCustomerOptions')
      const options = [{ _id: '', name: '全部客户', label: '全部客户' }].concat(
        (data.list || []).map(item => ({
          ...item,
          label: item.name
            ? `${item.name}${item.phone ? `（${item.phone}）` : ''}`
            : (item.phone || item.shopName || '未命名客户')
        }))
      )
      this.setData({
        customerOptions: options,
        customerNames: options.map(item => item.label),
        customerIndex: 0,
        customerId: ''
      })
    } catch (err) {
      this.customersLoaded = false
      console.warn('load customer options failed', err)
    }
  },

  async loadMyShopOptions() {
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
    const options = [{ _id: '', shopName: '全部店铺' }].concat(enabled)
    const currentId = this.data.myShopId
    const index = options.findIndex(item => item._id === currentId)
    this.setData({
      myShopOptions: options,
      myShopNames: options.map(item => item.shopName),
      myShopIndex: index >= 0 ? index : 0,
      myShopId: index >= 0 ? currentId : ''
    })
  },

  onMyShopChange(event) {
    const index = Number(event.detail.value) || 0
    const option = this.data.myShopOptions[index] || { _id: '' }
    this.setData({ myShopIndex: index, myShopId: option._id || '' })
    this.load(true)
  },

  async loadStaffShops(customerId) {
    const emptyOptions = [{ _id: '', shopName: '全部店铺' }]
    if (!customerId) {
      this.setData({
        staffShopOptions: emptyOptions,
        staffShopNames: ['全部店铺'],
        staffShopIndex: 0,
        staffShopId: ''
      })
      return
    }
    try {
      const data = await api.call('listCustomerShops', { customerId })
      const shops = (data.shops || []).filter(shop => shop.enabled !== false)
      const options = emptyOptions.concat(shops)
      this.setData({
        staffShopOptions: options,
        staffShopNames: options.map(item => item.shopName),
        staffShopIndex: 0,
        staffShopId: ''
      })
    } catch (err) {
      this.setData({
        staffShopOptions: emptyOptions,
        staffShopNames: ['全部店铺'],
        staffShopIndex: 0,
        staffShopId: ''
      })
    }
  },

  onStaffShopChange(event) {
    const index = Number(event.detail.value) || 0
    const option = this.data.staffShopOptions[index] || { _id: '' }
    this.setData({ staffShopIndex: index, staffShopId: option._id || '' })
    this.load(true)
  },

  selectRange(event) {
    const value = event.currentTarget.dataset.value
    if (!value || value === this.data.rangeType) return
    this.setData({ rangeType: value })
    this.load(true)
  },

  onMonthChange(event) {
    const value = event.detail.value
    if (!value) return
    this.setData({ monthValue: value, rangeType: 'month' })
    this.load(true)
  },

  onCustomerChange(event) {
    const index = Number(event.detail.value) || 0
    const option = this.data.customerOptions[index] || { _id: '' }
    this.setData({
      customerIndex: index,
      customerId: option._id || '',
      staffShopOptions: [{ _id: '', shopName: '全部店铺' }],
      staffShopNames: ['全部店铺'],
      staffShopIndex: 0,
      staffShopId: ''
    })
    this.loadStaffShops(option._id || '')
    this.load(true)
  },

  toggleOrderSelect(event) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    const selectedIds = this.data.selectedIds.slice()
    const index = selectedIds.indexOf(id)
    if (index >= 0) {
      selectedIds.splice(index, 1)
    } else {
      if (selectedIds.length >= 100) {
        wx.showToast({ title: '一次最多选择 100 单', icon: 'none' })
        return
      }
      selectedIds.push(id)
    }
    const list = this.data.list.map(item => item._id === id
      ? { ...item, selected: index < 0 }
      : item)
    this.setData({
      selectedIds,
      selectedCount: selectedIds.length,
      list
    })
  },

  async exportOrders() {
    if (this.data.exporting) return
    if (!this.data.selectedIds.length) {
      wx.showToast({ title: '请先勾选要导出的订单', icon: 'none' })
      return
    }

    this.setData({ exporting: true })
    try {
      const data = await api.call('exportStaffOrders', { ids: this.data.selectedIds })
      this.saveExcel(data)
    } catch (err) {
      api.toastError(err)
    } finally {
      this.setData({ exporting: false })
    }
  },

  saveExcel(data) {
    if (!data || !data.base64) {
      wx.showToast({ title: '导出文件生成失败', icon: 'none' })
      return
    }
    const filePath = `${wx.env.USER_DATA_PATH}/${data.filename || '订单导出.xlsx'}`
    wx.getFileSystemManager().writeFile({
      filePath,
      data: data.base64,
      encoding: 'base64',
      success: () => {
        if (data.truncated) {
          wx.showToast({ title: `仅导出最近 ${data.orderCount} 单`, icon: 'none', duration: 2400 })
        }
        wx.openDocument({
          filePath,
          fileType: 'xlsx',
          showMenu: true,
          fail: () => {
            if (typeof wx.shareFileMessage === 'function') {
              wx.shareFileMessage({
                filePath,
                fileName: data.filename || '订单导出.xlsx',
                fail: () => wx.showToast({ title: '文件已生成，请稍后重试', icon: 'none' })
              })
            } else {
              wx.showToast({ title: '当前版本不支持打开该文件', icon: 'none' })
            }
          }
        })
      },
      fail: () => wx.showToast({ title: '文件保存失败', icon: 'none' })
    })
  },

  onSalesChange(event) {
    const index = Number(event.detail.value) || 0
    const option = this.data.salesOptions[index] || { _id: '' }
    this.setData({ salesIndex: index, salesId: option._id || '' })
    this.load(true)
  },

  goDetail(event) {
    wx.navigateTo({ url: `/pages/order-detail/index?id=${event.currentTarget.dataset.id}` })
  },

  cancelOrder(event) {
    const id = event.currentTarget.dataset.id
    const order = this.data.list.find(item => item._id === id)
    if (!order || order.status !== 'DONE') return
    wx.showModal({
      title: '取消订单',
      content: '取消后商品销量会回滚，确认取消该订单？',
      confirmText: '取消订单',
      confirmColor: '#e2572b',
      cancelText: '再想想',
      success: async res => {
        if (!res.confirm) return
        try {
          await api.call('cancelMyOrder', { id })
          wx.showToast({ title: '订单已取消', icon: 'none' })
          this.load(true)
        } catch (err) {
          api.toastError(err)
        }
      }
    })
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
    const checkout = {
      source: 'reorder',
      editable: true,
      items
    }
    if (order.shopId) checkout.shopId = order.shopId
    wx.setStorageSync('mall_checkout', checkout)
    wx.navigateTo({ url: '/pages/checkout/index' })
  },

  goShopping() {
    wx.switchTab({ url: '/pages/products/index' })
  }
})

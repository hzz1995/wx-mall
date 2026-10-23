const icons = require('../utils/tabbar-icons')

Component({
  data: {
    selected: 0,
    hidden: false,
    cartCount: 0,
    list: [
      {
        pagePath: '/pages/products/index',
        text: '全部商品',
        icon: icons.grid,
        activeIcon: icons.gridActive
      },
      {
        pagePath: '/pages/cart/index',
        text: '购物车',
        icon: icons.cart,
        activeIcon: icons.cartActive
      },
      {
        pagePath: '/pages/mine/index',
        text: '我的',
        icon: icons.user,
        activeIcon: icons.userActive
      }
    ]
  },

  lifetimes: {
    attached() {
      this.syncSelected()
      this.refreshCartCount()
    }
  },

  pageLifetimes: {
    show() {
      this.setData({ hidden: false })
      this.syncSelected()
      this.refreshCartCount()
    }
  },

  methods: {
    syncSelected() {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (!current || !current.route) return
      const path = `/${current.route}`
      const index = this.data.list.findIndex(item => item.pagePath === path)
      if (index >= 0 && index !== this.data.selected) {
        this.setData({ selected: index })
      }
    },

    refreshCartCount() {
      const count = Number(wx.getStorageSync('mall_cart_count')) || 0
      if (count !== this.data.cartCount) {
        this.setData({ cartCount: count })
      }
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (!item || index === this.data.selected) return
      wx.switchTab({ url: item.pagePath })
    }
  }
})

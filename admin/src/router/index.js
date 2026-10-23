import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Layout from '../views/Layout.vue'
import Orders from '../views/Orders.vue'
import Carts from '../views/Carts.vue'
import Products from '../views/Products.vue'
import Categories from '../views/Categories.vue'
import Users from '../views/Users.vue'
import Customers from '../views/Customers.vue'
import Reports from '../views/Reports.vue'
import AuditLogs from '../views/AuditLogs.vue'
import Qrcode from '../views/Qrcode.vue'
import Settings from '../views/Settings.vue'
import { getAdminUser } from '../api'

function homeFor(user) {
  return user && user.type === 'YY' ? '/products' : '/orders'
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login, meta: { public: true, title: '登录' } },
    {
      path: '/',
      component: Layout,
      redirect: '/orders',
      children: [
        { path: 'orders', component: Orders, meta: { title: '订单管理', roles: ['GLY', 'XS'] } },
        { path: 'carts', component: Carts, meta: { title: '购物车', roles: ['GLY', 'XS'] } },
        { path: 'products', component: Products, meta: { title: '商品管理', roles: ['GLY', 'YY'] } },
        { path: 'categories', component: Categories, meta: { title: '分类管理', roles: ['GLY', 'YY'] } },
        { path: 'users', component: Users, meta: { title: '用户管理', roles: ['GLY'] } },
        { path: 'audit-logs', component: AuditLogs, meta: { title: '操作日志', roles: ['GLY'] } },
        { path: 'customers', component: Customers, meta: { title: '客户汇总', roles: ['GLY', 'XS'] } },
        { path: 'reports', component: Reports, meta: { title: '数据报表', roles: ['GLY'] } },
        { path: 'qrcode', component: Qrcode, meta: { title: '小程序码', roles: ['GLY'] } },
        { path: 'settings', component: Settings, meta: { title: '店铺设置', roles: ['GLY'] } }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/orders' }
  ]
})

router.beforeEach(to => {
  const token = localStorage.getItem('mall_admin_token')
  const user = getAdminUser()
  if (!to.meta.public && !token) return '/login'
  if (to.path === '/login' && token) return homeFor(user)
  if (user && to.meta.roles && !to.meta.roles.includes(user.type)) return homeFor(user)
  document.title = `${to.meta.title || '管理后台'} · 祥哥小铺`
})

export default router

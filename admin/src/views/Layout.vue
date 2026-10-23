<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">
        <div class="brand-mark">店</div>
        <div>
          <div class="brand-name">祥哥小铺</div>
          <div class="brand-sub">管理后台</div>
        </div>
      </div>

      <nav class="nav">
        <router-link
          v-for="item in menus"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="active"
        >
          <span class="nav-dot"></span>
          {{ item.title }}
        </router-link>
      </nav>

      <div class="side-foot">
        <div class="side-tip">商品与订单管理</div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar-title">{{ route.meta.title }}</div>
        <div class="topbar-actions">
          <span class="role-chip">{{ roleLabel }}</span>
          <span v-if="connected === true" class="conn ok">● 服务已连接</span>
          <span v-else-if="connected === false" class="conn bad">● 服务未连接</span>
          <el-button link @click="logout">退出登录</el-button>
        </div>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, clearToken, getAdminUser, setAdminUser } from '../api'

const route = useRoute()
const router = useRouter()
const connected = ref(null)
const adminUser = ref(getAdminUser())

const ALL_MENUS = [
  { path: '/reports', title: '数据报表', roles: ['GLY'] },
  { path: '/orders', title: '订单管理', roles: ['GLY', 'XS'] },
  { path: '/carts', title: '购物车', roles: ['GLY', 'XS'] },
  { path: '/customers', title: '客户汇总', roles: ['GLY', 'XS'] },
  { path: '/products', title: '商品管理', roles: ['GLY', 'YY'] },
  { path: '/categories', title: '分类管理', roles: ['GLY', 'YY'] },
  { path: '/users', title: '用户管理', roles: ['GLY'] },
  { path: '/audit-logs', title: '操作日志', roles: ['GLY'] },
  { path: '/qrcode', title: '小程序码', roles: ['GLY'] },
  { path: '/settings', title: '店铺设置', roles: ['GLY'] }
]

const roleLabel = computed(() => {
  const type = adminUser.value && adminUser.value.type
  if (type === 'XS') return '销售'
  if (type === 'YY') return '运营'
  if (type === 'GLY') return '管理员'
  return ''
})

const menus = computed(() => {
  const role = adminUser.value ? adminUser.value.type : 'GLY'
  return ALL_MENUS.filter(item => item.roles.includes(role))
})

onMounted(async () => {
  try {
    await api.health()
    connected.value = true
  } catch (err) {
    connected.value = false
  }

  try {
    const data = await api.me()
    adminUser.value = data.user
    setAdminUser(data.user)
    if (route.meta.roles && !route.meta.roles.includes(data.user.type)) {
      router.replace(data.user.type === 'YY' ? '/products' : '/orders')
    }
  } catch (err) {
    // 401 已由请求封装处理，其他错误保留当前状态
  }
})

function logout() {
  clearToken()
  router.replace('/login')
}
</script>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}

.side {
  width: 220px;
  flex: 0 0 220px;
  background: #1f4d3b;
  color: #eef3ef;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 28px 24px 30px;
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
}

.brand-sub {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(238, 243, 239, 0.55);
  letter-spacing: 2px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  color: rgba(238, 243, 239, 0.72);
  text-decoration: none;
  font-size: 14px;
  transition: background 0.18s ease, color 0.18s ease;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #ffffff;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  font-weight: 500;
}

.nav-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
}

.side-foot {
  margin-top: auto;
  padding: 24px;
}

.side-tip {
  font-size: 11px;
  line-height: 1.8;
  color: rgba(238, 243, 239, 0.38);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 64px;
  flex: 0 0 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  background: rgba(251, 250, 246, 0.9);
  border-bottom: 1px solid #e9e4d9;
  position: sticky;
  top: 0;
  z-index: 5;
  backdrop-filter: blur(6px);
}

.topbar-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 18px;
}

.role-chip {
  padding: 2px 10px;
  border-radius: 20px;
  background: #eef3ef;
  color: #1f4d3b;
  font-size: 12px;
}

.conn {
  font-size: 12px;
}

.conn.ok {
  color: #2f7a5a;
}

.conn.bad {
  color: #c0502d;
}

.content {
  flex: 1;
  overflow: auto;
}

@media (max-width: 900px) {
  .shell {
    flex-direction: column;
  }

  .side {
    position: static;
    width: 100%;
    height: auto;
    flex: 0 0 auto;
  }

  .brand {
    padding: 18px 20px 10px;
  }

  .nav {
    flex-direction: row;
    flex-wrap: wrap;
    padding: 0 14px 12px;
  }

  .nav-item {
    padding: 8px 12px;
  }

  .side-foot {
    display: none;
  }

  .topbar {
    height: auto;
    flex-basis: auto;
    padding: 14px 20px;
  }
}
</style>

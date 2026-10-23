<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>订单</h2>
        <p class="sub">客户在小程序提交的订单会出现在这里，无需在线支付</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="toolbar">
      <el-select
        v-model="filters.status"
        placeholder="全部状态"
        clearable
        style="width: 140px"
        @change="search"
      >
        <el-option label="已完成" value="DONE" />
        <el-option label="已取消" value="CANCELLED" />
      </el-select>
      <el-select
        v-if="isAdmin"
        v-model="filters.salesId"
        placeholder="全部销售"
        clearable
        style="width: 150px"
        @change="search"
      >
        <el-option v-for="item in salesList" :key="item._id" :label="item.name" :value="item._id" />
      </el-select>
      <el-input
        v-model="filters.keyword"
        placeholder="姓名 / 手机号 / 订单号 / 店铺"
        clearable
        style="width: 260px"
        @keyup.enter="search"
        @clear="search"
      >
        <template #append>
          <el-button @click="search">搜索</el-button>
        </template>
      </el-input>
      <span class="total">共 {{ total }} 单</span>
    </div>

    <el-table v-loading="loading" :data="list" row-key="_id" empty-text="还没有订单">
      <el-table-column label="订单" width="190">
        <template #default="{ row }">
          <div class="mono">{{ row.orderNo }}</div>
          <div class="muted">{{ time(row.createdAt) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="客户" width="170">
        <template #default="{ row }">
          <div>{{ row.customerName }}</div>
          <div class="muted">{{ row.shopName || '—' }}</div>
          <div class="muted">{{ row.phone }}</div>
        </template>
      </el-table-column>
      <el-table-column label="负责销售" width="110">
        <template #default="{ row }">{{ row.salesName || '—' }}</template>
      </el-table-column>
      <el-table-column label="商品" min-width="180">
        <template #default="{ row }">
          <div>
            {{ firstItem(row).name || '-' }}
            <span v-if="(row.items || []).length > 1" class="muted">等 {{ row.items.length }} 种</span>
          </div>
          <div class="muted">× {{ totalQuantity(row) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="{ muted: !row.remark }">{{ row.remark || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="100">
        <template #default="{ row }">
          <span class="amount">¥{{ money(row.totalAmount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" effect="light">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button v-if="isAdmin && row.status === 'DONE'" link type="danger" @click="cancel(row)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        background
        layout="prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPage"
      />
    </div>

    <el-drawer v-model="detailVisible" title="订单详情" size="480px">
      <template v-if="current">
        <div class="drawer-head">
          <el-tag :type="statusType(current.status)" effect="light">{{ statusText(current.status) }}</el-tag>
          <span class="muted">{{ time(current.createdAt) }}</span>
        </div>

        <div class="detail-block">
          <div class="detail-row"><span>订单号</span><b>{{ current.orderNo }}</b></div>
          <div class="detail-row"><span>客户姓名</span><b>{{ current.customerName }}</b></div>
          <div class="detail-row"><span>手机号</span><b>{{ current.phone }}</b></div>
          <div class="detail-row" v-if="current.shopName"><span>店铺名称</span><b>{{ current.shopName }}</b></div>
          <div class="detail-row" v-if="current.salesName"><span>负责销售</span><b>{{ current.salesName }}</b></div>
          <div class="detail-row" v-if="current.address"><span>收货地址</span><b>{{ current.address }}</b></div>
          <div class="detail-row"><span>备注</span><b>{{ current.remark || '—' }}</b></div>
        </div>

        <el-divider content-position="left">商品</el-divider>

        <div v-for="(item, index) in current.items" :key="index" class="order-item">
          <img v-if="item.imageUrl" :src="item.imageUrl" class="item-thumb" alt="" />
          <div v-else class="item-thumb thumb-empty">无图</div>
          <div class="item-main">
            <div>{{ item.name }}</div>
            <div class="muted">¥{{ money(item.price) }} × {{ item.quantity }}</div>
          </div>
          <div class="amount">¥{{ money(item.price * item.quantity) }}</div>
        </div>

        <div class="total-line">
          合计 <span class="amount total-amount">¥{{ money(current.totalAmount) }}</span>
        </div>

        <el-button
          v-if="isAdmin && current.status === 'DONE'"
          type="danger"
          plain
          style="margin-top: 26px; width: 100%"
          @click="cancel(current)"
        >取消该订单</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, getAdminUser } from '../api'
import { money, time, statusText, statusType } from '../utils'

const isAdmin = computed(() => {
  const user = getAdminUser()
  return !user || user.type === 'GLY'
})

const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const filters = reactive({ status: '', salesId: '', keyword: '' })
const salesList = ref([])

const detailVisible = ref(false)
const current = ref(null)

function firstItem(row) {
  return (row.items && row.items[0]) || {}
}

function totalQuantity(row) {
  return (row.items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0)
}

async function load() {
  loading.value = true
  try {
    const data = await api.orders({
      status: filters.status || '',
      salesId: filters.salesId || '',
      keyword: filters.keyword.trim(),
      page: page.value,
      pageSize
    })
    list.value = data.list || []
    total.value = data.total || 0
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function onPage(value) {
  page.value = value
  load()
}

async function openDetail(row) {
  detailVisible.value = true
  current.value = row
  try {
    const data = await api.order(row._id)
    current.value = data.order
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function cancel(row) {
  try {
    await ElMessageBox.confirm(
      `确认取消订单 ${row.orderNo}？取消后会回滚商品销量。`,
      '取消订单',
      { confirmButtonText: '确认取消', cancelButtonText: '再想想', type: 'warning' }
    )
  } catch (err) {
    return
  }

  try {
    await api.cancelOrder(row._id)
    ElMessage.success('订单已取消')
    detailVisible.value = false
    load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function loadSales() {
  try {
    const data = await api.sales()
    salesList.value = data.list || []
  } catch (err) {
    // 销售列表加载失败不影响订单查看
  }
}

onMounted(() => {
  load()
  if (isAdmin.value) loadSales()
})
</script>

<style scoped>
.mono {
  font-family: 'DIN Alternate', Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.3px;
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.detail-block {
  background: #fbfaf6;
  border: 1px solid #e9e4d9;
  border-radius: 10px;
  padding: 8px 16px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  font-size: 13px;
  border-bottom: 1px dashed #e9e4d9;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row span {
  color: #8c8b82;
  flex: 0 0 auto;
}

.detail-row b {
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f0ede5;
}

.item-thumb {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
  flex: 0 0 48px;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.total-line {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  font-size: 13px;
  color: #8c8b82;
}

.total-amount {
  font-size: 22px;
}
</style>

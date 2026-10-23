<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>{{ isSales ? '客户购物车' : '购物车' }}</h2>
        <p class="sub">{{ isSales ? '只显示分配给你的客户当前购物车' : '客户当前购物车明细，仅用于经营参考' }}</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="toolbar">
      <el-select
        v-if="!isSales"
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
        placeholder="客户姓名 / 手机号 / 店铺"
        clearable
        style="width: 280px"
        @keyup.enter="search"
        @clear="search"
      >
        <template #append>
          <el-button @click="search">搜索</el-button>
        </template>
      </el-input>
      <span class="total">共 {{ total }} 个购物车</span>
    </div>

    <el-table v-loading="loading" :data="list" row-key="_id" empty-text="暂无购物车数据">
      <el-table-column label="客户" width="160">
        <template #default="{ row }">
          <div>{{ row.userName }}</div>
          <div class="muted">{{ row.phone }}</div>
        </template>
      </el-table-column>
      <el-table-column label="店铺 / 收货地址" min-width="220">
        <template #default="{ row }">
          <div>{{ row.shopName || '—' }}</div>
          <div class="muted">{{ row.address || '未填写收货地址' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="商品" min-width="190">
        <template #default="{ row }">
          <div>{{ firstItem(row).name || '—' }}</div>
          <div class="muted">
            {{ (row.items || []).length }} 种商品
            <span v-if="row.hasOffSale"> · 含下架商品</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="数量" width="80">
        <template #default="{ row }">{{ row.totalQuantity }}</template>
      </el-table-column>
      <el-table-column label="金额" width="110">
        <template #default="{ row }">
          <span class="amount">¥{{ money(row.totalAmount) }}</span>
        </template>
      </el-table-column>
      <el-table-column v-if="!isSales" label="负责销售" width="110">
        <template #default="{ row }">{{ row.salesName || '—' }}</template>
      </el-table-column>
      <el-table-column label="最近更新" width="160">
        <template #default="{ row }">{{ time(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">明细</el-button>
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

    <el-drawer v-model="detailVisible" title="购物车明细" size="480px">
      <template v-if="current">
        <div class="detail-block">
          <div class="detail-row"><span>客户</span><b>{{ current.userName }}</b></div>
          <div class="detail-row"><span>手机号</span><b>{{ current.phone }}</b></div>
          <div class="detail-row"><span>店铺名称</span><b>{{ current.shopName || '—' }}</b></div>
          <div class="detail-row"><span>收货地址</span><b>{{ current.address || '—' }}</b></div>
          <div class="detail-row" v-if="current.salesName"><span>负责销售</span><b>{{ current.salesName }}</b></div>
          <div class="detail-row"><span>最近更新</span><b>{{ time(current.updatedAt) }}</b></div>
        </div>

        <el-divider content-position="left">商品</el-divider>

        <div v-for="(item, index) in current.items" :key="index" class="cart-item">
          <div class="cart-main">
            <div>
              {{ item.name }}
              <el-tag v-if="!item.onSale" size="small" type="info" effect="plain">已下架</el-tag>
            </div>
            <div class="muted">
              ¥{{ money(item.price) }} × {{ item.quantity }}
              · {{ item.checked ? '已勾选' : '未勾选' }}
            </div>
          </div>
          <div class="amount">¥{{ money(item.price * item.quantity) }}</div>
        </div>

        <div class="total-line">
          合计 <span class="amount total-amount">¥{{ money(current.totalAmount) }}</span>
        </div>
        <div class="hint">合计只统计当前在售商品，未勾选商品也包含在内。</div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, getAdminUser } from '../api'
import { money, time } from '../utils'

const adminUser = getAdminUser()
const isSales = Boolean(adminUser && adminUser.type === 'XS')

const list = ref([])
const salesList = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const detailVisible = ref(false)
const current = ref(null)
const filters = reactive({ keyword: '', salesId: '' })

function firstItem(row) {
  return (row.items && row.items[0]) || {}
}

async function load() {
  loading.value = true
  try {
    const data = await api.carts({
      keyword: filters.keyword.trim(),
      salesId: filters.salesId || '',
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

function openDetail(row) {
  current.value = row
  detailVisible.value = true
}

async function loadSales() {
  if (isSales) return
  try {
    const data = await api.sales()
    salesList.value = data.list || []
  } catch (err) {
    // 销售列表失败不影响购物车查看
  }
}

onMounted(() => {
  load()
  loadSales()
})
</script>

<style scoped>
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

.cart-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #f0ede5;
}

.cart-main {
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

.hint {
  margin-top: 10px;
  text-align: right;
  font-size: 12px;
  color: #8c8b82;
}
</style>

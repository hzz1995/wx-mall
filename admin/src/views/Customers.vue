<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>{{ isSales ? '我的客户' : '客户' }}</h2>
        <p class="sub">{{ isSales ? '只显示分配给你的客户与订单统计' : '客户账号与已完成订单汇总' }}</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-alert
      v-if="truncated"
      type="warning"
      :closable="false"
      show-icon
      title="数据量较大，仅统计最近 1000 位客户与 1000 条订单"
      style="margin-bottom: 16px"
    />

    <div class="toolbar">
      <el-select
        v-if="!isSales"
        v-model="filters.salesId"
        placeholder="全部销售"
        clearable
        style="width: 150px"
        @change="load"
      >
        <el-option v-for="item in salesList" :key="item._id" :label="item.name" :value="item._id" />
      </el-select>
      <el-input v-model="filters.keyword" placeholder="搜索姓名 / 手机号 / 店铺" clearable style="width: 280px" />
      <span class="total">共 {{ filtered.length }} 位客户</span>
    </div>

    <el-table v-loading="loading" :data="filtered" row-key="userId" empty-text="还没有客户账号">
      <el-table-column label="客户" min-width="160">
        <template #default="{ row }">
          <div>{{ row.name || '未填写' }}</div>
          <div class="muted">{{ row.phone || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="店铺 / 收货地址" min-width="240">
        <template #default="{ row }">
          <div :class="{ muted: !row.shopName }">{{ row.shopName || '—' }}</div>
          <div class="muted">{{ row.address || '未填写收货地址' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="负责销售" width="120">
        <template #default="{ row }">
          <span :class="{ muted: !row.salesName }">{{ row.salesName || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="订单数" width="90">
        <template #default="{ row }">{{ row.orderCount }}</template>
      </el-table-column>
      <el-table-column label="累计消费" width="130">
        <template #default="{ row }">
          <span class="amount">¥{{ money(row.totalAmount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="最近下单" width="160">
        <template #default="{ row }">
          <span :class="{ muted: !row.lastOrderAt }">{{ row.lastOrderAt ? time(row.lastOrderAt) : '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" effect="light">{{ row.enabled ? '正常' : '停用' }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, getAdminUser } from '../api'
import { money, time } from '../utils'

const adminUser = getAdminUser()
const isSales = Boolean(adminUser && adminUser.type === 'XS')

const list = ref([])
const salesList = ref([])
const loading = ref(false)
const truncated = ref(false)
const filters = reactive({ keyword: '', salesId: '' })

const filtered = computed(() => {
  const text = filters.keyword.trim()
  if (!text) return list.value
  return list.value.filter(item =>
    String(item.name || '').includes(text) ||
    String(item.phone || '').includes(text) ||
    String(item.shopName || '').includes(text)
  )
})

async function load() {
  loading.value = true
  try {
    const data = await api.customers({ salesId: filters.salesId || '' })
    list.value = data.list || []
    truncated.value = Boolean(data.truncated)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function loadSales() {
  if (isSales) return
  try {
    const data = await api.sales()
    salesList.value = data.list || []
  } catch (err) {
    // 销售列表失败不影响客户查看
  }
}

onMounted(() => {
  load()
  loadSales()
})
</script>

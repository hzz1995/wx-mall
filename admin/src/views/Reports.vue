<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>数据报表</h2>
        <p class="sub">{{ rangeText }} · 共 {{ summary.orderCount || 0 }} 条已完成订单，取消订单不计入</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="toolbar report-toolbar">
      <el-select v-model="rangeType" style="width: 160px" @change="onRangeChange">
        <el-option v-for="item in rangeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-date-picker
        v-if="rangeType === 'custom'"
        v-model="customRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        :clearable="false"
        style="width: 300px"
        @change="onCustomRangeChange"
      />
      <span class="range-text">{{ rangeText }}，最多跨度一年</span>
    </div>

    <el-alert
      v-if="truncated"
      type="warning"
      :closable="false"
      show-icon
      title="订单量较大，仅统计最近 3000 条已完成订单，排行可能不完整"
      style="margin-bottom: 16px"
    />

    <div class="stat-grid">
      <div v-for="item in stats" :key="item.label" class="stat-card">
        <div class="stat-label">{{ item.label }}</div>
        <div class="stat-value">{{ item.value }}</div>
        <div class="stat-sub">{{ item.sub }}</div>
      </div>
    </div>

    <div class="panel-grid">
      <div class="panel">
        <div class="panel-head">
          <h3>商品采购最多</h3>
          <span>按购买数量 · 前10</span>
        </div>
        <el-table v-loading="loading" :data="topProducts" size="small" empty-text="暂无订单">
          <el-table-column type="index" label="#" width="46" />
          <el-table-column prop="name" label="商品" min-width="150" show-overflow-tooltip />
          <el-table-column prop="quantity" label="数量" width="70" />
          <el-table-column prop="orderCount" label="订单数" width="76" />
          <el-table-column label="金额" width="100">
            <template #default="{ row }"><span class="amount">¥{{ money(row.amount) }}</span></template>
          </el-table-column>
        </el-table>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>商品采购最少</h3>
          <span>区间内有采购 · 前10</span>
        </div>
        <el-table v-loading="loading" :data="bottomProducts" size="small" empty-text="暂无商品">
          <el-table-column type="index" label="#" width="46" />
          <el-table-column prop="name" label="商品" min-width="150" show-overflow-tooltip />
          <el-table-column prop="quantity" label="数量" width="70" />
          <el-table-column prop="orderCount" label="订单数" width="76" />
          <el-table-column label="金额" width="100">
            <template #default="{ row }"><span class="amount">¥{{ money(row.amount) }}</span></template>
          </el-table-column>
        </el-table>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>客户下单最多</h3>
          <span>按订单数 · 前10</span>
        </div>
        <el-table v-loading="loading" :data="topCustomers" size="small" empty-text="暂无客户">
          <el-table-column type="index" label="#" width="46" />
          <el-table-column label="客户" min-width="150">
            <template #default="{ row }">
              <div>{{ row.name || '未填写' }}</div>
              <div class="muted">{{ row.shopName || row.phone || '—' }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="orderCount" label="订单数" width="76" />
          <el-table-column label="累计金额" width="110">
            <template #default="{ row }"><span class="amount">¥{{ money(row.totalAmount) }}</span></template>
          </el-table-column>
          <el-table-column label="最近下单" width="150">
            <template #default="{ row }">{{ row.lastOrderAt ? time(row.lastOrderAt) : '—' }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h3>客户下单最少</h3>
          <span>区间内有下单 · 前10</span>
        </div>
        <el-table v-loading="loading" :data="bottomCustomers" size="small" empty-text="暂无客户">
          <el-table-column type="index" label="#" width="46" />
          <el-table-column label="客户" min-width="150">
            <template #default="{ row }">
              <div>{{ row.name || '未填写' }}</div>
              <div class="muted">{{ row.shopName || row.phone || '—' }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="orderCount" label="订单数" width="76" />
          <el-table-column label="累计金额" width="110">
            <template #default="{ row }"><span class="amount">¥{{ money(row.totalAmount) }}</span></template>
          </el-table-column>
          <el-table-column label="最近下单" width="150">
            <template #default="{ row }">{{ row.lastOrderAt ? time(row.lastOrderAt) : '—' }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="panel wide">
        <div class="panel-head">
          <h3>销售业绩排行</h3>
          <span>按已完成订单金额 · 前10</span>
        </div>
        <el-table v-loading="loading" :data="salesRanking" size="small" empty-text="暂无销售账号">
          <el-table-column type="index" label="#" width="46" />
          <el-table-column label="销售" min-width="150">
            <template #default="{ row }">
              <div>{{ row.name }}</div>
              <div class="muted">{{ row.phone }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="customerCount" label="客户数" width="90" />
          <el-table-column prop="orderCount" label="订单数" width="90" />
          <el-table-column label="业绩金额" width="120">
            <template #default="{ row }"><span class="amount">¥{{ money(row.totalAmount) }}</span></template>
          </el-table-column>
          <el-table-column label="业绩占比" min-width="200">
            <template #default="{ row }">
              <el-progress :percentage="salesPercent(row.totalAmount)" :stroke-width="8" :show-text="false" />
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import { money, time } from '../utils'

const loading = ref(false)
const truncated = ref(false)
const summary = ref({})
const topProducts = ref([])
const bottomProducts = ref([])
const topCustomers = ref([])
const bottomCustomers = ref([])
const salesRanking = ref([])

const rangeOptions = [
  { label: '今天', value: 'today' },
  { label: '昨天', value: 'yesterday' },
  { label: '最近一周', value: 'week' },
  { label: '最近一月', value: 'month' },
  { label: '最近三个月', value: '3month' },
  { label: '最近半年', value: '6month' },
  { label: '最近一年', value: 'year' },
  { label: '自定义', value: 'custom' }
]
const rangeType = ref('today')
const customRange = ref([])

const rangeText = computed(() => {
  if (rangeType.value === 'custom') {
    return customRange.value && customRange.value.length === 2
      ? `${customRange.value[0]} 至 ${customRange.value[1]}`
      : '请选择日期范围'
  }
  const option = rangeOptions.find(item => item.value === rangeType.value)
  return option ? option.label : '今天'
})

const stats = computed(() => [
  { label: '总订单', value: summary.value.orderCount || 0, sub: '已完成订单' },
  { label: '总金额', value: `¥${money(summary.value.totalAmount || 0)}`, sub: '订单金额合计' },
  { label: '商品件数', value: summary.value.totalItems || 0, sub: '累计购买数量' },
  { label: '下单客户', value: summary.value.customerCount || 0, sub: '有订单的客户' },
  { label: '动销商品', value: summary.value.productCount || 0, sub: '区间内有采购的商品' },
  { label: '有业绩销售', value: summary.value.salesCount || 0, sub: '区间内有订单的销售' }
])

const maxSalesAmount = computed(() => {
  return Math.max(1, ...salesRanking.value.map(item => Number(item.totalAmount) || 0))
})

function salesPercent(amount) {
  return Math.round(((Number(amount) || 0) / maxSalesAmount.value) * 100)
}

function getRangeParams() {
  const now = dayjs()
  if (rangeType.value === 'custom') {
    if (!customRange.value || customRange.value.length !== 2) return null
    const start = dayjs(customRange.value[0]).startOf('day')
    const end = dayjs(customRange.value[1]).endOf('day')
    if (end.diff(start, 'day', true) > 366) {
      ElMessage.warning('统计时间跨度不能超过一年')
      return null
    }
    return { start: start.valueOf(), end: end.valueOf() }
  }

  let start = now.startOf('day')
  let end = now
  if (rangeType.value === 'yesterday') {
    start = now.subtract(1, 'day').startOf('day')
    end = now.subtract(1, 'day').endOf('day')
  } else if (rangeType.value === 'week') {
    start = now.subtract(6, 'day').startOf('day')
  } else if (rangeType.value === 'month') {
    start = now.subtract(29, 'day').startOf('day')
  } else if (rangeType.value === '3month') {
    start = now.subtract(3, 'month').startOf('day')
  } else if (rangeType.value === '6month') {
    start = now.subtract(6, 'month').startOf('day')
  } else if (rangeType.value === 'year') {
    start = now.subtract(1, 'year').startOf('day')
  }
  return { start: start.valueOf(), end: end.valueOf() }
}

function onRangeChange() {
  if (rangeType.value === 'custom') return
  load()
}

function onCustomRangeChange() {
  if (!customRange.value || customRange.value.length !== 2) return
  load()
}

async function load() {
  const params = getRangeParams()
  if (params === null) return

  loading.value = true
  try {
    const data = await api.reports(params)
    summary.value = data.summary || {}
    topProducts.value = data.topProducts || []
    bottomProducts.value = data.bottomProducts || []
    topCustomers.value = data.topCustomers || []
    bottomCustomers.value = data.bottomCustomers || []
    salesRanking.value = data.salesRanking || []
    truncated.value = Boolean(data.truncated)
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.stat-card {
  background: #fffdf8;
  border: 1px solid #e9e4d9;
  border-radius: 12px;
  padding: 18px;
}

.stat-label {
  font-size: 12px;
  color: #8c8b82;
}

.stat-value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 600;
  color: #23241f;
  letter-spacing: 0.5px;
}

.stat-sub {
  margin-top: 4px;
  font-size: 11px;
  color: #b0ada3;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.report-toolbar {
  margin-bottom: 18px;
}

.range-text {
  font-size: 12px;
  color: #8c8b82;
}

.panel {
  background: #fffdf8;
  border: 1px solid #e9e4d9;
  border-radius: 12px;
  padding: 18px 20px;
  min-width: 0;
}

.panel.wide {
  grid-column: 1 / -1;
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-head h3 {
  margin: 0;
  font-size: 15px;
}

.panel-head span {
  font-size: 12px;
  color: #8c8b82;
}

@media (max-width: 1280px) {
  .stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }
}
</style>

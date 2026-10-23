<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>操作日志</h2>
        <p class="sub">记录商品和分类的新增、编辑、删除操作；默认最近 7 天，最长 14 天</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索商品/分类名称"
        clearable
        style="width: 240px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-date-picker
        v-model="auditRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        :clearable="false"
        style="width: 280px"
        @change="search"
      />
      <el-select v-model="action" placeholder="全部操作" clearable style="width: 170px" @change="search">
        <el-option v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-tag v-if="resourceId" closable type="info" @close="clearResourceFilter">
        {{ resourceLabel(resource) }}：{{ resourceName || resourceId }}
      </el-tag>
      <span class="total">共 {{ total }} 条记录</span>
    </div>

    <el-alert
      v-if="warning"
      type="warning"
      :closable="false"
      show-icon
      :title="warning"
      style="margin-bottom: 16px"
    />

    <el-table v-loading="loading" :data="list" row-key="_id" empty-text="还没有操作记录">
      <el-table-column label="时间" width="150">
        <template #default="{ row }">{{ time(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作人" width="180">
        <template #default="{ row }">
          <div>{{ row.operatorName || '—' }}</div>
          <div class="muted">{{ row.operatorPhone || '—' }} · {{ roleLabel(row.operatorType) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110">
        <template #default="{ row }">
          <el-tag :type="actionType(row.action)" effect="light">{{ actionLabel(row.action) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="对象" min-width="200">
        <template #default="{ row }">
          <div>{{ row.resourceName || '—' }}</div>
          <div class="muted">{{ resourceLabel(row.resource) }} · {{ row.resourceId || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="详情" width="90">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">查看</el-button>
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

    <el-dialog v-model="detailVisible" title="操作详情" width="760px">
      <div class="detail-head">
        <span>{{ actionLabel(detail.action) }} · {{ detail.resourceName || '—' }}</span>
        <span class="muted">{{ time(detail.createdAt) }}</span>
      </div>
      <div class="detail-meta">
        操作人：{{ detail.operatorName || '—' }}（{{ roleLabel(detail.operatorType) }}）
      </div>

      <template v-if="actionKind === 'update'">
        <div class="detail-section">
          <span>变更字段</span>
          <span class="diff-count">{{ changedFields.length }} 项</span>
        </div>
        <el-table v-if="changedFields.length" :data="changedFields" size="small" border>
          <el-table-column label="字段" width="130">
            <template #default="{ row }">
              <span class="diff-field"><span class="diff-dot"></span>{{ row.label }}</span>
            </template>
          </el-table-column>
          <el-table-column label="变更前" min-width="200">
            <template #default="{ row }">
              <span class="diff-before">{{ row.beforeText }}</span>
            </template>
          </el-table-column>
          <el-table-column label="变更后" min-width="200">
            <template #default="{ row }">
              <span class="diff-after">{{ row.afterText }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="detail-empty">没有检测到字段变化</div>
      </template>

      <template v-else>
        <div class="detail-section">
          <span>{{ actionKind === 'create' ? '新增对象信息' : '已删除对象信息' }}</span>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item v-for="item in summaryFields" :key="item.label" :label="item.label">
            {{ item.value }}
          </el-descriptions-item>
        </el-descriptions>
        <div v-if="actionKind === 'delete'" class="delete-hint">
          该对象已删除，以上为删除前的关键信息。
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import { money, time } from '../utils'

const ACTIONS = [
  { value: 'PRODUCT_CREATE', label: '新增商品' },
  { value: 'PRODUCT_UPDATE', label: '编辑商品' },
  { value: 'PRODUCT_DELETE', label: '删除商品' },
  { value: 'CATEGORY_CREATE', label: '新增分类' },
  { value: 'CATEGORY_UPDATE', label: '编辑分类' },
  { value: 'CATEGORY_DELETE', label: '删除分类' }
]
const ACTION_MAP = Object.fromEntries(ACTIONS.map(item => [item.value, item.label]))
const ROLE_MAP = { GLY: '管理员', XS: '销售', YY: '运营' }
const RESOURCE_MAP = { product: '商品', category: '分类' }
const FIELD_LABELS = {
  name: '名称',
  categoryId: '分类',
  price: '售价',
  originalPrice: '划线价',
  images: '图片',
  videos: '视频',
  description: '商品详情',
  spec: '规格型号',
  productionDate: '生产日期',
  origin: '产地',
  sort: '排序',
  status: '状态',
  code: '商品码',
  sales: '销量',
  enabled: '显示状态'
}
const FIELD_ORDER = [
  'name', 'categoryId', 'price', 'originalPrice', 'status', 'sort',
  'spec', 'productionDate', 'origin', 'description', 'images', 'videos',
  'code', 'sales', 'enabled'
]
const IGNORED_FIELDS = new Set(['_id', 'createdAt', 'updatedAt', 'imageUrls', 'videoUrls'])
const PRODUCT_SUMMARY_FIELDS = ['name', 'categoryId', 'price', 'status', 'spec', 'origin']
const CATEGORY_SUMMARY_FIELDS = ['name', 'sort', 'enabled']

const route = useRoute()
const actionOptions = ACTIONS
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const action = ref('')
const keyword = ref(String(route.query.keyword || ''))
const resource = ref(String(route.query.resource || ''))
const resourceId = ref(String(route.query.resourceId || ''))
const resourceName = ref(String(route.query.resourceName || ''))
const auditRange = ref([
  dayjs().subtract(6, 'day').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD')
])
const loading = ref(false)
const warning = ref('')
const detailVisible = ref(false)
const detail = ref({})
const categoryMap = ref({})

const actionKind = computed(() => {
  const value = String(detail.value.action || '')
  if (value.endsWith('_UPDATE')) return 'update'
  if (value.endsWith('_DELETE')) return 'delete'
  return 'create'
})

const changedFields = computed(() => {
  const before = detail.value.before
  const after = detail.value.after
  if (!before || !after) return []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return Array.from(keys)
    .filter(key => !IGNORED_FIELDS.has(key))
    .filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .map(key => ({
      key,
      label: FIELD_LABELS[key] || key,
      beforeText: formatValue(key, before[key]),
      afterText: formatValue(key, after[key])
    }))
    .sort((a, b) => {
      const left = FIELD_ORDER.indexOf(a.key)
      const right = FIELD_ORDER.indexOf(b.key)
      return (left < 0 ? 999 : left) - (right < 0 ? 999 : right)
    })
})

const summaryFields = computed(() => {
  const source = actionKind.value === 'create' ? detail.value.after : detail.value.before
  if (!source) return []
  const fields = detail.value.resource === 'category' ? CATEGORY_SUMMARY_FIELDS : PRODUCT_SUMMARY_FIELDS
  return fields
    .filter(key => source[key] !== undefined)
    .map(key => ({ label: FIELD_LABELS[key] || key, value: formatValue(key, source[key]) }))
})

function actionLabel(value) {
  return ACTION_MAP[value] || value || '—'
}

function actionType(value) {
  if (String(value).endsWith('_DELETE')) return 'danger'
  if (String(value).endsWith('_UPDATE')) return 'warning'
  return 'success'
}

function roleLabel(value) {
  return ROLE_MAP[value] || value || '—'
}

function resourceLabel(value) {
  return RESOURCE_MAP[value] || value || '—'
}

function formatFiles(value, unit) {
  const list = Array.isArray(value) ? value.filter(Boolean) : []
  if (!list.length) return '无'
  const names = list.map(item => {
    const text = String(item)
    return text.length > 28 ? `…${text.slice(-20)}` : text
  })
  return `${list.length} ${unit}（${names.join('、')}）`
}

function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'status') {
    if (value === 'ON') return '上架'
    if (value === 'OFF') return '下架'
    return String(value)
  }
  if (field === 'enabled') return value ? '显示' : '隐藏'
  if (field === 'price' || field === 'originalPrice') return `¥${money(value)}`
  if (field === 'images') return formatFiles(value, '张')
  if (field === 'videos') return formatFiles(value, '个')
  if (field === 'categoryId') return categoryMap.value[value] || String(value)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (err) {
      return String(value)
    }
  }
  return String(value)
}

async function loadCategories() {
  try {
    const data = await api.categories()
    const map = {}
    ;(data.list || []).forEach(item => {
      map[item._id] = item.name
    })
    categoryMap.value = map
  } catch (err) {
    categoryMap.value = {}
  }
}

function getRangeParams() {
  if (!Array.isArray(auditRange.value) || auditRange.value.length !== 2) {
    ElMessage.warning('请选择日志查询范围')
    return null
  }
  const start = dayjs(auditRange.value[0]).startOf('day')
  const end = dayjs(auditRange.value[1]).endOf('day')
  if (end.diff(start, 'day', true) > 14) {
    ElMessage.warning('日志查询范围不能超过两周')
    return null
  }
  return { start: start.valueOf(), end: end.valueOf() }
}

async function load() {
  const range = getRangeParams()
  if (!range) return

  loading.value = true
  try {
    const data = await api.auditLogs({
      page: page.value,
      pageSize,
      action: action.value,
      keyword: keyword.value.trim(),
      resource: resource.value,
      resourceId: resourceId.value,
      start: range.start,
      end: range.end
    })
    list.value = data.list || []
    total.value = data.total || 0
    warning.value = data.warning || ''
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

function clearResourceFilter() {
  resource.value = ''
  resourceId.value = ''
  resourceName.value = ''
  search()
}

function onPage(value) {
  page.value = value
  load()
}

function openDetail(row) {
  detail.value = row
  detailVisible.value = true
}

onMounted(() => {
  load()
  loadCategories()
})
</script>

<style scoped>
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.detail-meta {
  margin-bottom: 14px;
  font-size: 12px;
  color: #8c8b82;
}

.detail-section {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}

.diff-count {
  padding: 2px 8px;
  border-radius: 999px;
  background: #f4eee3;
  color: #8c6a35;
  font-size: 12px;
  font-weight: 500;
}

.diff-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.diff-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #c9502d;
}

.diff-before {
  color: #8c8b82;
  text-decoration: line-through;
  word-break: break-all;
}

.diff-after {
  color: #1f4d3b;
  font-weight: 600;
  word-break: break-all;
}

.detail-empty {
  padding: 24px;
  text-align: center;
  color: #8c8b82;
  font-size: 13px;
  background: #faf8f2;
  border-radius: 8px;
}

.delete-hint {
  margin-top: 12px;
  font-size: 12px;
  color: #a15d45;
}
</style>

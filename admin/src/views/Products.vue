<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>商品</h2>
        <p class="sub">上架后的商品会立即出现在小程序全部商品页</p>
      </div>
      <div class="head-actions">
        <el-button
          type="success"
          plain
          :disabled="!selectedProducts.length"
          @click="batchOnSale"
        >批量上架</el-button>
        <el-button
          type="warning"
          plain
          :disabled="!selectedProducts.length"
          @click="batchOffSale"
        >批量下架</el-button>
        <el-button
          type="primary"
          plain
          :disabled="!selectedProducts.length"
          @click="openBatchEdit"
        >批量修改</el-button>
        <el-button v-if="canManageProducts" type="primary" @click="openCreate">新增商品</el-button>
      </div>
    </div>

    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索商品名称"
        clearable
        style="width: 260px"
        @keyup.enter="search"
        @clear="search"
      />
      <el-select v-model="categoryFilter" placeholder="全部分类" clearable style="width: 160px" @change="search">
        <el-option v-for="item in categories" :key="item._id" :label="item.name" :value="item._id" />
      </el-select>
      <span class="total">共 {{ total }} 件商品</span>
      <span v-if="selectedProducts.length" class="selected-tip">已选 {{ selectedProducts.length }} 件</span>
    </div>

    <el-table
      v-loading="loading"
      :data="products"
      row-key="_id"
      empty-text="还没有商品，点击右上角新增"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column label="图片" width="86">
        <template #default="{ row }">
          <el-image
            v-if="coverOf(row)"
            :src="coverOf(row)"
            fit="cover"
            class="cell-image"
            :preview-src-list="previewList(row)"
            preview-teleported
          />
          <div v-else class="thumb-empty">无图</div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="商品名称" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="name-cell">
            <span>{{ row.name }}</span>
            <el-tag v-if="row.videos && row.videos.length" size="small" type="info" effect="plain">视频</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="分类" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">{{ categoryNames(row) }}</template>
      </el-table-column>
      <el-table-column label="售价" width="110">
        <template #default="{ row }">
          <span class="amount">¥{{ money(row.price) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="sales" label="已售" width="76" />
      <el-table-column prop="sort" label="排序" width="76" />
      <el-table-column label="上架" width="90">
        <template #default="{ row }">
          <el-switch :model-value="row.status === 'ON'" @change="value => toggleStatus(row, value)" />
        </template>
      </el-table-column>
      <el-table-column v-if="canManageProducts" label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="isAdmin" link type="info" @click="openAudit(row)">变更日志</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
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

    <el-dialog
      v-model="dialogVisible"
      :title="form._id ? '编辑商品' : '新增商品'"
      width="680px"
      destroy-on-close
    >
      <el-form label-width="110px" label-position="right">
        <el-form-item label="商品名称" required>
          <el-input v-model="form.name" maxlength="50" show-word-limit placeholder="例如：手工烘焙 挂耳咖啡" />
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select
            v-model="form.categoryIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="6"
            placeholder="请选择分类，可多选"
            style="width: 100%"
          >
            <el-option v-for="item in categories" :key="item._id" :label="item.name" :value="item._id" />
          </el-select>
          <div v-if="!categories.length" class="form-hint">
            还没有分类，请先到「分类管理」创建
          </div>
        </el-form-item>
        <el-form-item label="售价" required>
          <el-input v-model="form.priceYuan" placeholder="例如 39.90">
            <template #prepend>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="原价（划线价）">
          <el-input v-model="form.originalPriceYuan" placeholder="选填，展示为划线原价">
            <template #prepend>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="商品图片">
          <ImageUploader v-model="form.images" :max-count="4" />
          <div class="form-hint">最多 4 张，第一张作为封面；建议使用正方形图片</div>
        </el-form-item>
        <el-form-item label="商品视频">
          <VideoUploader v-model="form.videos" :max-count="2" />
          <div class="form-hint">
            最多 2 个，单个不超过 40MB。上传采用分片方式，请把云函数超时设置为 60 秒
          </div>
        </el-form-item>
        <el-form-item label="商品详情">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="5"
            maxlength="2000"
            show-word-limit
            placeholder="支持换行，简单介绍商品即可"
          />
        </el-form-item>
        <el-form-item label="规格型号">
          <el-input v-model="form.spec" maxlength="50" placeholder="例如：500g/袋、25-30个/500g" />
        </el-form-item>
        <el-form-item label="有效期至">
          <el-date-picker
            v-model="form.validUntil"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择有效期截止日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="生产日期">
          <el-date-picker
            v-model="form.productionDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择生产日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="产地">
          <el-input v-model="form.origin" maxlength="50" placeholder="例如：贵州、云南" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
          <div class="form-hint">数字越小越靠前</div>
        </el-form-item>
        <el-form-item label="初始化已售数量">
          <el-input-number v-model="form.initialSales" :min="0" :max="99999999" />
          <div class="form-hint">会叠加到实际订单销量上，展示为总已售数量</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.statusOn" active-text="上架" inactive-text="下架" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchDialogVisible" title="批量修改商品" width="720px" destroy-on-close>
      <div class="batch-section-title">已选商品（{{ batchRows.length }}），可逐个修改</div>

      <el-form label-width="90px">
        <el-form-item label="修改属性" required>
          <el-select v-model="batchField" style="width: 220px" @change="resetBatchRows">
            <el-option v-for="item in batchFields" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-table :data="batchRows" size="small" max-height="360" border>
        <el-table-column prop="name" label="商品" min-width="200" show-overflow-tooltip />
        <el-table-column label="属性值" min-width="220">
          <template #default="{ row }">
            <el-select v-if="batchField === 'status'" v-model="row.value" size="small" style="width: 100%">
              <el-option label="上架" value="ON" />
              <el-option label="下架" value="OFF" />
            </el-select>
            <el-date-picker
              v-else-if="batchField === 'validUntil' || batchField === 'productionDate'"
              v-model="row.value"
              type="date"
              value-format="YYYY-MM-DD"
              size="small"
              style="width: 100%"
            />
            <el-input-number
              v-else-if="batchField === 'sort'"
              v-model="row.value"
              :min="0"
              :max="9999"
              size="small"
              style="width: 100%"
            />
            <el-input
              v-else-if="batchField === 'price' || batchField === 'originalPrice'"
              v-model="row.value"
              size="small"
              placeholder="金额"
            >
              <template #prepend>¥</template>
            </el-input>
            <el-input v-else v-model="row.value" size="small" maxlength="50" />
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="submitBatch">批量更新</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, getAdminUser } from '../api'
import { money, yuanToCents, centsToYuan } from '../utils'
import ImageUploader from '../components/ImageUploader.vue'
import VideoUploader from '../components/VideoUploader.vue'

const router = useRouter()
const adminUser = getAdminUser()
const isAdmin = Boolean(adminUser && adminUser.type === 'GLY')
const canManageProducts = Boolean(adminUser && (adminUser.type === 'GLY' || adminUser.type === 'YY'))
const products = ref([])
const categories = ref([])
const loading = ref(false)
const keyword = ref('')
const categoryFilter = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
let loadSeq = 0

const selectedProducts = ref([])
const dialogVisible = ref(false)
const saving = ref(false)
const batchDialogVisible = ref(false)
const batchSaving = ref(false)
const batchFields = [
  { value: 'status', label: '状态' },
  { value: 'price', label: '售价' },
  { value: 'originalPrice', label: '原价（划线价）' },
  { value: 'validUntil', label: '有效期至' },
  { value: 'productionDate', label: '生产日期' },
  { value: 'origin', label: '产地' },
  { value: 'spec', label: '规格型号' },
  { value: 'sort', label: '排序' }
]
const batchField = ref('validUntil')
const batchRows = ref([])
const form = reactive(createEmptyForm())

function createEmptyForm() {
  return {
    _id: '',
    name: '',
    categoryIds: [],
    priceYuan: '',
    originalPriceYuan: '',
    images: [],
    videos: [],
    description: '',
    spec: '',
    validUntil: '',
    productionDate: '',
    origin: '',
    sort: 0,
    initialSales: 0,
    statusOn: true
  }
}

const categoryMap = computed(() => {
  const map = {}
  categories.value.forEach(item => {
    map[item._id] = item.name
  })
  return map
})

function categoryNames(row) {
  const ids = Array.isArray(row.categoryIds) && row.categoryIds.length
    ? row.categoryIds
    : (row.categoryId ? [row.categoryId] : [])
  const names = ids.map(id => categoryMap.value[id]).filter(Boolean)
  return names.length ? names.join('、') : '未分类'
}

function coverOf(row) {
  return (row.imageUrls && row.imageUrls[0]) || ''
}

function previewList(row) {
  return (row.imageUrls || []).filter(Boolean)
}

async function load() {
  const seq = ++loadSeq
  loading.value = true
  selectedProducts.value = []
  try {
    const [productData, categoryData] = await Promise.all([
      api.products({
        page: page.value,
        pageSize,
        keyword: keyword.value.trim(),
        categoryId: categoryFilter.value
      }),
      api.categories()
    ])
    if (seq !== loadSeq) return
    products.value = productData.list || []
    total.value = productData.total || 0
    categories.value = categoryData.list || []
  } catch (err) {
    if (seq !== loadSeq) return
    ElMessage.error(err.message)
  } finally {
    if (seq === loadSeq) loading.value = false
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

function openCreate() {
  if (!categories.value.length) {
    ElMessage.warning('请先在「分类管理」中创建分类')
    return
  }
  Object.assign(form, createEmptyForm())
  form.categoryIds = [categories.value[0]._id]
  dialogVisible.value = true
}

function openAudit(row) {
  router.push({
    path: '/audit-logs',
    query: {
      resource: 'product',
      resourceId: row._id,
      resourceName: row.name
    }
  })
}

function openEdit(row) {
  Object.assign(form, createEmptyForm())
  form._id = row._id
  form.name = row.name
  form.categoryIds = Array.isArray(row.categoryIds) && row.categoryIds.length
    ? row.categoryIds.slice()
    : (row.categoryId ? [row.categoryId] : [])
  form.priceYuan = centsToYuan(row.price)
  form.originalPriceYuan = row.originalPrice ? centsToYuan(row.originalPrice) : ''
  form.description = row.description || ''
  form.spec = row.spec || ''
  form.validUntil = row.validUntil || ''
  form.productionDate = row.productionDate || ''
  form.origin = row.origin || ''
  form.sort = row.sort || 0
  form.initialSales = row.initialSales || 0
  form.statusOn = row.status === 'ON'
  form.images = (row.images || []).map((fileID, index) => ({
    fileID,
    url: (row.imageUrls && row.imageUrls[index]) || ''
  }))
  form.videos = (row.videos || []).map((fileID, index) => ({
    fileID,
    url: (row.videoUrls && row.videoUrls[index]) || '',
    name: ''
  }))
  dialogVisible.value = true
}

async function save() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning('请填写商品名称')
    return
  }
  if (!form.categoryIds.length) {
    ElMessage.warning('请选择至少一个分类')
    return
  }
  const price = yuanToCents(form.priceYuan)
  if (price === null) {
    ElMessage.warning('请填写正确的售价，最多两位小数')
    return
  }
  let originalPrice = 0
  if (String(form.originalPriceYuan).trim()) {
    originalPrice = yuanToCents(form.originalPriceYuan)
    if (originalPrice === null) {
      ElMessage.warning('划线价格式不正确')
      return
    }
  }

  const payload = {
    name,
    categoryIds: form.categoryIds,
    categoryId: form.categoryIds[0],
    price,
    originalPrice,
    images: form.images.map(item => item.fileID),
    videos: form.videos.map(item => item.fileID),
    description: form.description,
    spec: form.spec,
    validUntil: form.validUntil,
    productionDate: form.productionDate,
    origin: form.origin,
    sort: Number(form.sort) || 0,
    initialSales: Number(form.initialSales) || 0,
    status: form.statusOn ? 'ON' : 'OFF'
  }

  saving.value = true
  try {
    let result = null
    if (form._id) {
      result = await api.updateProduct(form._id, payload)
      if (result.auditWarning) ElMessage.warning(result.auditWarning)
      else ElMessage.success('商品已更新')
      dialogVisible.value = false
      load()
    } else {
      result = await api.createProduct(payload)
      if (result.auditWarning) ElMessage.warning(result.auditWarning)
      else ElMessage.success('商品已创建')
      dialogVisible.value = false
      search()
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

function onSelectionChange(rows) {
  selectedProducts.value = rows || []
}

function batchInitialValue(product, field) {
  if (field === 'status') return product.status || 'ON'
  if (field === 'price') return centsToYuan(product.price)
  if (field === 'originalPrice') return product.originalPrice ? centsToYuan(product.originalPrice) : ''
  if (field === 'sort') return Number(product.sort) || 0
  return product[field] || ''
}

function resetBatchRows() {
  batchRows.value = selectedProducts.value.map(product => ({
    id: product._id,
    name: product.name,
    value: batchInitialValue(product, batchField.value)
  }))
}

function openBatchEdit() {
  if (!selectedProducts.value.length) {
    ElMessage.warning('请先勾选商品')
    return
  }
  batchField.value = 'validUntil'
  resetBatchRows()
  batchDialogVisible.value = true
}

async function batchStatus(status) {
  if (!selectedProducts.value.length) {
    ElMessage.warning('请先勾选商品')
    return
  }
  const action = status === 'ON' ? '上架' : '下架'
  try {
    await ElMessageBox.confirm(
      `确认将选中的 ${selectedProducts.value.length} 件商品${action}？`,
      `批量${action}`,
      { confirmButtonText: `确认${action}`, cancelButtonText: '取消', type: 'warning' }
    )
  } catch (err) {
    return
  }
  if (batchSaving.value) return
  batchSaving.value = true
  try {
    const result = await api.batchUpdateProducts({
      ids: selectedProducts.value.map(item => item._id),
      field: 'status',
      value: status
    })
    if (result.auditWarning) ElMessage.warning(result.auditWarning)
    else ElMessage.success(`已${action} ${result.updated} 件商品`)
    load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    batchSaving.value = false
  }
}

function batchOnSale() {
  return batchStatus('ON')
}

function batchOffSale() {
  return batchStatus('OFF')
}

async function submitBatch() {
  if (!batchRows.value.length) {
    ElMessage.warning('请先勾选商品')
    return
  }
  const field = batchField.value
  const updates = []

  for (const row of batchRows.value) {
    let value = row.value
    if (field === 'status') {
      value = String(value || '')
      if (!['ON', 'OFF'].includes(value)) {
        ElMessage.warning(`「${row.name}」状态不正确`)
        return
      }
    } else if (field === 'price' || field === 'originalPrice') {
      value = yuanToCents(value)
      if (value === null) {
        ElMessage.warning(`「${row.name}」金额格式不正确`)
        return
      }
    } else if (field === 'sort') {
      value = Number(value)
      if (!Number.isInteger(value) || value < 0 || value > 9999) {
        ElMessage.warning(`「${row.name}」排序需为 0-9999 的整数`)
        return
      }
    } else {
      value = String(value || '').trim()
    }
    updates.push({ id: row.id, value })
  }

  if (batchSaving.value) return
  batchSaving.value = true
  try {
    const result = await api.batchUpdateProducts({ field, updates })
    if (result.auditWarning) ElMessage.warning(result.auditWarning)
    else ElMessage.success(`已更新 ${result.updated} 件商品`)
    batchDialogVisible.value = false
    load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    batchSaving.value = false
  }
}

async function toggleStatus(row, value) {
  try {
    await api.updateProduct(row._id, { status: value ? 'ON' : 'OFF' })
    row.status = value ? 'ON' : 'OFF'
    ElMessage.success(value ? '已上架' : '已下架')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除商品「${row.name}」？已产生的订单不受影响。`, '删除商品', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch (err) {
    return
  }
  try {
    const result = await api.deleteProduct(row._id)
    if (result.auditWarning) ElMessage.warning(result.auditWarning)
    else ElMessage.success('已删除')
    load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(load)
</script>

<style scoped>
.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.selected-tip {
  font-size: 13px;
  color: #c9502d;
}

.batch-section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}

.cell-image {
  width: 56px;
  height: 56px;
  border-radius: 6px;
  display: block;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name-cell span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

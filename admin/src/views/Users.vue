<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>用户</h2>
        <p class="sub">管理客户、销售与管理员账号；客户可指定负责销售</p>
      </div>
      <el-button type="primary" @click="openCreate">新增用户</el-button>
    </div>

    <div class="toolbar">
      <el-select v-model="filters.type" placeholder="全部类型" clearable style="width: 140px" @change="search">
        <el-option label="客户" value="KH" />
        <el-option label="销售" value="XS" />
        <el-option label="运营" value="YY" />
        <el-option label="管理员" value="GLY" />
      </el-select>
      <el-input
        v-model="filters.keyword"
        placeholder="姓名 / 手机号 / 店铺"
        clearable
        style="width: 260px"
        @keyup.enter="search"
        @clear="search"
      >
        <template #append>
          <el-button @click="search">搜索</el-button>
        </template>
      </el-input>
      <span class="total">共 {{ total }} 位用户</span>
    </div>

    <el-table v-loading="loading" :data="list" row-key="_id" empty-text="还没有用户">
      <el-table-column label="用户" min-width="170">
        <template #default="{ row }">
          <div>{{ row.name }}</div>
          <div class="muted">{{ row.phone }}</div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag :type="typeMeta(row.type).type" effect="light">{{ typeMeta(row.type).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="店铺名称" min-width="150">
        <template #default="{ row }">
          <span :class="{ muted: !row.shopName }">{{ row.shopName || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="收货地址" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="{ muted: !row.address }">{{ row.address || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="负责销售" width="120">
        <template #default="{ row }">
          <span :class="{ muted: !row.salesName }">{{ row.salesName || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="可售商品" width="110">
        <template #default="{ row }">
          <span v-if="row.type !== 'KH'" class="muted">—</span>
          <span v-else :class="{ muted: !row.productIds || !row.productIds.length }">
            {{ row.productIds && row.productIds.length ? `${row.productIds.length} 件` : '全部' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="86">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @change="value => toggleEnabled(row, value)" />
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="150">
        <template #default="{ row }">{{ time(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="warning" @click="resetPassword(row)">重置密码</el-button>
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

    <el-dialog v-model="dialogVisible" :title="form._id ? '编辑用户' : '新增用户'" width="560px" destroy-on-close>
      <el-form label-width="92px">
        <el-form-item label="手机号" required>
          <el-input v-model="form.phone" maxlength="11" placeholder="用于登录" />
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" maxlength="20" />
        </el-form-item>
        <el-form-item v-if="!form._id" label="初始密码" required>
          <el-input v-model="form.password" type="password" show-password maxlength="32" placeholder="6-32 位" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="form.type" style="width: 100%" @change="onTypeChange">
            <el-option label="客户 KH" value="KH" />
            <el-option label="销售 XS" value="XS" />
            <el-option label="运营 YY" value="YY" />
            <el-option label="管理员 GLY" value="GLY" />
          </el-select>
        </el-form-item>
        <el-form-item label="店铺名称" :required="form.type === 'KH'">
          <el-input v-model="form.shopName" maxlength="50" placeholder="客户类型必填" />
        </el-form-item>
        <el-form-item label="收货地址" :required="form.type === 'KH'">
          <el-input v-model="form.address" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="客户类型必填" />
        </el-form-item>
        <el-form-item v-if="form.type === 'KH'" label="负责销售" required>
          <el-select v-model="form.salesId" placeholder="请选择销售账号" style="width: 100%">
            <el-option v-for="item in salesList" :key="item._id" :label="`${item.name}（${item.phone}）`" :value="item._id" />
          </el-select>
          <div v-if="!salesList.length" class="form-hint">还没有销售账号，请先创建一个类型为销售的账号</div>
        </el-form-item>
        <el-form-item v-if="form.type === 'KH'" label="可售商品">
          <el-select
            v-model="form.productIds"
            multiple
            filterable
            remote
            clearable
            collapse-tags
            collapse-tags-tooltip
            :remote-method="searchProducts"
            :loading="productLoading"
            placeholder="输入商品名称搜索；不选择则显示全部商品"
            style="width: 100%"
          >
            <el-option
              v-for="item in productsList"
              :key="item._id"
              :label="item.status === 'OFF' ? `${item.name}（已下架）` : item.name"
              :value="item._id"
            />
          </el-select>
          <div class="form-hint">不选择表示可查看全部商品；选择后仅显示并允许购买绑定的商品</div>
        </el-form-item>
        <el-form-item label="账号状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import { time } from '../utils'

const TYPE_META = {
  KH: { label: '客户', type: 'success' },
  XS: { label: '销售', type: 'warning' },
  YY: { label: '运营', type: 'primary' },
  GLY: { label: '管理员', type: 'danger' }
}

const list = ref([])
const salesList = ref([])
const productsList = ref([])
const productLoading = ref(false)
let productSearchSeq = 0
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const filters = reactive({ type: '', keyword: '' })
const form = reactive(createEmptyForm())

function createEmptyForm() {
  return {
    _id: '',
    phone: '',
    name: '',
    password: '',
    type: 'KH',
    shopName: '',
    address: '',
    salesId: '',
    productIds: [],
    enabled: true
  }
}

function typeMeta(type) {
  return TYPE_META[type] || { label: type || '未知', type: 'info' }
}

async function load() {
  loading.value = true
  try {
    const data = await api.users({
      type: filters.type || '',
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

async function loadSales() {
  try {
    const data = await api.sales()
    salesList.value = data.list || []
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function searchProducts(keyword) {
  const seq = ++productSearchSeq
  productLoading.value = true
  try {
    const data = await api.products({
      keyword: String(keyword || '').trim(),
      page: 1,
      pageSize: 20,
      simple: 1
    })
    if (seq !== productSearchSeq) return
    const selectedIds = new Set(form.productIds)
    const merged = new Map()
    productsList.value
      .filter(item => selectedIds.has(item._id))
      .forEach(item => merged.set(item._id, item))
    ;(data.list || []).forEach(item => merged.set(item._id, item))
    productsList.value = Array.from(merged.values())
  } catch (err) {
    if (seq !== productSearchSeq) return
    ElMessage.error(err.message)
  } finally {
    if (seq === productSearchSeq) productLoading.value = false
  }
}

async function loadSelectedProducts(ids) {
  if (!ids.length) {
    productsList.value = []
    return
  }
  const seq = ++productSearchSeq
  productLoading.value = true
  try {
    const data = await api.products({ ids: ids.join(','), pageSize: 100, simple: 1 })
    if (seq !== productSearchSeq) return
    const list = data.list || []
    productsList.value = list
    if (list.length !== ids.length) {
      const found = new Set(list.map(item => item._id))
      form.productIds = form.productIds.filter(id => found.has(id))
    }
  } catch (err) {
    if (seq !== productSearchSeq) return
    ElMessage.error(err.message)
  } finally {
    if (seq === productSearchSeq) productLoading.value = false
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
  Object.assign(form, createEmptyForm())
  productsList.value = []
  dialogVisible.value = true
  searchProducts('')
}

function openEdit(row) {
  Object.assign(form, {
    _id: row._id,
    phone: row.phone,
    name: row.name,
    password: '',
    type: row.type,
    shopName: row.shopName || '',
    address: row.address || '',
    salesId: row.salesId || '',
    productIds: Array.isArray(row.productIds) ? row.productIds.slice() : [],
    enabled: row.enabled !== false
  })
  dialogVisible.value = true
  loadSelectedProducts(form.productIds)
}

function onTypeChange(value) {
  if (value !== 'KH') {
    form.salesId = ''
    form.productIds = []
    productsList.value = []
  }
}

async function save() {
  if (!/^1[3-9]\d{9}$/.test(form.phone.trim())) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  if (!form.name.trim()) {
    ElMessage.warning('请输入姓名')
    return
  }
  if (!form._id && (form.password.length < 6 || form.password.length > 32)) {
    ElMessage.warning('初始密码需为 6-32 位')
    return
  }
  if (form.type === 'KH') {
    if (!form.shopName.trim()) {
      ElMessage.warning('客户类型必须填写门店名称')
      return
    }
    if (!form.address.trim()) {
      ElMessage.warning('客户类型必须填写收货地址')
      return
    }
    if (!form.salesId) {
      ElMessage.warning('客户类型必须选择负责销售')
      return
    }
  }

  const payload = {
    phone: form.phone.trim(),
    name: form.name.trim(),
    type: form.type,
    shopName: form.shopName.trim(),
    address: form.address.trim(),
    salesId: form.type === 'KH' ? form.salesId : '',
    productIds: form.type === 'KH' ? form.productIds : [],
    enabled: form.enabled
  }
  if (!form._id) payload.password = form.password

  saving.value = true
  try {
    if (form._id) {
      await api.updateUser(form._id, payload)
      ElMessage.success('用户已更新')
    } else {
      await api.createUser(payload)
      ElMessage.success('用户已创建')
    }
    dialogVisible.value = false
    load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row, value) {
  try {
    await api.updateUser(row._id, { enabled: value })
    row.enabled = value
    ElMessage.success(value ? '已启用' : '已停用')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function resetPassword(row) {
  try {
    await ElMessageBox.confirm(
      `确认将「${row.name}」的密码重置为默认密码 123456？用户登录后可在小程序中修改。`,
      '重置密码',
      { confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning' }
    )
  } catch (err) {
    return
  }

  try {
    await api.resetUserPassword(row._id)
    ElMessage.success('密码已重置为 123456')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(() => {
  load()
  loadSales()
})
</script>

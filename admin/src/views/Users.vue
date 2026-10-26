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
      <el-table-column label="可售分类" width="110">
        <template #default="{ row }">
          <span v-if="row.type !== 'KH'" class="muted">—</span>
          <span v-else :class="{ muted: !row.categoryIds || !row.categoryIds.length }">
            {{ row.categoryIds && row.categoryIds.length ? `${row.categoryIds.length} 个` : '全部' }}
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
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <template v-if="row._id !== currentUserId">
            <el-button link type="warning" @click="openSetPassword(row)">修改密码</el-button>
            <el-button link type="info" @click="resetPassword(row)">重置密码</el-button>
          </template>
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
        <el-form-item v-if="form.type === 'KH'" label="可售分类">
          <el-select
            v-model="form.categoryIds"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            placeholder="不选择则显示全部分类商品"
            style="width: 100%"
          >
            <el-option v-for="item in categoriesList" :key="item._id" :label="item.name" :value="item._id" />
          </el-select>
          <div class="form-hint">不选择表示可查看全部分类；选择后仅显示这些分类下的商品</div>
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

    <el-dialog v-model="passwordDialogVisible" title="修改密码" width="460px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="用户">
          <span>{{ passwordForm.name }}</span>
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="passwordForm.password" type="password" show-password maxlength="32" placeholder="6-32 位" />
        </el-form-item>
        <el-form-item label="确认新密码" required>
          <el-input v-model="passwordForm.confirm" type="password" show-password maxlength="32" placeholder="再次输入新密码" @keyup.enter="saveSetPassword" />
        </el-form-item>
      </el-form>
      <div class="form-hint">修改后该用户需要重新登录。</div>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="saveSetPassword">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, getAdminUser } from '../api'
import { time } from '../utils'

const adminUser = getAdminUser()
const currentUserId = adminUser ? adminUser._id : ''

const TYPE_META = {
  KH: { label: '客户', type: 'success' },
  XS: { label: '销售', type: 'warning' },
  YY: { label: '运营', type: 'primary' },
  GLY: { label: '管理员', type: 'danger' }
}

const list = ref([])
const salesList = ref([])
const categoriesList = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const passwordDialogVisible = ref(false)
const passwordSaving = ref(false)
const filters = reactive({ type: '', keyword: '' })
const form = reactive(createEmptyForm())
const passwordForm = reactive({ _id: '', name: '', password: '', confirm: '' })

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
    categoryIds: [],
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

async function loadCategories() {
  try {
    const data = await api.categories()
    categoriesList.value = data.list || []
  } catch (err) {
    ElMessage.error(err.message)
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
  dialogVisible.value = true
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
    categoryIds: Array.isArray(row.categoryIds) ? row.categoryIds.slice() : [],
    enabled: row.enabled !== false
  })
  dialogVisible.value = true
}

function onTypeChange(value) {
  if (value !== 'KH') {
    form.salesId = ''
    form.categoryIds = []
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
    categoryIds: form.type === 'KH' ? form.categoryIds : [],
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

function openSetPassword(row) {
  Object.assign(passwordForm, {
    _id: row._id,
    name: row.name,
    password: '',
    confirm: ''
  })
  passwordDialogVisible.value = true
}

async function saveSetPassword() {
  if (passwordForm.password.length < 6 || passwordForm.password.length > 32) {
    ElMessage.warning('新密码需为 6-32 位')
    return
  }
  if (passwordForm.password !== passwordForm.confirm) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  passwordSaving.value = true
  try {
    await api.resetUserPassword(passwordForm._id, passwordForm.password)
    ElMessage.success('密码已修改，该用户需要重新登录')
    passwordDialogVisible.value = false
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    passwordSaving.value = false
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
  loadCategories()
})
</script>

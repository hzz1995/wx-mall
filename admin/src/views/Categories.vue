<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>分类</h2>
        <p class="sub">分类用于小程序全部商品页的筛选条；隐藏分类不会下架其中的商品</p>
      </div>
      <el-button type="primary" @click="openCreate">新增分类</el-button>
    </div>

    <el-table v-loading="loading" :data="list" row-key="_id" empty-text="还没有分类，先创建一个">
      <el-table-column prop="name" label="分类名称" min-width="200" />
      <el-table-column prop="sort" label="排序" width="100" />
      <el-table-column label="显示" width="100">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled" @change="value => toggleEnabled(row, value)" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="isAdmin" link type="info" @click="openAudit(row)">变更日志</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="form._id ? '编辑分类' : '新增分类'" width="460px">
      <el-form label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="20" show-word-limit placeholder="例如：咖啡豆、茶具" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
          <div class="form-hint">数字越小越靠前</div>
        </el-form-item>
        <el-form-item label="显示">
          <el-switch v-model="form.enabled" active-text="显示" inactive-text="隐藏" />
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
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, getAdminUser } from '../api'

const router = useRouter()
const adminUser = getAdminUser()
const isAdmin = Boolean(adminUser && adminUser.type === 'GLY')
const list = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({ _id: '', name: '', sort: 0, enabled: true })

async function load() {
  loading.value = true
  try {
    const data = await api.categories()
    list.value = data.list || []
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  Object.assign(form, { _id: '', name: '', sort: 0, enabled: true })
  dialogVisible.value = true
}

function openAudit(row) {
  router.push({
    path: '/audit-logs',
    query: {
      resource: 'category',
      resourceId: row._id,
      resourceName: row.name
    }
  })
}

function openEdit(row) {
  Object.assign(form, { _id: row._id, name: row.name, sort: row.sort, enabled: row.enabled })
  dialogVisible.value = true
}

async function save() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning('请填写分类名称')
    return
  }
  saving.value = true
  try {
    const payload = { name, sort: Number(form.sort) || 0, enabled: form.enabled }
    let result = null
    if (form._id) {
      result = await api.updateCategory(form._id, payload)
      if (result.auditWarning) ElMessage.warning(result.auditWarning)
      else ElMessage.success('分类已更新')
    } else {
      result = await api.createCategory(payload)
      if (result.auditWarning) ElMessage.warning(result.auditWarning)
      else ElMessage.success('分类已创建')
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
    const result = await api.updateCategory(row._id, { enabled: value })
    row.enabled = value
    if (result.auditWarning) ElMessage.warning(result.auditWarning)
    else ElMessage.success(value ? '已显示' : '已隐藏')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除分类「${row.name}」？`, '删除分类', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch (err) {
    return
  }
  try {
    const result = await api.deleteCategory(row._id)
    if (result.auditWarning) ElMessage.warning(result.auditWarning)
    else ElMessage.success('已删除')
    load()
  } catch (err) {
    ElMessage.error(err.message)
  }
}

onMounted(load)
</script>

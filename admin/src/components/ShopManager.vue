<template>
  <el-dialog
    :model-value="modelValue"
    :title="`店铺管理${userName ? ' · ' + userName : ''}`"
    width="720px"
    destroy-on-close
    @update:model-value="value => emit('update:modelValue', value)"
  >
    <div class="toolbar">
      <el-button type="primary" plain @click="startAdd">新增店铺</el-button>
      <span class="muted">客户可维护多个店铺，下单时使用所选店铺的收货地址</span>
    </div>

    <el-table v-loading="loading" :data="shops" row-key="_id" empty-text="还没有店铺" border>
      <el-table-column label="店铺" min-width="140">
        <template #default="{ row }">
          <div>{{ row.shopName }}</div>
          <el-tag v-if="row.isDefault" size="small" type="success" effect="light">默认</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="收货地址" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.address }}</template>
      </el-table-column>
      <el-table-column label="联系人" width="110">
        <template #default="{ row }">{{ row.contactName || '—' }}</template>
      </el-table-column>
      <el-table-column label="电话" width="130">
        <template #default="{ row }">{{ row.phone || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row.isDefault" link type="primary" @click="setDefault(row)">设默认</el-button>
          <el-button link type="primary" @click="startEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="formVisible" class="shop-form">
      <div class="form-title">{{ form._id ? '编辑店铺' : '新增店铺' }}</div>
      <el-form label-width="90px">
        <el-form-item label="店铺名称" required>
          <el-input v-model="form.shopName" maxlength="50" />
        </el-form-item>
        <el-form-item label="收货地址" required>
          <el-input v-model="form.address" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contactName" maxlength="20" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.phone" maxlength="20" />
        </el-form-item>
      </el-form>
      <div class="form-actions">
        <el-button @click="cancelForm">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  userId: { type: String, default: '' },
  userName: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const shops = ref([])
const loading = ref(false)
const saving = ref(false)
const formVisible = ref(false)
const form = reactive(emptyForm())

function emptyForm() {
  return { _id: '', shopName: '', address: '', contactName: '', phone: '' }
}

async function load() {
  if (!props.userId) return
  loading.value = true
  try {
    const data = await api.userShops(props.userId)
    shops.value = data.shops || []
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

function startAdd() {
  Object.assign(form, emptyForm())
  formVisible.value = true
}

function startEdit(row) {
  Object.assign(form, {
    _id: row._id,
    shopName: row.shopName || '',
    address: row.address || '',
    contactName: row.contactName || '',
    phone: row.phone || ''
  })
  formVisible.value = true
}

function cancelForm() {
  formVisible.value = false
  Object.assign(form, emptyForm())
}

async function save() {
  if (!form.shopName.trim()) {
    ElMessage.warning('请填写店铺名称')
    return
  }
  if (!form.address.trim()) {
    ElMessage.warning('请填写收货地址')
    return
  }
  saving.value = true
  try {
    const payload = {
      shopName: form.shopName.trim(),
      address: form.address.trim(),
      contactName: form.contactName.trim(),
      phone: form.phone.trim()
    }
    if (form._id) {
      await api.updateUserShop(props.userId, form._id, payload)
    } else {
      await api.createUserShop(props.userId, payload)
    }
    ElMessage.success('店铺已保存')
    cancelForm()
    await load()
    emit('saved')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

async function setDefault(row) {
  try {
    await api.setDefaultUserShop(props.userId, row._id)
    ElMessage.success('已设为默认店铺')
    await load()
    emit('saved')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除店铺「${row.shopName}」？历史订单不受影响。`, '删除店铺', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch (err) {
    return
  }
  try {
    await api.deleteUserShop(props.userId, row._id)
    ElMessage.success('店铺已删除')
    await load()
    emit('saved')
  } catch (err) {
    ElMessage.error(err.message)
  }
}

watch(
  () => [props.modelValue, props.userId],
  ([visible]) => {
    if (visible) {
      formVisible.value = false
      Object.assign(form, emptyForm())
      load()
    }
  }
)
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.muted {
  font-size: 12px;
  color: #8c8b82;
}

.shop-form {
  margin-top: 18px;
  padding: 16px 18px 6px;
  border: 1px solid #e9e4d9;
  border-radius: 10px;
  background: #fbfaf6;
}

.form-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 0 12px;
}
</style>

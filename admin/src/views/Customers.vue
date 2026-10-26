<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>{{ isSales ? '我的客户' : '客户' }}</h2>
        <p class="sub">{{ isSales ? '只显示分配给你的客户与订单统计' : '客户账号与已完成订单汇总' }}</p>
      </div>
      <div class="head-actions">
        <el-button type="primary" @click="openCreate">新建客户</el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
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

    <el-dialog v-model="dialogVisible" title="新建客户" width="560px" destroy-on-close>
      <el-form label-width="92px">
        <el-form-item label="手机号" required>
          <el-input v-model="form.phone" maxlength="11" placeholder="用于客户登录" />
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" maxlength="20" />
        </el-form-item>
        <el-form-item label="初始密码" required>
          <el-input v-model="form.password" type="password" show-password maxlength="32" placeholder="6-32 位" />
        </el-form-item>
        <el-form-item label="店铺名称" required>
          <el-input v-model="form.shopName" maxlength="50" />
        </el-form-item>
        <el-form-item label="收货地址" required>
          <el-input
            v-model="form.address"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
        <el-form-item v-if="!isSales" label="负责销售" required>
          <el-select v-model="form.salesId" placeholder="请选择销售账号" style="width: 100%">
            <el-option v-for="item in salesList" :key="item._id" :label="`${item.name}（${item.phone}）`" :value="item._id" />
          </el-select>
          <div v-if="!salesList.length" class="form-hint">还没有销售账号，请先创建销售账号</div>
        </el-form-item>
        <el-form-item v-else label="负责销售">
          <span>{{ adminName }}（当前账号）</span>
        </el-form-item>
        <el-form-item label="账号状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <div class="form-hint form-hint-block">
          可售分类默认全部；如需限制商品范围，请管理员在用户管理中绑定分类。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, getAdminUser } from '../api'
import { money, time } from '../utils'

const adminUser = getAdminUser()
const isSales = Boolean(adminUser && adminUser.type === 'XS')
const adminName = adminUser ? adminUser.name : ''

const list = ref([])
const salesList = ref([])
const loading = ref(false)
const saving = ref(false)
const truncated = ref(false)
const dialogVisible = ref(false)
const filters = reactive({ keyword: '', salesId: '' })
const form = reactive(createEmptyForm())

function createEmptyForm() {
  return {
    phone: '',
    name: '',
    password: '',
    shopName: '',
    address: '',
    salesId: '',
    enabled: true
  }
}

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

function openCreate() {
  Object.assign(form, createEmptyForm())
  dialogVisible.value = true
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
  if (form.password.length < 6 || form.password.length > 32) {
    ElMessage.warning('初始密码需为 6-32 位')
    return
  }
  if (!form.shopName.trim()) {
    ElMessage.warning('请填写店铺名称')
    return
  }
  if (!form.address.trim()) {
    ElMessage.warning('请填写收货地址')
    return
  }
  if (!isSales && !form.salesId) {
    ElMessage.warning('请选择负责销售')
    return
  }

  const payload = {
    phone: form.phone.trim(),
    name: form.name.trim(),
    password: form.password,
    shopName: form.shopName.trim(),
    address: form.address.trim(),
    enabled: form.enabled
  }
  if (!isSales) payload.salesId = form.salesId

  saving.value = true
  try {
    await api.createCustomer(payload)
    ElMessage.success('客户已创建')
    dialogVisible.value = false
    load()
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  load()
  loadSales()
})
</script>

<style scoped>
.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-hint-block {
  margin-left: 92px;
  margin-top: -6px;
}
</style>

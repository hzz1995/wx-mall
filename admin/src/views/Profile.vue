<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>个人中心</h2>
        <p class="sub">查看当前账号信息并修改登录密码</p>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">账号信息</div>
      <el-descriptions :column="3" border size="default">
        <el-descriptions-item label="姓名">{{ user.name || '—' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ user.phone || '—' }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ roleLabel }}</el-descriptions-item>
      </el-descriptions>
    </div>

    <div class="panel">
      <div class="panel-title">修改登录密码</div>
      <el-form label-width="100px" style="max-width: 520px">
        <el-form-item label="原密码" required>
          <el-input v-model="oldPassword" type="password" show-password maxlength="32" placeholder="请输入当前密码" />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="newPassword" type="password" show-password maxlength="32" placeholder="6-32 位" />
        </el-form-item>
        <el-form-item label="确认新密码" required>
          <el-input v-model="confirmPassword" type="password" show-password maxlength="32" placeholder="再次输入新密码" @keyup.enter="submit" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="submit">保存新密码</el-button>
        </el-form-item>
      </el-form>
      <div class="form-hint">修改成功后当前登录保持有效，其他设备上的登录会失效。</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api, getAdminUser, setAdminUser, setToken } from '../api'

const ROLE_MAP = { GLY: '管理员', XS: '销售', YY: '运营' }
const user = ref(getAdminUser() || {})
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const saving = ref(false)

const roleLabel = computed(() => ROLE_MAP[user.value.type] || user.value.type || '—')

onMounted(async () => {
  try {
    const data = await api.me()
    user.value = data.user || {}
    setAdminUser(user.value)
  } catch (err) {
    // 401 已由请求封装处理
  }
})

async function submit() {
  if (!oldPassword.value) {
    ElMessage.warning('请输入原密码')
    return
  }
  if (newPassword.value.length < 6 || newPassword.value.length > 32) {
    ElMessage.warning('新密码需为 6-32 位')
    return
  }
  if (newPassword.value === oldPassword.value) {
    ElMessage.warning('新密码不能与原密码相同')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }

  saving.value = true
  try {
    const data = await api.changeMyPassword({
      oldPassword: oldPassword.value,
      newPassword: newPassword.value
    })
    if (data.token) setToken(data.token)
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    ElMessage.success('密码已修改')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.panel {
  background: #fffdf8;
  border: 1px solid #e9e4d9;
  border-radius: 12px;
  padding: 22px 24px;
  margin-bottom: 18px;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}
</style>

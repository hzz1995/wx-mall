<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="brand-mark">店</div>
        <div>
          <h1>祥哥小铺</h1>
          <p>管理后台</p>
        </div>
      </div>

      <template v-if="mode === 'setup'">
        <div class="mode-title">初始化管理员</div>
        <div class="mode-sub">首次部署时创建唯一的超级管理员账号</div>

        <el-input v-model="setupForm.setupCode" size="large" placeholder="初始化校验码 SETUP_CODE" show-password />
        <el-input v-model="setupForm.phone" size="large" placeholder="管理员手机号" maxlength="11" class="mt" />
        <el-input v-model="setupForm.name" size="large" placeholder="管理员姓名" maxlength="20" class="mt" />
        <el-input v-model="setupForm.password" type="password" size="large" placeholder="登录密码（6-32 位）" show-password class="mt" />
        <el-input v-model="setupForm.confirm" type="password" size="large" placeholder="确认密码" show-password class="mt" @keyup.enter="submitSetup" />

        <el-button class="login-btn" type="primary" size="large" :loading="loading" @click="submitSetup">
          创建管理员并登录
        </el-button>
        <div class="switch-mode" @click="mode = 'login'">已有管理员账号？去登录</div>
      </template>

      <template v-else>
        <el-input v-model="phone" size="large" placeholder="手机号" maxlength="11" />
        <el-input
          v-model="password"
          type="password"
          size="large"
          placeholder="密码"
          show-password
          class="mt"
          @keyup.enter="submitLogin"
        />
        <el-button class="login-btn" type="primary" size="large" :loading="loading" @click="submitLogin">
          进入后台
        </el-button>
        <div v-if="needSetup" class="switch-mode" @click="mode = 'setup'">还没有管理员账号？去初始化</div>
        <div class="hint">管理员、运营和销售可登录后台；客户账号请在小程序登录</div>
      </template>

      <div v-if="warning" class="api warn">{{ warning }}</div>
    </div>
    <div class="login-foot">商品与订单管理</div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api, setAdminSession } from '../api'

const router = useRouter()
const mode = ref('login')
const needSetup = ref(false)
const warning = ref('')
const loading = ref(false)
const phone = ref('')
const password = ref('')
const setupForm = reactive({
  setupCode: '',
  phone: '',
  name: '',
  password: '',
  confirm: ''
})
onMounted(async () => {
  try {
    const data = await api.setupStatus()
    needSetup.value = Boolean(data.needSetup)
    if (data.warning) warning.value = data.warning
    if (data.needSetup) mode.value = 'setup'
  } catch (err) {
    warning.value = err.message
  }
})

function homePath(user) {
  return user && user.type === 'YY' ? '/products' : '/orders'
}

async function submitLogin() {
  if (!/^1[3-9]\d{9}$/.test(phone.value.trim())) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  if (!password.value) {
    ElMessage.warning('请输入密码')
    return
  }
  loading.value = true
  try {
    const data = await api.login(phone.value.trim(), password.value)
    setAdminSession(data.token, data.user)
    ElMessage.success('已登录')
    router.replace(homePath(data.user))
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function submitSetup() {
  if (!setupForm.setupCode.trim()) {
    ElMessage.warning('请输入初始化校验码')
    return
  }
  if (!/^1[3-9]\d{9}$/.test(setupForm.phone.trim())) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  if (!setupForm.name.trim()) {
    ElMessage.warning('请输入管理员姓名')
    return
  }
  if (setupForm.password.length < 6 || setupForm.password.length > 32) {
    ElMessage.warning('密码需为 6-32 位')
    return
  }
  if (setupForm.password !== setupForm.confirm) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }

  loading.value = true
  try {
    const data = await api.setup({
      setupCode: setupForm.setupCode.trim(),
      phone: setupForm.phone.trim(),
      name: setupForm.name.trim(),
      password: setupForm.password
    })
    setAdminSession(data.token, data.user)
    ElMessage.success('管理员已创建')
    router.replace('/orders')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 15% 15%, rgba(31, 77, 59, 0.12), transparent 42%),
    radial-gradient(circle at 85% 80%, rgba(192, 80, 45, 0.08), transparent 40%),
    #f4f2ec;
  padding: 24px;
}

.login-card {
  width: 400px;
  max-width: 100%;
  background: #fffdf8;
  border: 1px solid #e9e4d9;
  border-radius: 18px;
  padding: 38px 36px 30px;
  box-shadow: 0 20px 50px rgba(35, 36, 31, 0.08);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 30px;
}

.brand-mark {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #1f4d3b;
  color: #f6f4ef;
  font-size: 24px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand h1 {
  margin: 0;
  font-size: 22px;
  letter-spacing: 2px;
}

.brand p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8c8b82;
  letter-spacing: 2px;
}

.mode-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
}

.mode-sub {
  font-size: 12px;
  color: #8c8b82;
  margin-bottom: 18px;
}

.mt {
  margin-top: 12px;
}

.login-btn {
  width: 100%;
  margin-top: 16px;
  height: 44px;
}

.switch-mode {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: #1f4d3b;
  cursor: pointer;
  text-decoration: underline;
}

.hint {
  margin-top: 18px;
  font-size: 12px;
  color: #8c8b82;
  text-align: center;
  line-height: 1.7;
}

.api {
  margin-top: 10px;
  font-size: 11px;
  color: #b0ada3;
  text-align: center;
  word-break: break-all;
}

.api.warn {
  color: #c0502d;
}

.login-foot {
  margin-top: 26px;
  font-size: 12px;
  color: #a5a196;
  letter-spacing: 2px;
}
</style>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>店铺设置</h2>
        <p class="sub">店名和公告展示在小程序全部商品页，客服微信号展示在客户订单详情</p>
      </div>
    </div>

    <div class="panel">
      <el-form label-width="110px" style="max-width: 620px">
        <el-form-item label="店铺名称">
          <el-input v-model="form.shopName" maxlength="20" show-word-limit placeholder="例如：山野小店" />
        </el-form-item>
        <el-form-item label="商品页公告">
          <el-input
            v-model="form.notice"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="选填，例如：每周三统一发货，急单请直接联系店主"
          />
        </el-form-item>
        <el-form-item label="客服微信号">
          <el-input v-model="form.serviceWechat" maxlength="50" placeholder="选填，客户可在订单详情页一键复制" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
          <el-button :loading="loading" @click="load">重新加载</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="panel">
      <div class="preview-title">全部商品页效果预览</div>
      <div class="phone">
        <div class="phone-nav">{{ form.shopName || '祥哥小铺' }}</div>
        <div class="phone-hero">{{ form.shopName || '祥哥小铺' }}</div>
        <div class="phone-sub">商品浏览 · 订单记录</div>
        <div v-if="form.notice" class="phone-notice">{{ form.notice }}</div>
        <div class="phone-grid">
          <div v-for="n in 4" :key="n" class="phone-card"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const form = reactive({ shopName: '', notice: '', serviceWechat: '' })
const loading = ref(false)
const saving = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await api.settings()
    const settings = data.settings || {}
    form.shopName = settings.shopName || '祥哥小铺'
    form.notice = settings.notice || ''
    form.serviceWechat = settings.serviceWechat || ''
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.shopName.trim()) {
    ElMessage.warning('请填写店铺名称')
    return
  }
  saving.value = true
  try {
    await api.saveSettings({
      shopName: form.shopName,
      notice: form.notice,
      serviceWechat: form.serviceWechat
    })
    ElMessage.success('已保存')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.panel {
  background: #fffdf8;
  border: 1px solid #e9e4d9;
  border-radius: 12px;
  padding: 28px;
  margin-bottom: 20px;
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 18px;
}

.phone {
  width: 320px;
  border: 1px solid #e9e4d9;
  border-radius: 28px;
  padding: 18px 18px 28px;
  background: #f6f4ef;
  box-shadow: 0 12px 30px rgba(35, 36, 31, 0.06);
}

.phone-nav {
  text-align: center;
  font-size: 12px;
  color: #8c8b82;
  padding-bottom: 14px;
}

.phone-hero {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 2px;
  padding: 14px 8px 0;
}

.phone-sub {
  font-size: 10px;
  color: #8c8b82;
  letter-spacing: 1px;
  padding: 4px 8px 14px;
}

.phone-notice {
  background: #fbf3e7;
  border: 1px solid #efe0c9;
  color: #7a5a32;
  font-size: 10px;
  line-height: 1.6;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 14px;
}

.phone-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.phone-card {
  height: 110px;
  border-radius: 10px;
  background: linear-gradient(150deg, #f2f0e9, #e7e4da);
}
</style>

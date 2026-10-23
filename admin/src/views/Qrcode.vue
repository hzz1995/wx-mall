<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>小程序码</h2>
        <p class="sub">生成后可保存或打印使用</p>
      </div>
    </div>

    <div class="layout">
      <div class="panel">
        <div class="label">码类型</div>
        <el-radio-group v-model="type" @change="resetResult">
          <el-radio-button value="home">全部商品页</el-radio-button>
          <el-radio-button value="product">单个商品</el-radio-button>
        </el-radio-group>

        <template v-if="type === 'product'">
          <div class="label">选择商品</div>
          <el-select
            v-model="productCode"
            placeholder="输入商品名称搜索"
            filterable
            remote
            :remote-method="searchProducts"
            :loading="productLoading"
            style="width: 100%"
            @change="resetResult"
          >
            <el-option
              v-for="item in products"
              :key="item._id"
              :label="`${item.name}（${item.code || '无码'}）`"
              :value="item.code"
              :disabled="!item.code"
            />
          </el-select>
        </template>

        <div class="label">码版本</div>
        <el-radio-group v-model="envVersion" @change="resetResult">
          <el-radio-button value="release">正式版</el-radio-button>
          <el-radio-button value="trial">体验版</el-radio-button>
          <el-radio-button value="develop">开发版</el-radio-button>
        </el-radio-group>

        <div class="hints">
          <p>· 正式版二维码需小程序发布后才能被普通客户打开。</p>
          <p>· 尚未发布时用体验版测试，扫码人需先被添加为体验成员。</p>
          <p>· 商品码使用商品的短码，可在商品管理页查看编码。</p>
        </div>

        <el-button type="primary" size="large" :loading="generating" style="width: 100%" @click="generate">
          生成小程序码
        </el-button>
      </div>

      <div class="panel preview">
        <div v-if="qrDataUrl" class="qr-box">
          <img :src="qrDataUrl" alt="小程序码" class="qr-image" />
          <div class="qr-name">{{ qrName }}</div>
          <el-button type="primary" plain @click="download">下载 PNG</el-button>
        </div>
        <div v-else class="qr-empty">
          <div class="qr-placeholder"></div>
          <p>选择类型后点击生成</p>
        </div>
      </div>
    </div>

    <div class="panel guide">
      <div class="guide-title">访问设置</div>
      <ol>
        <li>微信公众平台 → 设置 → 基本设置 → 隐私设置 → 关闭「允许被搜索」。</li>
        <li>项目已在小程序 sitemap.json 中禁止页面被索引。</li>
        <li>不要开通「附近的小程序」等公开展示入口。</li>
        <li>生成的小程序码可保存或打印使用。</li>
      </ol>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const type = ref('home')
const products = ref([])
const productCode = ref('')
const productLoading = ref(false)
const envVersion = ref('release')
let productSearchSeq = 0
const generating = ref(false)
const qrDataUrl = ref('')
const qrName = ref('')

async function searchProducts(keyword) {
  const seq = ++productSearchSeq
  productLoading.value = true
  try {
    const current = products.value.find(item => item.code === productCode.value)
    const data = await api.products({
      keyword: String(keyword || '').trim(),
      page: 1,
      pageSize: 20,
      simple: 1
    })
    if (seq !== productSearchSeq) return
    const merged = new Map()
    if (current) merged.set(current.code, current)
    ;(data.list || []).forEach(item => {
      if (item.code) merged.set(item.code, item)
    })
    products.value = Array.from(merged.values())
  } catch (err) {
    if (seq !== productSearchSeq) return
    ElMessage.error(err.message)
  } finally {
    if (seq === productSearchSeq) productLoading.value = false
  }
}

function resetResult() {
  qrDataUrl.value = ''
  qrName.value = ''
}

async function generate() {
  if (type.value === 'product' && !productCode.value) {
    ElMessage.warning('请选择商品')
    return
  }
  generating.value = true
  try {
    const data = await api.qrcode({
      type: type.value,
      productCode: productCode.value,
      envVersion: envVersion.value
    })
    qrDataUrl.value = data.dataUrl
    if (type.value === 'product') {
      const product = products.value.find(item => item.code === productCode.value)
      qrName.value = product ? product.name : '商品码'
    } else {
      qrName.value = '全部商品页'
    }
    ElMessage.success('已生成')
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    generating.value = false
  }
}

function download() {
  if (!qrDataUrl.value) return
  const link = document.createElement('a')
  link.href = qrDataUrl.value
  link.download = `${qrName.value || '小程序码'}-${envVersion.value}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

onMounted(() => searchProducts(''))
</script>

<style scoped>
.layout {
  display: flex;
  gap: 20px;
  align-items: stretch;
  flex-wrap: wrap;
}

.panel {
  background: #fffdf8;
  border: 1px solid #e9e4d9;
  border-radius: 12px;
  padding: 24px;
  flex: 1;
  min-width: 320px;
}

.label {
  font-size: 13px;
  color: #8c8b82;
  margin: 20px 0 10px;
}

.label:first-child {
  margin-top: 0;
}

.hints {
  margin: 20px 0;
  color: #8c8b82;
  font-size: 12px;
  line-height: 1.8;
}

.hints p {
  margin: 0;
}

.preview {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 380px;
  min-height: 420px;
}

.qr-box {
  text-align: center;
}

.qr-image {
  width: 280px;
  height: 280px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #efebe2;
  display: block;
  margin: 0 auto 14px;
}

.qr-name {
  font-size: 14px;
  margin-bottom: 16px;
}

.qr-empty {
  text-align: center;
  color: #b0ada3;
  font-size: 13px;
}

.qr-placeholder {
  width: 200px;
  height: 200px;
  margin: 0 auto 16px;
  border: 1px dashed #d9d4c8;
  border-radius: 12px;
  background:
    repeating-linear-gradient(45deg, #f7f4ec, #f7f4ec 8px, #fbf9f3 8px, #fbf9f3 16px);
}

.guide {
  margin-top: 20px;
}

.guide-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
}

.guide ol {
  margin: 0;
  padding-left: 20px;
  color: #55564e;
  font-size: 13px;
  line-height: 2;
}
</style>

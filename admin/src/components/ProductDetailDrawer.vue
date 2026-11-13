<template>
  <el-drawer
    :model-value="modelValue"
    title="商品详情"
    size="520px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-loading="loading" class="product-detail">
      <template v-if="product">
        <div class="detail-head">
          <el-image
            v-if="cover"
            :src="cover"
            fit="cover"
            class="detail-cover"
            :preview-src-list="images"
            preview-teleported
          />
          <div v-else class="detail-cover thumb-empty">无图</div>
          <div class="detail-head-main">
            <div class="detail-name">{{ product.name }}</div>
            <div class="detail-price">¥{{ money(product.price) }}</div>
            <div class="muted">商品编码：{{ product.productCode || '—' }}</div>
            <div class="muted">规格型号：{{ product.spec || '—' }}</div>
            <div class="muted">单位：{{ product.unit || '—' }}</div>
          </div>
        </div>

        <div class="detail-block">
          <div class="detail-row"><span>原价</span><b>¥{{ money(product.originalPrice) }}</b></div>
          <div class="detail-row"><span>已售</span><b>{{ product.sales || 0 }}</b></div>
          <div class="detail-row"><span>产地</span><b>{{ product.origin || '—' }}</b></div>
          <div class="detail-row"><span>生产年份</span><b>{{ product.productionDate || '—' }}</b></div>
          <div class="detail-row"><span>有效期至</span><b>{{ product.validUntil || '—' }}</b></div>
          <div class="detail-row"><span>排序</span><b>{{ product.sort || 0 }}</b></div>
          <div class="detail-row"><span>状态</span><b>{{ product.status === 'ON' ? '上架' : '下架' }}</b></div>
        </div>

        <div class="detail-section-title">商品详情</div>
        <div class="detail-desc">{{ product.description || '未填写商品详情' }}</div>
      </template>
      <el-empty v-else-if="!loading" description="商品不存在或已删除" />
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../api'
import { money } from '../utils'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  productId: { type: String, default: '' }
})
defineEmits(['update:modelValue'])

const product = ref(null)
const loading = ref(false)
const images = computed(() => (product.value && product.value.imageUrls) || [])
const cover = computed(() => images.value[0] || '')

watch(
  [() => props.modelValue, () => props.productId],
  async ([visible, id]) => {
    if (!visible) return
    if (!id) {
      product.value = null
      return
    }
    loading.value = true
    try {
      const data = await api.product(id)
      product.value = data.product || null
    } catch (err) {
      product.value = null
    } finally {
      loading.value = false
    }
  }
)
</script>

<style scoped>
.product-detail {
  min-height: 160px;
}

.detail-head {
  display: flex;
  gap: 16px;
  padding-bottom: 16px;
}

.detail-cover {
  flex: 0 0 120px;
  width: 120px;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
}

.thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f1ea;
  color: #a9a598;
  font-size: 13px;
}

.detail-head-main {
  flex: 1;
  min-width: 0;
}

.detail-name {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
}

.detail-price {
  margin: 4px 0;
  color: #e2572b;
  font-size: 20px;
  font-weight: 600;
}

.detail-block {
  padding: 8px 0;
  border-top: 1px solid #eee7da;
}

.detail-row {
  display: flex;
  gap: 12px;
  padding: 5px 0;
  font-size: 13px;
}

.detail-row span {
  flex: 0 0 76px;
  color: #8e897c;
}

.detail-row b {
  flex: 1;
  font-weight: 400;
  color: #23241f;
  word-break: break-all;
}

.detail-section-title {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eee7da;
  font-size: 14px;
  font-weight: 600;
}

.detail-desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: #55564e;
  white-space: pre-wrap;
  word-break: break-word;
}

.muted {
  font-size: 13px;
  color: #8e897c;
}
</style>

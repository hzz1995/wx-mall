<template>
  <div class="uploader">
    <div v-for="(image, index) in modelValue" :key="image.fileID + index" class="upload-item">
      <img :src="image.url" alt="商品图片" />
      <span v-if="index === 0" class="cover-badge">封面</span>
      <button type="button" class="remove" @click="remove(index)">×</button>
    </div>

    <label v-if="modelValue.length < maxCount" class="upload-add" :class="{ uploading }">
      <input type="file" accept="image/*" multiple hidden :disabled="uploading" @change="onFiles" />
      <template v-if="!uploading">
        <span class="plus">+</span>
        <span class="label">上传图片</span>
      </template>
      <span v-else class="label">上传中…</span>
    </label>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  maxCount: { type: Number, default: 3 }
})
const emit = defineEmits(['update:modelValue'])
const uploading = ref(false)

function remove(index) {
  const next = props.modelValue.slice()
  next.splice(index, 1)
  emit('update:modelValue', next)
}

function compress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('图片格式不支持'))
      image.onload = () => {
        const maxSide = 1200
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
        const width = Math.round(image.width * scale)
        const height = Math.round(image.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl).split(',')
  const header = parts[0] || ''
  const base64 = parts[1] || ''
  const match = /data:([^;]+);/.exec(header)
  const mime = match ? match[1] : 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime })
}

async function onFiles(event) {
  const input = event.target
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return

  const remain = props.maxCount - props.modelValue.length
  if (remain <= 0) return

  uploading.value = true
  const next = props.modelValue.slice()
  try {
    for (const file of files.slice(0, remain)) {
      const dataUrl = await compress(file)
      const result = await api.uploadImageBlob(dataUrlToBlob(dataUrl))
      next.push({ fileID: result.fileID, url: result.url || dataUrl })
      emit('update:modelValue', next.slice())
    }
    if (files.length > remain) {
      ElMessage.warning(`最多上传 ${props.maxCount} 张图片`)
    }
  } catch (err) {
    ElMessage.error(err.message)
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.uploader {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.upload-item {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e9e4d9;
}

.upload-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-badge {
  position: absolute;
  left: 0;
  bottom: 0;
  padding: 1px 6px;
  font-size: 10px;
  color: #fff;
  background: rgba(31, 77, 59, 0.85);
  border-top-right-radius: 6px;
}

.remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 14px;
  line-height: 18px;
  cursor: pointer;
  padding: 0;
}

.upload-add {
  width: 96px;
  height: 96px;
  border: 1px dashed #d5d0c4;
  border-radius: 8px;
  background: #fbfaf6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #8c8b82;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.upload-add:hover {
  border-color: #1f4d3b;
  color: #1f4d3b;
}

.upload-add.uploading {
  cursor: wait;
}

.plus {
  font-size: 22px;
  line-height: 1;
}

.label {
  font-size: 11px;
}
</style>

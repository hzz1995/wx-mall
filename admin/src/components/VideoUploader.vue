<template>
  <div class="uploader">
    <div v-for="(video, index) in modelValue" :key="video.fileID || index" class="video-item">
      <video v-if="video.url" :src="video.url" controls class="video-preview"></video>
      <div v-else class="video-placeholder">{{ video.name || '视频已上传' }}</div>
      <button type="button" class="remove" @click="remove(index)">×</button>
      <div class="video-meta">{{ video.name || '商品视频' }}<span v-if="video.size"> · {{ sizeText(video.size) }}</span></div>
    </div>

    <div v-if="modelValue.length < maxCount" class="upload-slot">
      <label class="upload-add" :class="{ uploading }">
        <input type="file" accept="video/*" hidden :disabled="uploading" @change="onFiles" />
        <template v-if="!uploading">
          <span class="plus">+</span>
          <span class="label">上传视频</span>
        </template>
        <template v-else>
          <span class="label">上传中 {{ progress }}%</span>
          <div class="bar"><div class="bar-inner" :style="{ width: progress + '%' }"></div></div>
        </template>
      </label>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  maxCount: { type: Number, default: 2 }
})
const emit = defineEmits(['update:modelValue'])

const uploading = ref(false)
const progress = ref(0)
const CHUNK_SIZE = 2 * 1024 * 1024
const MAX_SIZE = 40 * 1024 * 1024

function sizeText(size) {
  const mb = Number(size) / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.max(1, Math.round(Number(size) / 1024))}KB`
}

function remove(index) {
  const next = props.modelValue.slice()
  next.splice(index, 1)
  emit('update:modelValue', next)
}

function randomId() {
  const random = Math.random().toString(36).slice(2, 12)
  return `${Date.now().toString(36)}${random}`.replace(/[^a-zA-Z0-9]/g, '')
}

async function onFiles(event) {
  const input = event.target
  const file = input.files && input.files[0]
  input.value = ''
  if (!file) return

  if (file.size <= 0) {
    ElMessage.error('视频文件无效')
    return
  }
  if (file.size > MAX_SIZE) {
    ElMessage.error('视频不能超过 40MB，请压缩后再上传')
    return
  }

  uploading.value = true
  progress.value = 0
  try {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
    if (totalChunks > 64) {
      throw new Error('视频分片过多，请压缩后再上传')
    }
    const uploadId = randomId()
    const fileIDs = []

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * CHUNK_SIZE
      const blob = file.slice(start, Math.min(file.size, start + CHUNK_SIZE))
      const result = await api.uploadChunkBlob(uploadId, index, totalChunks, blob)
      fileIDs.push(result.fileID)
      progress.value = Math.min(90, Math.round(((index + 1) / totalChunks) * 90))
    }

    const completed = await api.completeVideo({
      fileIDs,
      filename: file.name,
      contentType: file.type || 'video/mp4',
      size: file.size
    })
    progress.value = 100

    const next = props.modelValue.slice()
    next.push({
      fileID: completed.fileID,
      url: completed.url || '',
      name: file.name,
      size: completed.size || file.size
    })
    emit('update:modelValue', next)
    ElMessage.success('视频上传完成')
  } catch (err) {
    ElMessage.error(err.message || '视频上传失败')
  } finally {
    uploading.value = false
    progress.value = 0
  }
}
</script>

<style scoped>
.uploader {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
}

.video-item {
  position: relative;
  width: 170px;
  border: 1px solid #e9e4d9;
  border-radius: 8px;
  overflow: hidden;
  background: #fbfaf6;
}

.video-preview {
  width: 100%;
  height: 100px;
  display: block;
  background: #1c1d19;
  object-fit: contain;
}

.video-placeholder {
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c8b82;
  font-size: 12px;
  background: #efede6;
}

.video-meta {
  padding: 6px 8px;
  font-size: 11px;
  color: #8c8b82;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remove {
  position: absolute;
  top: 3px;
  right: 3px;
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

.upload-slot {
  display: flex;
  align-items: flex-start;
}

.upload-add {
  width: 140px;
  height: 140px;
  border: 1px dashed #d5d0c4;
  border-radius: 8px;
  background: #fbfaf6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #8c8b82;
  cursor: pointer;
  padding: 0 12px;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.upload-add:hover {
  border-color: #1f4d3b;
  color: #1f4d3b;
}

.upload-add.uploading {
  cursor: wait;
  color: #1f4d3b;
}

.plus {
  font-size: 24px;
  line-height: 1;
}

.label {
  font-size: 11px;
  text-align: center;
}

.bar {
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: #e4e0d5;
  overflow: hidden;
  margin-top: 4px;
}

.bar-inner {
  height: 100%;
  background: #1f4d3b;
  transition: width 0.2s ease;
}
</style>

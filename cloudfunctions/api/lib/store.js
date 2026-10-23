const { cloud, db, _ } = require('./context')

const DEFAULT_SETTINGS = {
  _id: 'shop',
  shopName: '祥哥小铺',
  notice: '',
  serviceWechat: ''
}

function toTimestamp(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength)
}

function isCloudFile(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0
}

function serializeProduct(product) {
  if (!product) return null
  return {
    ...product,
    price: Number(product.price) || 0,
    originalPrice: Number(product.originalPrice) || 0,
    sales: Number(product.sales) || 0,
    sort: Number(product.sort) || 0,
    images: Array.isArray(product.images) ? product.images : [],
    videos: Array.isArray(product.videos) ? product.videos : [],
    spec: product.spec || '',
    productionDate: product.productionDate || '',
    origin: product.origin || '',
    createdAt: toTimestamp(product.createdAt),
    updatedAt: toTimestamp(product.updatedAt)
  }
}

function serializeOrder(order) {
  if (!order) return null
  return {
    ...order,
    totalAmount: Number(order.totalAmount) || 0,
    items: (order.items || []).map(item => ({
      ...item,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0
    })),
    createdAt: toTimestamp(order.createdAt),
    updatedAt: toTimestamp(order.updatedAt)
  }
}

function sortBySort(list) {
  return list.slice().sort((a, b) => {
    const sortDiff = (Number(a.sort) || 0) - (Number(b.sort) || 0)
    if (sortDiff !== 0) return sortDiff
    return toTimestamp(b.createdAt) - toTimestamp(a.createdAt)
  })
}

async function getSettings() {
  try {
    const res = await db.collection('settings').doc('shop').get()
    return { ...DEFAULT_SETTINGS, ...res.data }
  } catch (err) {
    return { ...DEFAULT_SETTINGS }
  }
}

async function saveSettings(input) {
  const current = await getSettings()
  const data = {
    shopName: cleanText(input.shopName, 20) || current.shopName || DEFAULT_SETTINGS.shopName,
    notice: cleanText(input.notice, 200),
    serviceWechat: cleanText(input.serviceWechat, 50),
    updatedAt: new Date()
  }
  await db.collection('settings').doc('shop').set({ data: { ...data, createdAt: current.createdAt || new Date() } })
  return { _id: 'shop', ...data }
}

async function getTempUrlMap(fileIDs) {
  const uniqueFiles = Array.from(new Set((fileIDs || []).filter(Boolean)))
  const urlMap = {}
  for (let start = 0; start < uniqueFiles.length; start += 50) {
    const batch = uniqueFiles.slice(start, start + 50)
    try {
      const res = await cloud.getTempFileURL({ fileList: batch })
      ;(res.fileList || []).forEach(file => {
        if (file.status === 0 && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL
      })
    } catch (err) {
      console.warn('getTempFileURL batch failed', err)
    }
  }
  return urlMap
}

async function withTempUrls(records) {
  const fileList = []
  records.forEach(record => {
    ;(record.images || []).forEach(image => {
      if (isCloudFile(image)) fileList.push(image)
    })
    ;(record.videos || []).forEach(video => {
      if (isCloudFile(video)) fileList.push(video)
    })
  })
  const urlMap = await getTempUrlMap(fileList)
  return records.map(record => ({
    ...record,
    imageUrls: (record.images || []).map(image => urlMap[image] || (isCloudFile(image) ? '' : image)),
    videoUrls: (record.videos || []).map(video => urlMap[video] || (isCloudFile(video) ? '' : video))
  }))
}

function randomCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let code = ''
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

async function generateUniqueProductCode() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomCode()
    const res = await db.collection('products').where({ code }).count()
    if (res.total === 0) return code
  }
  throw new Error('商品码生成失败，请重试')
}

function generateOrderNo() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const pad = value => String(value).padStart(2, '0')
  const stamp = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join('')
  return `M${stamp}${Math.floor(Math.random() * 90 + 10)}`
}

async function findProductByIdOrCode({ id, code }) {
  if (id) {
    try {
      const res = await db.collection('products').doc(String(id)).get()
      return res.data || null
    } catch (err) {
      return null
    }
  }
  if (code) {
    const res = await db.collection('products').where({ code: String(code) }).limit(1).get()
    return res.data[0] || null
  }
  return null
}

async function getProductById(id) {
  if (!id) return null
  try {
    const res = await db.collection('products').doc(String(id)).get()
    return res.data || null
  } catch (err) {
    return null
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  toTimestamp,
  cleanText,
  isCloudFile,
  serializeProduct,
  serializeOrder,
  sortBySort,
  getSettings,
  saveSettings,
  withTempUrls,
  getTempUrlMap,
  generateUniqueProductCode,
  generateOrderNo,
  findProductByIdOrCode,
  getProductById
}

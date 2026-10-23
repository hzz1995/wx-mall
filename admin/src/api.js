const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')
const TOKEN_KEY = 'mall_admin_token'
const ADMIN_USER_KEY = 'mall_admin_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getAdminUser() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_USER_KEY) || 'null')
  } catch (err) {
    return null
  }
}

export function setAdminUser(user) {
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user))
}

export function setAdminSession(token, user) {
  setToken(token)
  setAdminUser(user)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ADMIN_USER_KEY)
}

export async function request(path, options = {}) {
  const { method = 'GET', body, auth = true } = options
  if (!BASE) {
    throw new Error('未配置接口地址：请将 admin/.env.example 复制为 .env 并填写 VITE_API_BASE')
  }

  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch (err) {
    throw new Error('无法连接服务，请检查网络或云函数地址')
  }

  let data = {}
  try {
    data = await response.json()
  } catch (err) {
    data = {}
  }

  if (response.status === 401) {
    clearToken()
    if (!window.location.hash.startsWith('#/login')) {
      window.location.hash = '#/login'
    }
    throw new Error(data.error || '登录已过期，请重新登录')
  }
  if (!response.ok) {
    throw new Error(data.error || `请求失败（${response.status}）`)
  }
  return data
}

function toQuery(params) {
  const search = new URLSearchParams()
  Object.keys(params || {}).forEach(key => {
    const value = params[key]
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value)
    }
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function requestBinary(path, blob, contentType) {
  if (!BASE) {
    throw new Error('未配置接口地址：请将 admin/.env.example 复制为 .env 并填写 VITE_API_BASE')
  }
  const headers = { 'Content-Type': contentType || 'application/octet-stream' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: blob })
  } catch (err) {
    throw new Error('无法连接服务，请检查网络或云函数地址')
  }

  let data = {}
  try {
    data = await response.json()
  } catch (err) {
    data = {}
  }
  if (response.status === 401) {
    clearToken()
    if (!window.location.hash.startsWith('#/login')) {
      window.location.hash = '#/login'
    }
    throw new Error(data.error || '登录已过期，请重新登录')
  }
  if (!response.ok) {
    throw new Error(data.error || `请求失败（${response.status}）`)
  }
  return data
}

export const api = {
  setupStatus() {
    return request('/setup/status', { auth: false })
  },
  setup(body) {
    return request('/setup', { method: 'POST', body, auth: false })
  },
  login(phone, password) {
    return request('/login', { method: 'POST', body: { phone, password }, auth: false })
  },
  health() {
    return request('/health', { auth: false })
  },
  me() {
    return request('/me')
  },
  carts(params) {
    return request(`/carts${toQuery(params)}`)
  },
  users(params) {
    return request(`/users${toQuery(params)}`)
  },
  sales() {
    return request('/users/sales')
  },
  createUser(body) {
    return request('/users', { method: 'POST', body })
  },
  updateUser(id, body) {
    return request(`/users/${id}`, { method: 'PUT', body })
  },
  resetUserPassword(id) {
    return request(`/users/${id}/password`, { method: 'POST', body: {} })
  },
  orders(params) {
    return request(`/orders${toQuery(params)}`)
  },
  order(id) {
    return request(`/orders/${id}`)
  },
  cancelOrder(id) {
    return request(`/orders/${id}`, { method: 'PATCH', body: { status: 'CANCELLED' } })
  },
  products(params) {
    return request(`/products${toQuery(params)}`)
  },
  createProduct(body) {
    return request('/products', { method: 'POST', body })
  },
  updateProduct(id, body) {
    return request(`/products/${id}`, { method: 'PUT', body })
  },
  deleteProduct(id) {
    return request(`/products/${id}`, { method: 'DELETE' })
  },
  categories() {
    return request('/categories')
  },
  createCategory(body) {
    return request('/categories', { method: 'POST', body })
  },
  updateCategory(id, body) {
    return request(`/categories/${id}`, { method: 'PUT', body })
  },
  deleteCategory(id) {
    return request(`/categories/${id}`, { method: 'DELETE' })
  },
  customers(params) {
    return request(`/customers${toQuery(params)}`)
  },
  reports(params) {
    return request(`/reports${toQuery(params)}`)
  },
  auditLogs(params) {
    return request(`/audit-logs${toQuery(params)}`)
  },
  settings() {
    return request('/settings')
  },
  saveSettings(body) {
    return request('/settings', { method: 'PUT', body })
  },
  uploadImage(body) {
    return request('/upload', { method: 'POST', body })
  },
  uploadImageBlob(blob) {
    return requestBinary('/upload', blob, blob.type || 'image/jpeg')
  },
  uploadChunkBlob(uploadId, index, totalChunks, blob) {
    const query = toQuery({ uploadId, index, totalChunks })
    return requestBinary(`/upload/chunk${query}`, blob, 'application/octet-stream')
  },
  uploadChunk(body) {
    return request('/upload/chunk', { method: 'POST', body })
  },
  completeVideo(body) {
    return request('/upload/video', { method: 'POST', body })
  },
  qrcode(body) {
    return request('/qrcode', { method: 'POST', body })
  }
}

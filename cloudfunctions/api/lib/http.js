const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400'
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    },
    body: JSON.stringify(body)
  }
}

function normalizePath(rawPath) {
  let path = (rawPath || '/').split('?')[0]
  const markers = ['/mall-api/', '/api/']
  for (const marker of markers) {
    const index = path.indexOf(marker)
    if (index >= 0) {
      path = path.slice(index + marker.length - 1)
      break
    }
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  return path || '/'
}

function isBinaryRequest(event) {
  const headers = event.headers || {}
  const contentType = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase()
  return (
    contentType.indexOf('application/octet-stream') === 0 ||
    contentType.indexOf('image/') === 0 ||
    contentType.indexOf('video/') === 0
  )
}

function parseBody(event) {
  if (isBinaryRequest(event)) {
    if (!event.body) return Buffer.alloc(0)
    return event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary')
  }

  if (!event.body) return {}
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new HttpError(400, '请求体不是合法的 JSON')
  }
}

function bearerToken(headers) {
  const raw = (headers && (headers.authorization || headers.Authorization)) || ''
  const match = /^Bearer\s+(.+)$/i.exec(raw)
  return match ? match[1] : ''
}

function toInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function friendlyDbError(err) {
  const message = (err && (err.errMsg || err.message)) || '服务异常，请稍后再试'
  if (/collection.*not exist|DATABASE_COLLECTION_NOT_EXIST/i.test(message)) {
    return '数据库集合未创建，请先在云开发控制台创建 users / categories / products / carts / orders / settings 集合'
  }
  if (/permission denied|PERMISSION_DENIED/i.test(message)) {
    return '数据库权限不足，请检查集合权限设置'
  }
  return message
}

module.exports = {
  CORS_HEADERS,
  HttpError,
  response,
  normalizePath,
  parseBody,
  bearerToken,
  toInt,
  escapeRegExp,
  friendlyDbError
}

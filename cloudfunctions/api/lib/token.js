const crypto = require('crypto')

const MINI_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000

function safeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function getSecret() {
  const secret = process.env.TOKEN_SECRET || ''
  if (!secret) {
    const err = new Error('云函数未配置 TOKEN_SECRET 环境变量')
    err.setup = true
    throw err
  }
  return secret
}

function passwordVersion(user) {
  return crypto
    .createHash('sha256')
    .update(String((user && user.passwordHash) || ''))
    .digest('hex')
    .slice(0, 16)
}

function issueToken(user, ttlMs) {
  const payload = Buffer.from(
    JSON.stringify({
      uid: user._id,
      role: user.type,
      pv: passwordVersion(user),
      exp: Date.now() + (ttlMs || MINI_TTL_MS)
    })
  ).toString('base64url')
  const signature = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload, signature] = parts
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
  if (!safeEqual(signature, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null
    if (!data.uid) return null
    return data
  } catch (err) {
    return null
  }
}

module.exports = {
  MINI_TTL_MS,
  ADMIN_TTL_MS,
  issueToken,
  verifyToken,
  safeEqual,
  passwordVersion
}

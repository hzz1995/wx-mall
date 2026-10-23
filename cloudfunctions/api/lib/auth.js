const { bearerToken } = require('./http')
const { verifyToken, passwordVersion } = require('./token')
const { getUserById } = require('./users')
const { AuthError } = require('./errors')

async function userFromToken(token) {
  const payload = verifyToken(token)
  if (!payload) throw new AuthError()
  const user = await getUserById(payload.uid)
  if (!user || user.enabled === false) {
    throw new AuthError()
  }
  if (!payload.pv || payload.pv !== passwordVersion(user)) {
    throw new AuthError()
  }
  return user
}

function requireMiniUser(event) {
  return userFromToken(event && event.token)
}

async function requireAdmin(headers) {
  const user = await userFromToken(bearerToken(headers))
  if (user.type !== 'GLY') {
    throw new AuthError('仅管理员可访问', 403)
  }
  return user
}

async function requireStaff(headers) {
  const user = await userFromToken(bearerToken(headers))
  if (!['GLY', 'XS', 'YY'].includes(user.type)) {
    throw new AuthError('仅管理员、运营和销售可登录后台', 403)
  }
  return user
}

module.exports = { requireMiniUser, requireAdmin, requireStaff }

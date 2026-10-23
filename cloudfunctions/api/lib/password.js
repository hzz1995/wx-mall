const crypto = require('crypto')

const KEY_LENGTH = 64

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('hex')
  return { passwordSalt: salt, passwordHash: hash }
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false
  const computed = crypto.scryptSync(String(password), salt, KEY_LENGTH)
  const expected = Buffer.from(String(hash), 'hex')
  if (computed.length !== expected.length) return false
  return crypto.timingSafeEqual(computed, expected)
}

module.exports = { hashPassword, verifyPassword }

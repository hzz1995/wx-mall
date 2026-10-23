const crypto = require('crypto')

const password = process.argv[2]
if (!password || password.length < 6 || password.length > 32) {
  console.error('用法: node scripts/hash-password.js <6-32位密码>')
  process.exit(1)
}

const salt = crypto.randomBytes(16).toString('hex')
const hash = crypto.scryptSync(password, salt, 64).toString('hex')

console.log(
  JSON.stringify(
    {
      passwordSalt: salt,
      passwordHash: hash
    },
    null,
    2
  )
)

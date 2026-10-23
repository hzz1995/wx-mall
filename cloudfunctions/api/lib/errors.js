class AppError extends Error {
  constructor(message, code = 'APP_ERROR', status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

class AuthError extends AppError {
  constructor(message = '登录已过期，请重新登录', status = 401) {
    super(message, 'UNAUTHORIZED', status)
  }
}

module.exports = { AppError, AuthError }

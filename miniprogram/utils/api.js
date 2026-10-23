const { FUNCTION_NAME } = require('../config')
const { getToken, clearSession, goLogin } = require('./session')

function call(action, payload) {
  return new Promise((resolve, reject) => {
    let finished = false
    let timer = null

    const finish = (fn, value) => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      fn(value)
    }

    timer = setTimeout(() => {
      console.warn('cloud call timeout', action)
      finish(reject, new Error('请求超时，请检查云函数是否正常运行'))
    }, 20000)

    const data = Object.assign({ action }, payload || {})
    const token = getToken()
    if (token) data.token = token

    wx.cloud.callFunction({
      name: FUNCTION_NAME,
      data,
      success(res) {
        const result = res.result || {}
        if (result.ok) {
          finish(resolve, result.data)
          return
        }
        if (result.code === 'UNAUTHORIZED') {
          clearSession()
          goLogin()
        }
        finish(reject, new Error(result.error || '服务异常，请稍后再试'))
      },
      fail(err) {
        console.error('cloud call failed', action, err)
        const message = (err && err.errMsg) || ''
        if (message.indexOf('FunctionName parameter could not be found') >= 0 || message.indexOf('FUNCTION_NOT_FOUND') >= 0) {
          finish(reject, new Error('云函数未部署，请先上传部署 cloudfunctions/api'))
          return
        }
        if (message.indexOf('Environment not found') >= 0 || message.indexOf('INVALID_ENV') >= 0) {
          finish(reject, new Error('云环境不存在，请检查 config.js 中的 ENV_ID'))
          return
        }
        finish(reject, new Error('网络异常，请稍后重试'))
      }
    })
  })
}

function toastError(err) {
  wx.showToast({
    title: (err && err.message) || '操作失败',
    icon: 'none',
    duration: 2400
  })
}

module.exports = { call, toastError }

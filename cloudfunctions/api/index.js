const { cloud } = require('./lib/context')
const { handleHttp } = require('./routes/admin')
const { handleMini } = require('./routes/mini')

console.log('[api] module loaded')

exports.main = async (event, context) => {
  try {
    if (event.httpMethod) {
      console.log('[api] http', event.httpMethod, event.path)
      return await handleHttp(event)
    }

    console.log('[api] invoke', event && event.action)
    const wxContext = cloud.getWXContext()
    const data = await handleMini(event, wxContext.OPENID || '')
    console.log('[api] done', event && event.action)
    return { ok: true, data }
  } catch (err) {
    console.error('[api] error', event && (event.action || event.path), err)
    return {
      ok: false,
      error: err.message || '服务异常，请稍后再试',
      code: err.code || ''
    }
  }
}

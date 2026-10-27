const { cloud } = require('./lib/context')

const BOOT_AT = Date.now()

console.log('[api] module loaded')

exports.main = async (event, context) => {
  const startedAt = Date.now()
  try {
    if (event && event.Type === 'Timer') {
      console.log('[api] keep warm')
      return { ok: true, data: { warm: true } }
    }

    if (event.httpMethod) {
      const { handleHttp } = require('./routes/admin')
      console.log('[api] http', event.httpMethod, event.path)
      return await handleHttp(event)
    }

    const { handleMini } = require('./routes/mini')
    const bootAgeMs = startedAt - BOOT_AT
    console.log('[api] invoke', event && event.action, 'coldStart', bootAgeMs < 500, 'bootAgeMs', bootAgeMs)
    const wxContext = cloud.getWXContext()
    const data = await handleMini(event, wxContext.OPENID || '')
    console.log('[api] done', event && event.action, 'costMs', Date.now() - startedAt)
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

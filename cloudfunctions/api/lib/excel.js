function getXlsx() {
  try {
    return require('xlsx')
  } catch (err) {
    throw new Error('Excel 导出组件未安装，请重新部署云函数并安装依赖')
  }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDateTime(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return [
    local.getUTCFullYear(),
    '-',
    pad(local.getUTCMonth() + 1),
    '-',
    pad(local.getUTCDate()),
    ' ',
    pad(local.getUTCHours()),
    ':',
    pad(local.getUTCMinutes())
  ].join('')
}

function yuan(cents) {
  return Number(((Number(cents) || 0) / 100).toFixed(2))
}

function buildOrderRows(orders) {
  const rows = []
  ;(orders || []).forEach(order => {
    const items = Array.isArray(order.items) && order.items.length
      ? order.items
      : [{ name: '', spec: '', quantity: '', price: 0 }]
    items.forEach(item => {
      const quantity = Number(item.quantity) || 0
      const price = Number(item.price) || 0
      rows.push({
        '订单号': order.orderNo || '',
        '下单时间': formatDateTime(order.createdAt),
        '客户名称': order.customerName || '',
        '手机号': order.phone || '',
        '店铺名称': order.shopName || '',
        '收货地址': order.address || '',
        '所属销售': order.salesName || '',
        '帮下单人': order.assistedByName || '',
        '订单来源': order.isDemo ? '销售演示' : (order.orderSource === 'ASSIST' ? '销售帮下单' : '客户自建'),
        '订单类型': order.isDemo ? '演示订单' : '正式订单',
        '订单状态': order.status === 'CANCELLED' ? '已取消' : (order.status === 'CLOSED' ? '已关闭' : '已完成'),
        '商品名称': item.name || '',
        '规格型号': item.spec || '',
        '数量': quantity,
        '单价(元)': yuan(price),
        '小计(元)': yuan(price * quantity),
        '订单金额(元)': yuan(order.totalAmount),
        '订单备注': order.remark || ''
      })
    })
  })
  return rows
}

function buildOrderExport(orders) {
  const XLSX = getXlsx()
  const rows = buildOrderRows(orders)
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    { wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 8 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 24 }
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '订单明细')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`
  return {
    base64: buffer.toString('base64'),
    filename: `订单导出_${stamp}.xlsx`,
    rowCount: rows.length
  }
}

module.exports = { buildOrderExport }

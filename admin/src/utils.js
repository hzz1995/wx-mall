import dayjs from 'dayjs'

export function money(cents) {
  const amount = Number(cents) || 0
  return amount % 100 === 0 ? String(amount / 100) : (amount / 100).toFixed(2)
}

export function time(timestamp) {
  return timestamp ? dayjs(timestamp).format('YYYY-MM-DD HH:mm') : '-'
}

export function statusText(status) {
  if (status === 'CANCELLED') return '已取消'
  if (status === 'CLOSED') return '已关闭'
  return '已完成'
}

export function statusType(status) {
  if (status === 'CANCELLED') return 'info'
  if (status === 'CLOSED') return 'warning'
  return 'success'
}

export function yuanToCents(value) {
  const text = String(value == null ? '' : value).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

export function centsToYuan(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2)
}

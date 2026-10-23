import dayjs from 'dayjs'

export function money(cents) {
  const amount = Number(cents) || 0
  return amount % 100 === 0 ? String(amount / 100) : (amount / 100).toFixed(2)
}

export function time(timestamp) {
  return timestamp ? dayjs(timestamp).format('YYYY-MM-DD HH:mm') : '-'
}

export function statusText(status) {
  return status === 'CANCELLED' ? '已取消' : '已完成'
}

export function statusType(status) {
  return status === 'CANCELLED' ? 'info' : 'success'
}

export function yuanToCents(value) {
  const text = String(value == null ? '' : value).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

export function centsToYuan(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2)
}

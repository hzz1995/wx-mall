function formatPrice(cents) {
  const amount = Number(cents) || 0
  return amount % 100 === 0 ? String(amount / 100) : (amount / 100).toFixed(2)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes())
  ].join('')
}

const STATUS_TEXT = {
  DONE: '已完成',
  CANCELLED: '已取消'
}

module.exports = { formatPrice, formatTime, STATUS_TEXT }

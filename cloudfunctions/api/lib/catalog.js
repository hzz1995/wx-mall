function getBoundProductIds(user) {
  if (!user || user.type !== 'KH' || !Array.isArray(user.productIds)) return []
  return Array.from(new Set(user.productIds.map(String).filter(Boolean)))
}

function hasProductBinding(user) {
  return getBoundProductIds(user).length > 0
}

function canAccessProduct(user, productId) {
  const bound = getBoundProductIds(user)
  return !bound.length || bound.includes(String(productId))
}

function filterVisibleProducts(user, products) {
  const bound = getBoundProductIds(user)
  if (!bound.length) return products
  const allowed = new Set(bound)
  return products.filter(product => allowed.has(String(product._id)))
}

module.exports = {
  getBoundProductIds,
  hasProductBinding,
  canAccessProduct,
  filterVisibleProducts
}

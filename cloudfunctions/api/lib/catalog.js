function getBoundCategoryIds(user) {
  if (!user || user.type !== 'KH' || !Array.isArray(user.categoryIds)) return []
  return Array.from(new Set(user.categoryIds.map(String).filter(Boolean)))
}

function hasCategoryBinding(user) {
  return getBoundCategoryIds(user).length > 0
}

function canAccessCategory(user, categoryId) {
  const bound = getBoundCategoryIds(user)
  return !bound.length || bound.includes(String(categoryId))
}

function productCategoryIds(product) {
  if (!product) return []
  if (Array.isArray(product.categoryIds) && product.categoryIds.length) {
    return product.categoryIds.map(String)
  }
  return product.categoryId ? [String(product.categoryId)] : []
}

function canAccessProduct(user, product) {
  if (!product) return false
  const bound = getBoundCategoryIds(user)
  if (!bound.length) return true
  const allowed = new Set(bound)
  return productCategoryIds(product).some(id => allowed.has(id))
}

function filterVisibleProducts(user, products) {
  const bound = getBoundCategoryIds(user)
  if (!bound.length) return products
  const allowed = new Set(bound)
  return products.filter(product => productCategoryIds(product).some(id => allowed.has(id)))
}

module.exports = {
  getBoundCategoryIds,
  hasCategoryBinding,
  canAccessCategory,
  canAccessProduct,
  filterVisibleProducts,
  productCategoryIds
}

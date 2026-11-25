function selected(cache, key) {
  return cache.get(key) ?? 'missing';
}
module.exports = { selected };


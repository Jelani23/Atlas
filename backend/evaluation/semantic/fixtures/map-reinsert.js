function reinsert(entries) {
  const map = new Map(entries);
  const old = map.get('a');
  map.delete('a');
  map.set('a', old);
  return [...map.keys()];
}
module.exports = { reinsert };


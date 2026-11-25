function aliasCount(n) {
  const state = { count: n };
  const alias = state;
  alias.count++;
  return state.count;
}
module.exports = { aliasCount };


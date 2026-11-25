function finish(flag) {
  try {
    if (flag) return 'first';
    throw new Error('broken');
  } finally { return 'last'; }
}
module.exports = { finish };


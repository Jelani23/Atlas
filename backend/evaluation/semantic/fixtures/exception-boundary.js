function safeParse(value) {
  const text = value.trim();
  try { return JSON.parse(text); }
  catch (error) { return null; }
}
module.exports = { safeParse };


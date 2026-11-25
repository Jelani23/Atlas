function unique(values) {
  const result = new Set(values);
  result.add(values[0]);
  return [...result];
}
module.exports = { unique };


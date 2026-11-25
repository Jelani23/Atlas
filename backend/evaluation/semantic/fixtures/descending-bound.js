function sizes(n) {
  const tried = [];
  for (let k = Math.min(n, 5); k >= 3; k--) tried.push(k);
  return tried;
}
module.exports = { sizes };


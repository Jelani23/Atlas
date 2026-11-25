function sumOddSlots(n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) continue;
    total += i;
  }
  return total;
}
module.exports = { sumOddSlots };


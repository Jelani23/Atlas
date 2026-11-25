function bump(n) { return n + 1; }
function twice(n) {
  return bump(bump(n));
}
module.exports = { twice };


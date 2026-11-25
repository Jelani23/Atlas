function testTwice(text) {
  const pattern = /a/g;
  return [pattern.test(text), pattern.test(text), pattern.lastIndex];
}
module.exports = { testTwice };


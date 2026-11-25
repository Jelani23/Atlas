const { price } = require('./unavailable-price');
function quote(sku) {
  return price(sku) * 2;
}
module.exports = { quote };


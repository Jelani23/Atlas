// src/tools/index.js
module.exports = {
    ...require('./web'),
    ...require('./files'),
    ...require('./development'),
    ...require('./memory'),
    ...require('./notes'),
    ...require('./tasks'),
    ...require('./utilities'),
    ...require('./writing')
};
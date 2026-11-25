require('dotenv').config({ path: require('node:path').resolve(__dirname, '../.env') });
require('../src/integrations/espnFantasy').execute(process.argv[2] || 'overview',process.argv[3] || '{}').then(console.log);

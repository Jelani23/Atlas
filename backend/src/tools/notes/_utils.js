// src/tools/notes/_utils.js
const path = require('path');

function sanitizeFilename(filename) {
    let name = String(filename || `atlas_note_${Date.now()}`);
    name = path.basename(name);
    name = name.replace(/\.txt$/i, '');
    name = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!name) name = `atlas_note_${Date.now()}`;
    return `${name}.txt`;
}
module.exports = { sanitizeFilename };
// src/tools/notes/writeNote.js
const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./_utils');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function writeNote(filename, content) {
    try {
        const safeFilename = sanitizeFilename(filename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir);
        const filePath = path.join(notesDir, safeFilename);
        fs.writeFileSync(filePath, content, 'utf8');
        return `Successfully saved the note to notes/${safeFilename}.`;
    } catch (error) {
        return `Error saving note: ${error.message}`;
    }
}

module.exports = {
    execute: writeNote,
    intentSchema: {
        name: 'writeNote',
        domain: 'NOTES',
        triggers: ['take a note', 'take note', 'jot down', 'write down', 'save note', 'create a note'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:create a note|take note|write note|save note)\s+(?:called|named)\s+(.*?)\s+(?:saying|with|that says)\s+(.*)/i);
            if (m) return [m[1].replace(/\s+/g, '_'), m[2]];
            const contentMatch = message.match(/(?:take a note|take note|jot down|write down|create a note|save a note)[:\s]*(.*)/i);
            return [null, contentMatch ? contentMatch[1].trim() : ""];
        }
    }
};

// src/tools/notes/renameNote.js
const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./_utils');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function renameNote(oldFilename, newFilename) {
    try {
        const oldSafe = sanitizeFilename(oldFilename);
        const newSafe = sanitizeFilename(newFilename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        const oldPath = path.join(notesDir, oldSafe);
        const newPath = path.join(notesDir, newSafe);

        if (!fs.existsSync(oldPath)) return `Error: Note ${oldSafe} not found.`;
        if (fs.existsSync(newPath)) return `Error: Note ${newSafe} already exists.`;

        fs.renameSync(oldPath, newPath);
        return `Successfully renamed ${oldSafe} to ${newSafe}.`;
    } catch (error) {
        return `Error renaming note: ${error.message}`;
    }
}

module.exports = {
    execute: renameNote,
    intentSchema: {
        name: 'renameNote',
        domain: 'NOTES',
        triggers: ['rename note', 'rename the'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:rename)\s+(?:the\s+)?(?:note\s+)?(.+?)\s+(?:to|as)\s+(?:be\s+)?(.+?)(?:\s+instead|\?|$)/i);
            if (m) return [m[1].replace(/\\s+/g, '_').trim(), m[2].replace(/\\s+/g, '_').trim()];
            return ['USE_LAST', null];
        }
    }
};
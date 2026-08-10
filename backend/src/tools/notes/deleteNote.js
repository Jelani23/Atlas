// src/tools/notes/deleteNote.js
const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./_utils');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function deleteNote(filename) {
    try {
        const safeFilename = sanitizeFilename(filename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        const notesPath = path.join(notesDir, safeFilename);
        const rootPath = path.join(BACKEND_ROOT, safeFilename);
        let actualPath = fs.existsSync(notesPath) ? notesPath : (fs.existsSync(rootPath) ? rootPath : null);
        if (!actualPath) return `Error: Note ${safeFilename} not found.`;
        fs.unlinkSync(actualPath);
        return `Successfully deleted the note ${safeFilename}.`;
    } catch (error) {
        return `Error deleting note: ${error.message}`;
    }
}

module.exports = {
    execute: deleteNote,
    intentSchema: {
        name: 'deleteNote',
        domain: 'NOTES',
        triggers: ['delete note', 'remove note', 'delete the', 'remove the'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            // Match "delete the note called X" or "delete note X"
            const m = message.match(/(?:delete the note|delete note|remove the note|remove note)\s+(?:called\s+|named\s+)?(.+?)(?:\?|$)/i);
            let filename = m ? m[1].trim() : 'USE_LAST';
            return [filename.replace(/\s+/g, '_')];
        }
    }
};

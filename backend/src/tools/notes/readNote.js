// src/tools/notes/readNote.js
const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./_utils');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function readNote(filename) {
    try {
        const safeFilename = sanitizeFilename(filename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        const notesPath = path.join(notesDir, safeFilename);
        const rootPath = path.join(BACKEND_ROOT, safeFilename);
        if (fs.existsSync(notesPath)) {
            let content = fs.readFileSync(notesPath, 'utf8');
            content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `Content of ${safeFilename}:\n${content}`;
        } else if (fs.existsSync(rootPath)) {
            let content = fs.readFileSync(rootPath, 'utf8');
            content = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `Content of ${safeFilename}:\n${content}`;
        }
        return `Error: Note ${safeFilename} not found.`;
    } catch (error) {
        return `Error reading note: ${error.message}`;
    }
}

module.exports = {
    execute: readNote,
    intentSchema: {
        name: 'readNote',
        domain: 'NOTES',
        triggers: ['read the note', 'read me the note', 'read note', 'show me the note', 'show note', 'open note'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            // Match "read the note called X" or "read me the note X"
            const m = message.match(/(?:read me the note|read the note|read me the|read the|read note|show me the note|show note)\s+(?:called\s+|named\s+)?(.+?)(?:\?|$)/i);
            let filename = m ? m[1].trim() : 'USE_LAST';
            return [filename.replace(/\s+/g, '_')];
        }
    }
};
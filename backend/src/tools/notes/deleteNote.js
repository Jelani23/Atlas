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
        // Phase: 'delete the' / 'remove the' were dangerously generic
        // triggers - "delete the last line of that paragraph" or "remove
        // the formatting" has nothing to do with notes, but would still
        // score a trigger match here. Require the word "note" to actually
        // be present in the trigger phrase itself.
        triggers: ['delete note', 'remove note', 'delete the note', 'remove the note'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            // Match "delete the note called X" or "delete note X"
            const m = message.match(/(?:delete the note|delete note|remove the note|remove note)\s+(?:called\s+|named\s+)?(.+?)(?:\?|$)/i);
            if (m && m[1].trim()) {
                return [m[1].trim().replace(/\s+/g, '_')];
            }
            // Phase: previously fell back to the literal string 'USE_LAST'
            // here, which is NOT null, so it slipped past the resolver's
            // null-param safety net even when nothing about a note was
            // actually identified. Only fall back to USE_LAST when the
            // message explicitly says "note" without naming one (e.g. "delete
            // the note") - otherwise return null so this can't win on an
            // unrelated message.
            if (/\bnote\b/i.test(message)) {
                return ['USE_LAST'];
            }
            return [null];
        }
    }
};

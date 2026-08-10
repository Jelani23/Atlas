// src/tools/notes/appendNote.js
const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./_utils');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function appendNote(filename, content) {
    try {
        const safeFilename = sanitizeFilename(filename);
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        const notesPath = path.join(notesDir, safeFilename);
        const rootPath = path.join(BACKEND_ROOT, safeFilename);
        let actualPath = fs.existsSync(notesPath) ? notesPath : (fs.existsSync(rootPath) ? rootPath : null);
        if (!actualPath) return `Error: Note ${safeFilename} not found.`;
        let currentContent = fs.readFileSync(actualPath, 'utf8');
        if (!currentContent.endsWith('\n')) currentContent += '\n';
        currentContent += content;
        fs.writeFileSync(actualPath, currentContent, 'utf8');
        return `Successfully updated the note ${safeFilename}.`;
    } catch (error) {
        return `Error updating note: ${error.message}`;
    }
}

module.exports = {
    execute: appendNote,
    intentSchema: {
        name: 'appendNote',
        domain: 'NOTES',
        triggers: ['append note', 'add to note', 'add a line to', 'add a line'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const m = message.match(/(?:to|in)\s+(.*?)\s+(?:saying|with|that says)\s+(.*)/i) || message.match(/(?:add a line to|append to)\s+(.*?)\s+(?:saying|with|that says)\s+(.*)/i);
            if (m) return [m[1].replace(/\s+/g, '_').trim(), m[2].trim()];
            const contentMatch = message.match(/(?:saying|with|that says|to add|to include|add another line saying|add a line saying)\s+(.*)/i);
            return ['USE_LAST', contentMatch ? contentMatch[1].trim() : message];
        }
    }
};

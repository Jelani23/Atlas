// src/tools/notes/listNotes.js
const fs = require('fs');
const path = require('path');
const BACKEND_ROOT = path.join(__dirname, '../../../');

async function listNotes() {
    try {
        const notesDir = path.join(BACKEND_ROOT, 'notes');
        if (!fs.existsSync(notesDir)) return "No notes directory found.";
        const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.txt'));
        if (files.length === 0) return "No notes found.";
        return `Available notes:\n${files.join('\n')}`;
    } catch (error) {
        return `Error listing notes: ${error.message}`;
    }
}

module.exports = {
    execute: listNotes,
    intentSchema: {
        name: 'listNotes',
        domain: 'NOTES',
        triggers: ["list","show","display"],
        requiredEntities: [],
        extractParams: (message, entities) => { return []; }
    }
};

// src/tools/notes/writeNote.js
const fs = require('fs');
const path = require('path');
const { sanitizeFilename } = require('./_utils');
const BACKEND_ROOT = path.join(__dirname, '../../../');

// Deterministic stop words for filename generation
const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'in', 'on', 'for', 'with', 'about', 'can', 'you', 'me', 'my', 'i', 'it', 'this', 'that', 'we', 'need', 'needs', 'our', 'has', 'have', 'be', 'will', 'do', 'does', 'just', 'so', 'if', 'but']);

function generateFilenameFromContent(content) {
    const words = content.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    
    if (words.length === 0) return `note_${Date.now()}`;
    return words.slice(0, 4).join('_');
}

async function writeNote(filename, content) {
    try {
        let actualFilename = filename;
        
        // If no filename provided, generate one deterministically from the content
        if (!actualFilename || actualFilename.trim() === '' || actualFilename === 'null') {
            actualFilename = generateFilenameFromContent(content || "");
            console.log(`[WriteNote] Generated filename: ${actualFilename}`);
        }
        
        const safeFilename = sanitizeFilename(actualFilename);
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
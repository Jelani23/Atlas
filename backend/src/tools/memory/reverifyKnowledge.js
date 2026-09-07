const { reverifyKnowledgeRecord } = require('../../memory/knowledgeVerificationService');

function extractRecordIds(message) {
    const match = String(message || '').match(
        /\b(?:reverify|verify|recheck)\s+(?:knowledge\s+)?records?\s+(.+)/i
    );
    if (!match) return [];

    const ids = [];
    const parts = match[1].match(/\d+\s*(?:-|through|to)\s*\d+|\d+/gi) || [];
    for (const part of parts) {
        const range = part.match(/(\d+)\s*(?:-|through|to)\s*(\d+)/i);
        if (!range) {
            ids.push(Number(part));
            continue;
        }
        const start = Number(range[1]);
        const end = Number(range[2]);
        const step = start <= end ? 1 : -1;
        for (let id = start; id !== end + step && ids.length < 20; id += step) {
            ids.push(id);
        }
    }
    return [...new Set(ids)].slice(0, 20);
}

async function reverifyKnowledgeRecords(...ids) {
    const recordIds = [...new Set(ids.map(Number).filter(Number.isInteger))];
    if (recordIds.length === 0) return 'No valid knowledge record IDs were provided.';

    const results = [];
    for (const id of recordIds) {
        results.push(await reverifyKnowledgeRecord(id));
    }
    return results.join('\n');
}

module.exports = {
    execute: reverifyKnowledgeRecords,
    intentSchema: {
        name: 'reverifyKnowledge',
        domain: 'MEMORY',
        triggers: [
            'reverify knowledge record',
            'reverify knowledge records',
            'verify knowledge record',
            'verify knowledge records',
            'recheck knowledge record',
            'recheck knowledge records',
            'reverify record',
            'reverify records',
            'verify record',
            'verify records',
            'recheck record',
            'recheck records'
        ],
        requiredEntities: [],
        extractParams: message => {
            const ids = extractRecordIds(message);
            return ids.length > 0 ? ids : [null];
        }
    },
    extractRecordIds,
    reverifyKnowledgeRecords
};

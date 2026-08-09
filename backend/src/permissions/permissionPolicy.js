// backend/src/permissions/permissionPolicy.js

const POLICY = {
    // LOW RISK (Read-only / Reversible)
    webSearch:          { risk: 'LOW', default: 'allow' },
    getTime:            { risk: 'LOW', default: 'allow' },
    convertTime:        { risk: 'LOW', default: 'allow' },
    calculate:          { risk: 'LOW', default: 'allow' },
    listNotes:          { risk: 'LOW', default: 'allow' },
    readNote:           { risk: 'LOW', default: 'allow' },
    searchKnowledge:    { risk: 'LOW', default: 'allow' },
    listCode:           { risk: 'LOW', default: 'allow' },
    readCode:           { risk: 'LOW', default: 'allow' },
    getDirectoryTree:   { risk: 'LOW', default: 'allow' },
    readCodeDirectory:  { risk: 'LOW', default: 'allow' },

    // MEDIUM RISK (Changes local state)
    writeNote:          { risk: 'MEDIUM', default: 'allow' },
    appendNote:         { risk: 'MEDIUM', default: 'allow' },
    renameNote:         { risk: 'MEDIUM', default: 'allow' },
    updateDevState:     { risk: 'MEDIUM', default: 'allow' },
    writeProposal:      { risk: 'MEDIUM', default: 'allow' },

    // HIGH RISK (Modifies real data)
    deleteNote:         { risk: 'HIGH', default: 'approval' },

    // CRITICAL RISK (Potentially destructive)
    // Future tools like executeCommand, modifyAtlas, etc. will go here.
};

module.exports = { POLICY };
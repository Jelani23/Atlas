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
    
    // Deterministic Tools
    findFile:           { risk: 'LOW', default: 'allow' },
    searchCode:         { risk: 'LOW', default: 'allow' },
    getFileHash:        { risk: 'LOW', default: 'allow' },
    getChangedFiles:    { risk: 'LOW', default: 'allow' },
    checkSyntax:        { risk: 'LOW', default: 'allow' },
    getTaskProgress:    { risk: 'LOW', default: 'allow' },
    listActiveTasks:    { risk: 'LOW', default: 'allow' },
    validateJSON:       { risk: 'LOW', default: 'allow' },
    fileExists:         { risk: 'LOW', default: 'allow' },
    getFileMetadata:    { risk: 'LOW', default: 'allow' },

    // NEW: Phase 5 Wave 3 & 4 Tools
    convertUnit:        { risk: 'LOW', default: 'allow' },
    convertCurrency:    { risk: 'LOW', default: 'allow' },
    percentage:         { risk: 'LOW', default: 'allow' },
    statistics:         { risk: 'LOW', default: 'allow' },
    wordCount:          { risk: 'LOW', default: 'allow' },
    characterCount:     { risk: 'LOW', default: 'allow' },
    formatText:         { risk: 'LOW', default: 'allow' },
    extractKeywords:    { risk: 'LOW', default: 'allow' },

    // MEDIUM RISK (Changes local state)
    writeNote:          { risk: 'MEDIUM', default: 'allow' },
    appendNote:         { risk: 'MEDIUM', default: 'allow' },
    renameNote:         { risk: 'MEDIUM', default: 'allow' },
    updateDevState:     { risk: 'MEDIUM', default: 'allow' },
    reverifyKnowledge:  { risk: 'MEDIUM', default: 'allow' },
    writeProposal:      { risk: 'MEDIUM', default: 'allow' },
    runTests:           { risk: 'MEDIUM', default: 'allow' }, 

    // HIGH RISK (Modifies real data)
    deleteNote:         { risk: 'HIGH', default: 'approval' },
};

module.exports = { POLICY };

// Ordered execute() inputs shared by the semantic catalog and plan validator.
// Do not infer these from requiredEntities: those describe intent matching,
// not function parameters (many tools with required inputs have no entities).
const { normalizeArithmeticExpression } = require('../utils/arithmeticExpression');
const text = name => ({ name, type: 'string' });
const noteFilename = name => ({ ...text(name), format: 'noteFilename' });
const number = name => ({ name, type: 'number' });
const directory = [{ ...text('directory'), optional: true, allowEmpty: true }];
const TOOL_ARGUMENTS = {
    calculate: [{ ...text('expression'), format: 'arithmetic',
        description: 'Translate spoken numbers/operators into digits and + - * / parentheses, without evaluating. Example: three times four becomes 3 * 4.' }],
    wordCount: [text('text')],
    characterCount: [text('text')],
    percentage: [number('value'), number('total')],
    statistics: [text('dataString')],
    convertUnit: [number('value'), text('fromUnit'), text('toUnit')],
    convertCurrency: [number('amount'), text('fromCurrency'), text('toCurrency')],
    formatText: [text('text'), text('format')],
    extractKeywords: [text('text'), { name: 'count', type: 'positiveInteger', optional: true }],
    webSearch: [text('query')],
    getTime: [],
    convertTime: [text('targetZone')],
    searchKnowledge: [text('query')],
    updateDevState: [text('feature'), text('status')],
    reverifyKnowledge: [{ name: 'recordIds', type: 'positiveInteger', variadic: true }],
    listNotes: [],
    readNote: [noteFilename('filename')],
    deleteNote: [noteFilename('filename')],
    writeNote: [noteFilename('filename'), text('content')],
    appendNote: [noteFilename('filename'), text('content')],
    renameNote: [noteFilename('oldFilename'), noteFilename('newFilename')],
    findFile: [text('query')],
    fileExists: [text('filePath')],
    getFileMetadata: [text('filePath')],
    getFileHash: [text('filePath')],
    getChangedFiles: [],
    readCode: [{ name: 'filePaths', type: 'stringOrStringArray' }],
    searchCode: [text('query')],
    listCode: directory,
    getDirectoryTree: directory,
    readCodeDirectory: directory,
    propose_code_change: [text('targetFilename'), text('reason'), text('risk'), text('proposedCode')],
    checkSyntax: [text('filePath')],
    validateJSON: [text('jsonString')],
    runTests: [],
    getTaskProgress: [text('taskId')],
    listActiveTasks: []
};

function getToolArguments(name) {
    return Object.hasOwn(TOOL_ARGUMENTS, name) ? TOOL_ARGUMENTS[name] : null;
}

function validateToolArguments(name, args) {
    const contract = getToolArguments(name);
    if (!contract || !Array.isArray(args) || args.length > 20) return false;
    const variadic = contract.at(-1)?.variadic === true;
    const minimum = contract.filter(input => !input.optional).length;
    if (args.length < minimum || (!variadic && args.length > contract.length)) return false;
    const validText = (value, allowEmpty = false) => typeof value === 'string' &&
        value.length <= 20000 && (allowEmpty || value.trim().length > 0);
    return args.every((value, index) => {
        const input = contract[Math.min(index, contract.length - 1)];
        if (input.format === 'noteFilename' && value === 'USE_LAST') return false;
        if (input.format === 'arithmetic' && (typeof value !== 'string' ||
            !/\d/.test(value) || !/^[0-9+\-*/().\s]+$/.test(value))) return false;
        switch (input.type) {
            case 'string': return validText(value, input.allowEmpty);
            case 'number': return typeof value === 'number' && Number.isFinite(value);
            case 'positiveInteger': return Number.isSafeInteger(value) && value > 0;
            case 'stringOrStringArray': return validText(value) ||
                (Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(item => validText(item)));
            default: return false;
        }
    });
}

function canonicalizeToolArguments(name, args) {
    if (!Array.isArray(args)) return null;
    const contract = getToolArguments(name);
    return args.map((value, index) => {
        if (contract?.[index]?.format === 'arithmetic') return normalizeArithmeticExpression(value);
        // This matches the whitespace rule used by note execution. Preserve
        // case and all other text; do not infer aliases or rewrite note bodies.
        if (contract?.[index]?.format === 'noteFilename' && typeof value === 'string') {
            return value.trim().replace(/\s+/g, '_');
        }
        return value;
    });
}

module.exports = { getToolArguments, validateToolArguments, canonicalizeToolArguments };

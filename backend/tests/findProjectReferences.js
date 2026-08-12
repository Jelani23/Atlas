const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SEARCH_TERMS = [
    'current_project',
    'currentProject',
    'activeProject',
    'active_project',
    'Deterministic hit',
    'current_task',
    'currentTask',

    // Project resolver / registry
    'projectResolver',
    'projectRegistry',
    'registeredProjects',
    'registerProject',
    'createProject',
    'switchProject',

    // Explicit project-memory handling
    'category === \'project\'',
    'category === "project"',
    'category: \'project\'',
    'category: "project"',

    // Project state extraction
    'current_project',
    'current_project:',
    'key: \'current_project\'',
    'key: "current_project"'
];

const IGNORE_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next'
]);

const EXTENSIONS = new Set([
    '.js',
    '.cjs',
    '.mjs',
    '.ts'
]);

function walkDirectory(dir) {
    const results = [];

    let entries;

    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        if (IGNORE_DIRS.has(entry.name)) {
            continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results.push(...walkDirectory(fullPath));
            continue;
        }

        if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            continue;
        }

        results.push(fullPath);
    }

    return results;
}

function searchFile(filePath) {
    const matches = [];

    let content;

    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch {
        return matches;
    }

    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
        for (const term of SEARCH_TERMS) {
            if (line.toLowerCase().includes(term.toLowerCase())) {
                matches.push({
                    term,
                    lineNumber: index + 1,
                    line: line.trim()
                });

                // Don't report the same line multiple times
                // for overlapping search terms.
                break;
            }
        }
    });

    return matches;
}

console.log('\n==============================================');
console.log('🔎 ATLAS PROJECT STATE TRACE');
console.log('==============================================\n');

const files = walkDirectory(ROOT);

console.log(`Scanning ${files.length} source files...\n`);

let totalMatches = 0;
let matchedFiles = 0;

for (const file of files) {
    const matches = searchFile(file);

    if (matches.length === 0) {
        continue;
    }

    matchedFiles++;

    const relativePath = path.relative(ROOT, file);

    console.log(`\n📄 ${relativePath}`);
    console.log('─'.repeat(70));

    for (const match of matches) {
        totalMatches++;

        console.log(
            `${String(match.lineNumber).padStart(5)} | ` +
            `[${match.term}] ${match.line}`
        );
    }
}

console.log('\n==============================================');
console.log('📊 TRACE SUMMARY');
console.log('==============================================');

console.log(`Files scanned:   ${files.length}`);
console.log(`Files matched:   ${matchedFiles}`);
console.log(`Total matches:   ${totalMatches}`);

console.log('\n==============================================');
console.log('END TRACE');
console.log('==============================================\n');
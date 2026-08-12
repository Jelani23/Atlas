const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const TERMS = [
    'workingContext',
    'working_context',
    'getWorkingContext',
    'updateWorkingContext',
    'CONVERSATION WORKING CONTEXT',
    'activeFiles',
    'activeProject',
    'currentTask'
];

const IGNORE_DIRS = new Set([
    'node_modules',
    '.git',
    '.vscode',
    'dist',
    'build',
    'coverage'
]);

const EXTENSIONS = new Set([
    '.js',
    '.cjs',
    '.mjs',
    '.json',
    '.ts',
    '.tsx',
    '.jsx'
]);

const matches = [];

function scanDirectory(dir) {
    let entries;

    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        console.error(`Could not read: ${dir}`);
        return;
    }

    for (const entry of entries) {
        if (IGNORE_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            scanDirectory(fullPath);
            continue;
        }

        if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            continue;
        }

        let content;

        try {
            content = fs.readFileSync(fullPath, 'utf8');
        } catch {
            continue;
        }

        const lines = content.split(/\r?\n/);

        lines.forEach((line, index) => {
            for (const term of TERMS) {
                if (line.includes(term)) {
                    matches.push({
                        file: path.relative(ROOT, fullPath),
                        line: index + 1,
                        term,
                        content: line.trim()
                    });
                }
            }
        });
    }
}

console.log('\n========================================');
console.log(' Atlas Working-Context Reference Scanner');
console.log('========================================\n');

console.log(`Scanning: ${ROOT}\n`);

scanDirectory(ROOT);

const grouped = {};

for (const match of matches) {
    if (!grouped[match.file]) {
        grouped[match.file] = [];
    }

    grouped[match.file].push(match);
}

for (const [file, fileMatches] of Object.entries(grouped)) {
    console.log(`\n📄 ${file}`);

    for (const match of fileMatches) {
        console.log(
            `   ${String(match.line).padStart(4)} | ` +
            `${match.term.padEnd(28)} | ` +
            match.content
        );
    }
}

console.log('\n========================================');
console.log(`Total references: ${matches.length}`);
console.log(`Files containing references: ${Object.keys(grouped).length}`);
console.log('========================================\n');
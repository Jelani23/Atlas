const projectResolver = require('../src/memory/projectResolver');

console.log('');
console.log('=== Project Memory Guard Test ===');
console.log('');

const candidates = [
    'Atlas',
    'atlas system',
    'Bindex',
    'Memory',
    'TTS system',
    'Alice'
];

for (const candidate of candidates) {
    const result = projectResolver.resolveProjectChange(candidate);

    if (result.allowed) {
        console.log(
            `✅ "${candidate}" → ALLOWED → ${result.project.name}`
        );
    } else {
        console.log(
            `🛑 "${candidate}" → REJECTED → not a registered project`
        );
    }
}

console.log('');
console.log('=== End Test ===');
console.log('');
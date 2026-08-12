// backend/tests/projectResolver.test.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const projectRegistry = require('../src/memory/projectRegistry');
const projectResolver = require('../src/memory/projectResolver');

async function runTests() {
    console.log('');
    console.log('=== Project Resolver Test ===');
    console.log('');

    console.log('Registered Projects:');

    const projects = await projectRegistry.getAllProjects();

    for (const project of projects) {
        console.log(`- ${project.name}`);
    }

    console.log('');

    const tests = [
        {
            name: 'Atlas',
            expected: 'existing_project'
        },
        {
            name: 'atlas system',
            expected: 'existing_project'
        },
        {
            name: 'Bindex',
            expected: 'existing_project'
        },
        {
            name: 'Memory',
            expected: 'unknown'
        },
        {
            name: 'TTS system',
            expected: 'unknown'
        },
        {
            name: 'Alice',
            expected: 'unknown'
        }
    ];

    for (const test of tests) {
        const result = await projectResolver.resolveProject(test.name);

        const passed = result.type === test.expected;

        console.log(
            `${passed ? '✅' : '❌'} ${test.name} → ${result.type}`
        );
    }

    console.log('');
    console.log('=== Project Switch Tests ===');
    console.log('');

    const switchTests = [
        'Atlas',
        'atlas system',
        'Bindex',
        'Memory',
        'TTS system'
    ];

    for (const name of switchTests) {
        const result = await projectResolver.resolveProjectChange(name);

        console.log(
            `${name} → ${result.action}` +
            (result.project ? ` (${result.project.name})` : '')
        );
    }

    console.log('');
    console.log('=== Project Creation Tests ===');
    console.log('');

    const creationTests = [
        'Atlas',
        'Bindex',
        'Memory',
        'New Game'
    ];

    for (const name of creationTests) {
        const result = await projectResolver.resolveProjectCreation(name);

        console.log(
            `${name} → ${result.action}` +
            (result.projectName ? ` (${result.projectName})` : '')
        );
    }

    console.log('');
    console.log('=== End Test ===');
    console.log('');
}

runTests().catch(error => {
    console.error('');
    console.error('❌ Project Resolver Test Failed');
    console.error(error);
    process.exit(1);
});
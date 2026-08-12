require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

const projectCommandResolver =
    require('../src/memory/projectCommandResolver');

async function run() {
    console.log('');
    console.log('=== Project Command Resolver Test ===');
    console.log('');

    const tests = [
        {
            input: 'Create a new project called Memory',
            expected: 'create'
        },
        {
            input: 'I want to create a project named Memory',
            expected: 'create'
        },
        {
            input: 'Make a new project called TTS system',
            expected: 'create'
        },
        {
            input: 'I am going to start a new project called Game Engine',
            expected: 'create'
        },
        {
            input: 'Create a new project called Atlas',
            expected: 'already_exists'
        },
        {
            input: 'I am working on Memory',
            expected: 'not_detected'
        },
        {
            input: 'Switch to Memory',
            expected: 'not_detected'
        },
        {
            input: 'Memory is the thing I am working on',
            expected: 'not_detected'
        }
    ];

    for (const test of tests) {
        const result =
            await projectCommandResolver.resolveProjectCreation(
                test.input
            );

        let actual;

        if (!result.detected) {
            actual = 'not_detected';
        } else {
            actual = result.action;
        }

        console.log(
            `${actual === test.expected ? '✅' : '❌'} ` +
            `${test.input} → ${actual}`
        );

        if (result.requestedName) {
            console.log(
                `   Requested Project: ${result.requestedName}`
            );
        }

        if (result.project) {
            console.log(
                `   Existing Project: ${result.project.name}`
            );
        }
    }

    console.log('');
    console.log('=== End Test ===');
    console.log('');
}

run().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
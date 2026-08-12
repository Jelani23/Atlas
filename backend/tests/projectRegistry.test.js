require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

const projectRegistry = require('../src/memory/projectRegistry');
const supabase = require('../src/database/supabaseClient');

const TEST_PROJECT_KEY = '__atlas_registry_test__';
const TEST_PROJECT_NAME = '__Atlas Registry Test__';

async function run() {
    console.log('');
    console.log('=== Project Registry Test ===');
    console.log('');

    // Cleanup from a previous failed test run.
    await cleanup();

    console.log('1. Creating test project...');

    const created = await projectRegistry.addProject({
        project_key: TEST_PROJECT_KEY,
        name: TEST_PROJECT_NAME,
        aliases: [
            TEST_PROJECT_NAME,
            'registry test'
        ],
        description: 'Temporary project used for registry testing.'
    });

    console.log(
        created.created
            ? `✅ Created: ${created.project.name}`
            : `❌ Project was not created`
    );

    // --------------------------------------------------

    console.log('');
    console.log('2. Looking up by exact name...');

    const exact = await projectRegistry.findProject(TEST_PROJECT_NAME);

    console.log(
        exact
            ? `✅ Found: ${exact.name}`
            : '❌ Project not found'
    );

    // --------------------------------------------------

    console.log('');
    console.log('3. Looking up by lowercase name...');

    const lowercase = await projectRegistry.findProject(
        TEST_PROJECT_NAME.toLowerCase()
    );

    console.log(
        lowercase
            ? `✅ Found: ${lowercase.name}`
            : '❌ Project not found'
    );

    // --------------------------------------------------

    console.log('');
    console.log('4. Looking up by alias...');

    const alias = await projectRegistry.findProject('registry test');

    console.log(
        alias
            ? `✅ Found through alias: ${alias.name}`
            : '❌ Alias lookup failed'
    );

    // --------------------------------------------------

    console.log('');
    console.log('5. Checking projectExists()...');

    const exists = await projectRegistry.projectExists(
        TEST_PROJECT_NAME
    );

    console.log(
        exists
            ? '✅ projectExists() returned true'
            : '❌ projectExists() returned false'
    );

    // --------------------------------------------------

    console.log('');
    console.log('6. Attempting duplicate creation...');

    const duplicate = await projectRegistry.addProject({
        project_key: TEST_PROJECT_KEY,
        name: TEST_PROJECT_NAME,
        aliases: [TEST_PROJECT_NAME]
    });

    console.log(
        !duplicate.created && duplicate.project
            ? `✅ Duplicate prevented: ${duplicate.project.name}`
            : '❌ Duplicate was created'
    );

    // --------------------------------------------------

    console.log('');
    console.log('7. Cleaning up test project...');

    await cleanup();

    console.log('✅ Cleanup complete.');

    // --------------------------------------------------

    console.log('');
    console.log('=== End Project Registry Test ===');
    console.log('');
}

async function cleanup() {
    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('project_key', TEST_PROJECT_KEY);

    if (error) {
        throw new Error(
            `Cleanup failed: ${error.message}`
        );
    }
}

run().catch(error => {
    console.error('');
    console.error('❌ Project Registry Test Failed:');
    console.error(error);
    console.error('');
    process.exit(1);
});
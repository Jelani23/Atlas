require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

const supabase = require('../src/database/supabaseClient');
const projectResolver = require('../src/memory/projectResolver');

const TEST_PROJECT_KEY = 'atlas-command-test';
const TEST_PROJECT_NAME = 'Atlas Command Test';

async function cleanup() {
    const { data, error } = await supabase
        .from('projects')
        .delete()
        .eq('project_key', TEST_PROJECT_KEY)
        .select('id');

    if (error) {
        throw new Error(`Cleanup failed: ${error.message}`);
    }

    return data || [];
}

async function run() {
    console.log('');
    console.log('=== Project Command Integration Test ===');
    console.log('');

    await cleanup();

    // --------------------------------------------------
    console.log('1. Create project command');

    const createResult = await projectResolver.handleProjectCommand(
        `Create a new project called ${TEST_PROJECT_NAME}`
    );

    console.log(
        createResult.action === 'created'
            ? `✅ Created: ${createResult.project.name}`
            : `❌ Unexpected result: ${createResult.action}`
    );

    // --------------------------------------------------
    console.log('');
    console.log('2. Verify project exists in registry');

    const lookupResult = await projectResolver.resolveProject(
        TEST_PROJECT_NAME
    );

    console.log(
        lookupResult.type === 'existing_project'
            ? `✅ Registry found: ${lookupResult.project.name}`
            : '❌ Registry could not find project'
    );

    // --------------------------------------------------
    console.log('');
    console.log('3. Repeat creation command');

    const duplicateResult = await projectResolver.handleProjectCommand(
        `Create a new project called ${TEST_PROJECT_NAME}`
    );

    console.log(
        duplicateResult.action === 'already_exists'
            ? `✅ Duplicate prevented: ${duplicateResult.project.name}`
            : `❌ Unexpected result: ${duplicateResult.action}`
    );

    // --------------------------------------------------
    console.log('');
    console.log('4. Normal project statement should NOT create');

    const normalResult = await projectResolver.handleProjectCommand(
        `I am working on ${TEST_PROJECT_NAME}`
    );

    console.log(
        normalResult.action === 'not_detected'
            ? '✅ Normal statement ignored by creation handler'
            : `❌ Unexpected result: ${normalResult.action}`
    );

    // --------------------------------------------------
    console.log('');
    console.log('5. Cleanup');

    const deleted = await cleanup();

    if (deleted.length > 0) {
        console.log(`✅ Cleanup complete. Removed ${deleted.length} project.`);
    } else {
        console.log('⚠️ Cleanup completed, but no matching project was found.');
    }

    await cleanup();

    console.log('✅ Cleanup complete.');

    console.log('');
    console.log('=== End Project Command Integration Test ===');
    console.log('');
}

run().catch(error => {
    console.error('');
    console.error('❌ Project Command Integration Test Failed:');
    console.error(error);
    console.error('');

    cleanup()
        .catch(() => {})
        .finally(() => process.exit(1));
});
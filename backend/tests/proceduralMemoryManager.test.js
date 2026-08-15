require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

const supabase =
    require('../src/database/supabaseClient');

const memoryManager =
    require('../src/memory/memoryManager');

async function runTest() {

    console.log('\n========================================');
    console.log('Procedural Memory Manager Test');
    console.log('========================================\n');

    const testMemory = {
        shouldRemember: true,

        category: 'procedure',

        subject: 'response_formatting',

        topics: [
            'technical_explanations',
            'step_by_step'
        ],

        key: 'step_by_step_explanations',

        value:
            'When explaining technical concepts, provide step-by-step explanations.',

        // Transitional legacy representation.
        trigger:
            'when explaining technical concepts',

        action:
            'provide step-by-step explanations',

        context:
            'technical_explanations',

        confidence: 0.95
    };

    try {

        /**
         * ----------------------------------------------------
         * 1. CLEAN UP
         * ----------------------------------------------------
         */

        const { error: cleanupError } = await supabase
            .from('procedural_memory')
            .delete()
            .eq('category', testMemory.category)
            .eq('subject', testMemory.subject)
            .eq('key', testMemory.key);

        if (cleanupError) {
            throw new Error(
                `Cleanup failed: ${cleanupError.message}`
            );
        }

        console.log('✓ Cleaned previous test record');


        /**
         * ----------------------------------------------------
         * 2. INSERT THROUGH MEMORY MANAGER
         * ----------------------------------------------------
         */

        const firstResult =
            await memoryManager.handleMemoryAction(
                testMemory
            );

        if (
            firstResult.action !== 'saved' ||
            !Array.isArray(firstResult.memories) ||
            firstResult.memories.length !== 1
        ) {
            throw new Error(
                `Expected procedural memory to be saved. Got: ${JSON.stringify(firstResult)}`
            );
        }

        console.log(
            '✓ Memory manager saved procedural memory'
        );


        /**
         * ----------------------------------------------------
         * 3. VERIFY DATABASE RECORD
         * ----------------------------------------------------
         */

        const { data: stored, error: fetchError } =
            await supabase
                .from('procedural_memory')
                .select('*')
                .eq('category', testMemory.category)
                .eq('subject', testMemory.subject)
                .eq('key', testMemory.key)
                .maybeSingle();

        if (fetchError) {
            throw new Error(
                `Failed to retrieve stored record: ${fetchError.message}`
            );
        }

        if (!stored) {
            throw new Error(
                'Memory manager reported success but no database record exists.'
            );
        }

        console.log(
            '✓ Procedural memory exists in database'
        );


        /**
         * ----------------------------------------------------
         * 4. VERIFY SEMANTIC LAYERS
         * ----------------------------------------------------
         */

        if (stored.category !== testMemory.category) {
            throw new Error(
                'Category was not stored correctly.'
            );
        }

        if (stored.subject !== testMemory.subject) {
            throw new Error(
                'Subject was not stored correctly.'
            );
        }

        if (stored.key !== testMemory.key) {
            throw new Error(
                'Canonical key was not stored correctly.'
            );
        }

        if (
            !Array.isArray(stored.topics) ||
            stored.topics.length !== testMemory.topics.length
        ) {
            throw new Error(
                'Topics were not stored correctly.'
            );
        }

        for (const topic of testMemory.topics) {
            if (!stored.topics.includes(topic)) {
                throw new Error(
                    `Missing stored topic: ${topic}`
                );
            }
        }

        if (stored.confidence !== testMemory.confidence) {
            throw new Error(
                'Confidence was not stored correctly.'
            );
        }

        console.log(
            '✓ Semantic layers stored correctly'
        );


        /**
         * ----------------------------------------------------
         * 5. VERIFY LEGACY TRANSITION FIELDS
         * ----------------------------------------------------
         */

        if (stored.trigger !== testMemory.trigger) {
            throw new Error(
                'Legacy trigger was not stored correctly.'
            );
        }

        if (stored.action !== testMemory.action) {
            throw new Error(
                'Legacy action was not stored correctly.'
            );
        }

        if (stored.context !== testMemory.context) {
            throw new Error(
                'Legacy context was not stored correctly.'
            );
        }

        console.log(
            '✓ Transitional legacy fields preserved'
        );


        /**
         * ----------------------------------------------------
         * 6. SEND EXACT SAME CANONICAL MEMORY AGAIN
         * ----------------------------------------------------
         *
         * Same:
         *
         *   category
         *   subject
         *   key
         *   value
         *   trigger
         *   action
         *   context
         *   topics
         *   confidence
         *
         * Therefore the deduplicator should classify this as:
         *
         *   duplicate
         *
         * Nothing should be written to the database.
         * ----------------------------------------------------
         */

        const duplicateResult =
            await memoryManager.handleMemoryAction(
                testMemory
            );

        if (duplicateResult.action !== 'duplicate') {
            throw new Error(
                `Expected duplicate result, got: ${JSON.stringify(duplicateResult)}`
            );
        }

        console.log(
            '✓ Exact same procedural memory detected as duplicate'
        );


        /**
         * ----------------------------------------------------
         * 7. VERIFY ONLY ONE RECORD EXISTS AFTER DUPLICATE
         * ----------------------------------------------------
         */

        const { data: recordsAfterDuplicate, error: duplicateRecordsError } =
            await supabase
                .from('procedural_memory')
                .select('id, category, subject, key')
                .eq('category', testMemory.category)
                .eq('subject', testMemory.subject)
                .eq('key', testMemory.key);

        if (duplicateRecordsError) {
            throw new Error(
                `Failed to verify duplicate count: ${duplicateRecordsError.message}`
            );
        }

        if (
            !recordsAfterDuplicate ||
            recordsAfterDuplicate.length !== 1
        ) {
            throw new Error(
                `Expected exactly one canonical record after duplicate, found ${recordsAfterDuplicate?.length || 0}.`
            );
        }

        console.log(
            '✓ Canonical identity prevented duplicate storage'
        );


        /**
         * ----------------------------------------------------
         * 8. CREATE AN UPDATED VERSION
         * ----------------------------------------------------
         *
         * Same canonical identity:
         *
         *   category
         *   subject
         *   key
         *
         * But the actual procedure changes.
         *
         * This should produce:
         *
         *   update
         *
         * rather than another insert.
         * ----------------------------------------------------
         */

        const updatedMemory = {
            ...testMemory,

            value:
                'When explaining technical concepts, provide concise step-by-step explanations.',

            action:
                'provide concise step-by-step explanations',

            confidence: 0.97
        };


        /**
         * ----------------------------------------------------
         * 9. SEND UPDATED PROCEDURAL MEMORY
         * ----------------------------------------------------
         */

        const updateResult =
            await memoryManager.handleMemoryAction(
                updatedMemory
            );

        if (
            updateResult.action !== 'saved' ||
            !Array.isArray(updateResult.memories) ||
            updateResult.memories.length !== 1
        ) {
            throw new Error(
                `Expected updated procedural memory to be saved. Got: ${JSON.stringify(updateResult)}`
            );
        }

        console.log(
            '✓ Changed procedural memory detected as update'
        );


        /**
         * ----------------------------------------------------
         * 10. VERIFY UPDATED DATABASE RECORD
         * ----------------------------------------------------
         */

        const { data: updatedStored, error: updatedFetchError } =
            await supabase
                .from('procedural_memory')
                .select('*')
                .eq('category', updatedMemory.category)
                .eq('subject', updatedMemory.subject)
                .eq('key', updatedMemory.key)
                .maybeSingle();

        if (updatedFetchError) {
            throw new Error(
                `Failed to retrieve updated record: ${updatedFetchError.message}`
            );
        }

        if (!updatedStored) {
            throw new Error(
                'Updated procedural memory could not be found.'
            );
        }

        if (
            updatedStored.action !== updatedMemory.action
        ) {
            throw new Error(
                'Updated action was not stored correctly.'
            );
        }

        if (
            updatedStored.trigger !== updatedMemory.trigger
        ) {
            throw new Error(
                'Trigger unexpectedly changed during update.'
            );
        }

        if (
            updatedStored.context !== updatedMemory.context
        ) {
            throw new Error(
                'Context unexpectedly changed during update.'
            );
        }

        if (
            updatedStored.confidence !== updatedMemory.confidence
        ) {
            throw new Error(
                'Updated confidence was not stored correctly.'
            );
        }

        console.log(
            '✓ Updated procedural memory stored correctly'
        );


        /**
         * ----------------------------------------------------
         * 11. VERIFY UPDATE DID NOT CREATE A SECOND RECORD
         * ----------------------------------------------------
         */

        const { data: finalRecords, error: finalRecordsError } =
            await supabase
                .from('procedural_memory')
                .select('id, category, subject, key')
                .eq('category', updatedMemory.category)
                .eq('subject', updatedMemory.subject)
                .eq('key', updatedMemory.key);

        if (finalRecordsError) {
            throw new Error(
                `Failed to verify final record count: ${finalRecordsError.message}`
            );
        }

        if (!finalRecords || finalRecords.length !== 1) {
            throw new Error(
                `Expected exactly one canonical record after update, found ${finalRecords?.length || 0}.`
            );
        }

        console.log(
            '✓ Update modified the existing canonical record'
        );


        /**
         * ----------------------------------------------------
         * SUCCESS
         * ----------------------------------------------------
         */

        console.log('\n========================================');
        console.log('ALL TESTS PASSED ✓');
        console.log('========================================\n');

    } catch (error) {

        console.error('\n========================================');
        console.error('TEST FAILED ✗');
        console.error('========================================\n');

        console.error(error.message);

        process.exitCode = 1;
    }
}

runTest();
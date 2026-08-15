require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

const proceduralMemory = require('../src/memory/proceduralMemory');

async function runTest() {
    console.log('\n========================================');
    console.log('Procedural Memory Storage Test');
    console.log('========================================\n');

    const testMemory = {
        category: 'test',
        subject: 'storage',
        topics: [
            'procedural_memory',
            'schema_test'
        ],
        key: 'test_procedure',
        trigger: 'when testing procedural storage',
        action: 'store the procedure correctly',
        context: 'testing',
        confidence: 0.75
    };

    const testIdentity = {
        category: testMemory.category,
        subject: testMemory.subject,
        key: testMemory.key
    };

    try {

        /**
         * ----------------------------------------------------
         * 1. CLEAN UP ANY PREVIOUS TEST RECORD
         * ----------------------------------------------------
         *
         * This keeps the test repeatable.
         *
         * We use Supabase directly only for cleanup because
         * proceduralMemory intentionally does not expose a
         * delete function.
         *
         * ----------------------------------------------------
         */

        const supabase =
            require('../src/database/supabaseClient');

        const { error: cleanupError } = await supabase
            .from('procedural_memory')
            .delete()
            .eq('category', testIdentity.category)
            .eq('subject', testIdentity.subject)
            .eq('key', testIdentity.key);

        if (cleanupError) {
            throw new Error(
                `Cleanup failed: ${cleanupError.message}`
            );
        }

        console.log('✓ Cleaned previous test record');


        /**
         * ----------------------------------------------------
         * 2. INSERT
         * ----------------------------------------------------
         */

        await proceduralMemory.addProcedure(
            testMemory
        );

        console.log('✓ Procedure inserted');


        /**
         * ----------------------------------------------------
         * 3. FIND BY CANONICAL IDENTITY
         * ----------------------------------------------------
         */

        const found =
            await proceduralMemory.find(
                testIdentity.category,
                testIdentity.subject,
                testIdentity.key
            );

        if (!found) {
            throw new Error(
                'Inserted procedure could not be found.'
            );
        }

        console.log('✓ Procedure found by canonical identity');


        /**
         * ----------------------------------------------------
         * 4. VERIFY STORED DATA
         * ----------------------------------------------------
         */

        const expectedFields = [
            'category',
            'subject',
            'key',
            'trigger',
            'action',
            'context',
            'confidence'
        ];

        for (const field of expectedFields) {

            if (
                found[field] === undefined ||
                found[field] === null
            ) {
                throw new Error(
                    `Stored procedure is missing field: ${field}`
                );
            }
        }

        if (found.category !== testMemory.category) {
            throw new Error(
                'Category does not match.'
            );
        }

        if (found.subject !== testMemory.subject) {
            throw new Error(
                'Subject does not match.'
            );
        }

        if (found.key !== testMemory.key) {
            throw new Error(
                'Key does not match.'
            );
        }

        if (found.trigger !== testMemory.trigger) {
            throw new Error(
                'Trigger does not match.'
            );
        }

        if (found.action !== testMemory.action) {
            throw new Error(
                'Action does not match.'
            );
        }

        if (found.context !== testMemory.context) {
            throw new Error(
                'Context does not match.'
            );
        }

        if (found.confidence !== testMemory.confidence) {
            throw new Error(
                'Confidence does not match.'
            );
        }

        if (
            !Array.isArray(found.topics) ||
            found.topics.length !== testMemory.topics.length
        ) {
            throw new Error(
                'Topics were not stored correctly.'
            );
        }

        for (const topic of testMemory.topics) {
            if (!found.topics.includes(topic)) {
                throw new Error(
                    `Missing topic: ${topic}`
                );
            }
        }

        console.log('✓ Stored data matches expected values');


        /**
         * ----------------------------------------------------
         * 5. VERIFY NON-EXISTENT IDENTITY
         * ----------------------------------------------------
         */

        const missing =
            await proceduralMemory.find(
                'test',
                'storage',
                'does_not_exist'
            );

        if (missing !== null) {
            throw new Error(
                'Non-existent procedure should return null.'
            );
        }

        console.log(
            '✓ Non-existent identity correctly returns null'
        );


        /**
         * ----------------------------------------------------
         * 6. VERIFY DUPLICATE PROTECTION
         * ----------------------------------------------------
         *
         * The database should reject another record with the
         * same category + subject + key.
         *
         * ----------------------------------------------------
         */

        let duplicateRejected = false;

        try {
            await proceduralMemory.addProcedure(
                testMemory
            );
        } catch (error) {
            duplicateRejected = true;

            console.log(
                '✓ Duplicate canonical identity rejected'
            );
        }

        if (!duplicateRejected) {
            throw new Error(
                'Duplicate canonical identity was accepted.'
            );
        }


        /**
         * ----------------------------------------------------
         * 7. GET ALL
         * ----------------------------------------------------
         */

        const all =
            await proceduralMemory.getAll();

        const matchingRecords =
            all.filter(memory =>
                memory.category === testMemory.category &&
                memory.subject === testMemory.subject &&
                memory.key === testMemory.key
            );

        if (matchingRecords.length !== 1) {
            throw new Error(
                `Expected exactly 1 test record, found ${matchingRecords.length}.`
            );
        }

        console.log(
            '✓ getAll() returns exactly one canonical record'
        );


        /**
         * ----------------------------------------------------
         * 8. CONTEXT STRING
         * ----------------------------------------------------
         */

        const contextString =
            await proceduralMemory.getContextString();

        if (
            !contextString.includes(
                '[test/storage/test_procedure]'
            )
        ) {
            throw new Error(
                'Context string does not contain canonical identity.'
            );
        }

        if (
            !contextString.includes(
                'when testing procedural storage'
            )
        ) {
            throw new Error(
                'Context string does not contain trigger.'
            );
        }

        if (
            !contextString.includes(
                'store the procedure correctly'
            )
        ) {
            throw new Error(
                'Context string does not contain action.'
            );
        }

        console.log(
            '✓ Context string contains procedural memory data'
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
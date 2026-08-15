require('dotenv').config({
    path: require('path').join(__dirname, '../.env')
});

const memoryExtractor =
    require('../src/memory/memoryExtractor');


/**
 * ============================================================
 * PROCEDURAL MEMORY EXTRACTOR TEST
 * ============================================================
 *
 * This test verifies that the memory extractor:
 *
 *   1. Detects explicit procedural instructions.
 *   2. Produces the new semantic layers.
 *   3. Produces transitional procedural fields.
 *   4. Distinguishes procedures from preferences.
 *   5. Distinguishes procedures from project facts.
 *   6. Does not create unrelated memories.
 *
 * This test intentionally does NOT verify canonicalization
 * equivalence across different phrasings.
 *
 * Canonicalization will be tested separately.
 *
 * ============================================================
 */


const testCases = [

    /**
     * --------------------------------------------------------
     * 1. EXPLICIT PROCEDURE
     * --------------------------------------------------------
     */

    {
        name: 'Explicit step-by-step explanation procedure',

        message:
            'Whenever you explain technical concepts to me, break them down step by step.',

        expectedCategory: 'procedure',

        requiredValueConcepts: [
            'step'
        ]
    },


    /**
     * --------------------------------------------------------
     * 2. SAME GENERAL PROCEDURE, DIFFERENT WORDING
     * --------------------------------------------------------
     *
     * We are NOT requiring the same canonical key yet.
     *
     * We only want to verify that the extractor still recognizes
     * this as procedural memory.
     * --------------------------------------------------------
     */

    {
        name: 'Alternative wording for procedural instruction',

        message:
            'When you are teaching me something complicated, explain it one step at a time.',

        expectedCategory: 'procedure',

        requiredValueTerms: [
            'step'
        ]
    },


    /**
     * --------------------------------------------------------
     * 3. RESPONSE FORMAT PROCEDURE
     * --------------------------------------------------------
     */

    {
        name: 'Bullet point response procedure',

        message:
            'From now on, use bullet points when giving me long explanations.',

        expectedCategory: 'procedure',

        requiredValueTerms: [
            'bullet'
        ]
    },


    /**
     * --------------------------------------------------------
     * 4. TROUBLESHOOTING PROCEDURE
     * --------------------------------------------------------
     */

    {
        name: 'Guided troubleshooting procedure',

        message:
            'When I ask you to troubleshoot something, walk through the problem with me instead of just dumping the solution.',

        expectedCategory: 'procedure',

        requiredValueTerms: [
            'troubleshoot',
            'walk'
        ]
    },


    /**
     * --------------------------------------------------------
     * 5. PREFERENCE — SHOULD NOT BECOME PROCEDURE
     * --------------------------------------------------------
     */

    {
        name: 'Simple preference',

        message:
            'I prefer bullet points.',

        expectedCategory: 'preference'
    },


    /**
     * --------------------------------------------------------
     * 6. PROJECT FACT — SHOULD NOT BECOME PROCEDURE
     * --------------------------------------------------------
     */

    {
        name: 'Project technology fact',

        message:
            'Atlas uses Supabase for its memory database.',

        expectedCategory: 'project'
    },


    /**
     * --------------------------------------------------------
     * 7. PROJECT BEHAVIOR — SHOULD NOT BECOME PROCEDURE
     * --------------------------------------------------------
     */

    {
        name: 'Project architecture behavior',

        message:
            'Atlas checks the project registry before allowing a project memory to be stored.',

        expectedCategory: 'project'
    },


    /**
     * --------------------------------------------------------
     * 8. NORMAL CONVERSATION — SHOULD PRODUCE NOTHING
     * --------------------------------------------------------
     */

    {
        name: 'Ordinary conversational statement',

        message:
            'That makes a lot more sense now.',

        expectedCategory: null
    }

];


function normalizeText(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return '';
    }

    return String(value)
        .trim()
        .toLowerCase();
}


function containsTerms(text, terms) {

    const normalized =
        normalizeText(text);

    return terms.every(term =>
        normalized.includes(
            normalizeText(term)
        )
    );
}


function validateProceduralStructure(memory) {

    const requiredFields = [
        'category',
        'subject',
        'topics',
        'key',
        'value',
        'trigger',
        'action',
        'context',
        'confidence'
    ];

    for (const field of requiredFields) {

        if (
            memory[field] === undefined ||
            memory[field] === null
        ) {
            throw new Error(
                `Procedural memory is missing required field: ${field}`
            );
        }
    }

    if (memory.category !== 'procedure') {
        throw new Error(
            `Expected category "procedure", got "${memory.category}".`
        );
    }

    if (
        typeof memory.subject !== 'string' ||
        !memory.subject.trim()
    ) {
        throw new Error(
            'Procedural subject must be a non-empty string.'
        );
    }

    if (
        !Array.isArray(memory.topics) ||
        memory.topics.length === 0
    ) {
        throw new Error(
            'Procedural topics must be a non-empty array.'
        );
    }

    if (
        typeof memory.key !== 'string' ||
        !memory.key.trim()
    ) {
        throw new Error(
            'Procedural key must be a non-empty string.'
        );
    }

    if (
        typeof memory.value !== 'string' ||
        !memory.value.trim()
    ) {
        throw new Error(
            'Procedural value must be a non-empty string.'
        );
    }

    if (
        typeof memory.trigger !== 'string' ||
        !memory.trigger.trim()
    ) {
        throw new Error(
            'Procedural trigger must be a non-empty string.'
        );
    }

    if (
        typeof memory.action !== 'string' ||
        !memory.action.trim()
    ) {
        throw new Error(
            'Procedural action must be a non-empty string.'
        );
    }

    if (
        typeof memory.context !== 'string' ||
        !memory.context.trim()
    ) {
        throw new Error(
            'Procedural context must be a non-empty string.'
        );
    }

    if (
        typeof memory.confidence !== 'number' ||
        memory.confidence < 0 ||
        memory.confidence > 1
    ) {
        throw new Error(
            'Procedural confidence must be a number between 0 and 1.'
        );
    }
}


async function runTest() {

    console.log('\n========================================');
    console.log('Procedural Memory Extractor Test');
    console.log('========================================\n');

    let passed = 0;

    for (const testCase of testCases) {

        console.log(
            `\n→ ${testCase.name}`
        );

        console.log(
            `  Message: "${testCase.message}"`
        );

        try {

            const result =
                await memoryExtractor.extractMemory(
                    testCase.message
                );

            if (
                !result ||
                !Array.isArray(result.memories)
            ) {
                throw new Error(
                    'Extractor did not return a memories array.'
                );
            }


            /**
             * ------------------------------------------------
             * NO MEMORY EXPECTED
             * ------------------------------------------------
             */

            if (testCase.expectedCategory === null) {

                if (result.memories.length !== 0) {
                    throw new Error(
                        `Expected no memories, but extractor returned: ${JSON.stringify(result.memories)}`
                    );
                }

                console.log(
                    '  ✓ No memory correctly extracted'
                );

                passed++;
                continue;
            }


            /**
             * ------------------------------------------------
             * FIND EXPECTED CATEGORY
             * ------------------------------------------------
             */

            const memory =
                result.memories.find(
                    item =>
                        item &&
                        item.category ===
                            testCase.expectedCategory
                );

            if (!memory) {

                throw new Error(
                    `Expected category "${testCase.expectedCategory}" but received: ${JSON.stringify(result.memories)}`
                );
            }


            /**
             * ------------------------------------------------
             * PROCEDURAL STRUCTURE
             * ------------------------------------------------
             */

            if (
                testCase.expectedCategory ===
                'procedure'
            ) {

                validateProceduralStructure(
                    memory
                );

                if (
                    testCase.requiredValueTerms &&
                    !containsTerms(
                        memory.value,
                        testCase.requiredValueTerms
                    )
                ) {
                    throw new Error(
                        `Procedural value does not contain expected terms: ${testCase.requiredValueTerms.join(', ')}. Got: "${memory.value}"`
                    );
                }

                console.log(
                    '  ✓ Procedural semantic structure is valid'
                );

                console.log(
                    `  ✓ subject: ${memory.subject}`
                );

                console.log(
                    `  ✓ key: ${memory.key}`
                );

                console.log(
                    `  ✓ value: ${memory.value}`
                );

                console.log(
                    `  ✓ trigger: ${memory.trigger}`
                );

                console.log(
                    `  ✓ action: ${memory.action}`
                );

                console.log(
                    `  ✓ context: ${memory.context}`
                );
            }

            else {

                console.log(
                    `  ✓ Correctly classified as ${memory.category}`
                );
            }

            passed++;

        } catch (error) {

            console.error(
                `  ✗ FAILED: ${error.message}`
            );

            throw error;
        }
    }


    /**
     * --------------------------------------------------------
     * SUCCESS
     * --------------------------------------------------------
     */

    console.log('\n========================================');
    console.log(
        `ALL TESTS PASSED ✓ (${passed}/${testCases.length})`
    );
    console.log('========================================\n');
}


runTest().catch(error => {

    console.error('\n========================================');
    console.error('TEST FAILED ✗');
    console.error('========================================\n');

    console.error(
        error.message
    );

    process.exitCode = 1;
});
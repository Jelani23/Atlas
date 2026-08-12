// backend/src/core/hotSwapManager.js
require('dotenv').config();

const memoryCache = require('./memoryCache');

/**
 * Build a stable identity for the current conversational context.
 *
 * The key represents the user's current WORKING CONTEXT,
 * not every tiny change in the conversation.
 *
 * Project changes should cause a swap.
 * Task changes should cause a swap.
 * Topic changes alone should generally not.
 */
function buildHotCacheKey({
    activeProject = null,
    currentTask = null
} = {}) {
    const project = activeProject
        ? String(activeProject).trim().toLowerCase()
        : 'none';

    const task = currentTask
        ? String(currentTask).trim().toLowerCase()
        : 'none';

    return `${project}::${task}`;
}

/**
 * Determine whether the current hot cache still represents
 * the user's active working context.
 */
function isContextHot(context = {}) {
    const cacheKey = buildHotCacheKey(context);

    return {
        valid: memoryCache.isHotCacheValid(cacheKey),
        cacheKey
    };
}

/**
 * Replace the hot context identity.
 *
 * Actual memory population is handled separately by ContextManager.
 */
function activateContext(context = {}) {
    const cacheKey = buildHotCacheKey(context);

    memoryCache.setHotState('activeProject', context.activeProject || null);
    memoryCache.setHotState('currentTask', context.currentTask || null);

    if (context.activeFiles !== undefined) {
        memoryCache.setHotState(
            'activeFiles',
            Array.isArray(context.activeFiles)
                ? [...context.activeFiles]
                : []
        );
    }

    memoryCache.setHotState('cacheKey', cacheKey);

    return cacheKey;
}

// Clear the current hot memory contents and establish a new working context.
function swapContext(context = {}) {
    const cacheKey = activateContext(context);

    memoryCache.setHotMemory('user_profile', []);
    memoryCache.setHotMemory('project_memory', []);
    memoryCache.setHotMemory('knowledge_library', []);
    memoryCache.setHotMemory('procedural_memory', []);
    memoryCache.setHotMemory('dev_state', []);

    console.log(
        `[HotSwap] 🔄 Context swapped → ${cacheKey}`
    );

    return cacheKey;
}

if (require.main === module) {
    console.log('\n=== Hot Swap Manager Test ===\n');

    const contextA = {
        activeProject: 'Atlas',
        currentTask: 'Memory overhaul'
    };

    const contextB = {
        activeProject: 'Atlas',
        currentTask: 'Memory overhaul'
    };

    const contextC = {
        activeProject: 'Atlas',
        currentTask: 'TTS system'
    };

    const contextD = {
        activeProject: 'Bindex',
        currentTask: 'Pricing system'
    };

    console.log('A:', buildHotCacheKey(contextA));
    console.log('B:', buildHotCacheKey(contextB));
    console.log('C:', buildHotCacheKey(contextC));
    console.log('D:', buildHotCacheKey(contextD));

    console.log(
        '\nA === B:',
        buildHotCacheKey(contextA) === buildHotCacheKey(contextB)
    );

    console.log(
        'A === C:',
        buildHotCacheKey(contextA) === buildHotCacheKey(contextC)
    );

    console.log(
        'A === D:',
        buildHotCacheKey(contextA) === buildHotCacheKey(contextD)
    );

    console.log('\n=== End Test ===\n');
}

module.exports = {
    buildHotCacheKey,
    isContextHot,
    activateContext,
    swapContext
};
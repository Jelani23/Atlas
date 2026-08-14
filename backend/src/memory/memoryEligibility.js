// backend/src/memory/memoryEligibility.js

const projectRegistry = require('./projectRegistry');

const SIGNALS = {
    explicit_memory: {
        weight: 5,
        phrases: [
            'remember',
            "don't forget",
            'keep in mind',
            'from now on',
            'note that',
            'make a note',
            'save this',
            'remember this',
            'keep this in mind'
        ]
    },

    identity: {
        weight: 5,
        phrases: [
            'my name',
            'i live',
            'my birthday',
            'i am',
            "i'm",
            'my favorite',
            'i usually',
            'i always',
            'i never',
            'i was born',
            'my job',
            'my occupation',
            'i work',
            'i study'
        ]
    },

    preference: {
        weight: 4,
        phrases: [
            'i prefer',
            'i like',
            'i hate',
            'i love',
            'i enjoy',
            'i dislike',
            'i want',
            "i don't like",
            "i don't want",
            'i would rather',
            'i would prefer',
            'my preference',
            'my preferred'
        ]
    },

    state_change: {
        weight: 4,
        phrases: [
            'currently',
            'right now',
            "i'm working on",
            "we're working on",
            'switch to',
            'move to',
            'go back to',
            'the current',
            "we're on",
            'we are on',
            'working on',
            'moved to',
            'switched to',
            'went back to',
            'no longer working on',
            'finished working on',
            'done with'
        ]
    },

    decision: {
        weight: 4,
        phrases: [
            "let's use",
            "we'll use",
            'we decided',
            'i decided',
            "let's go with",
            'the plan is',
            "we're going to",
            'we are going to',
            'we chose',
            'we choose',
            'the decision is',
            'we settled on',
            'we agreed on',
            'we should use',
            'we should go with'
        ]
    },

    project_reference: {
        weight: 2,
        phrases: [
            'project',
            'app',
            'application',
            'repository',
            'repo',
            'codebase',
            'system',
            'website',
            'platform'
        ]
    },

    project_fact: {
        weight: 3,
        phrases: [
            'uses',
            'requires',
            'supports',
            'includes',
            'has',
            'connects to',
            'connects with',
            'is built with',
            'is built using',
            'depends on',
            'runs on',
            'works with',
            'is powered by',
            'is based on',
            'is implemented with',
            'is implemented using',
            'is configured with',
            'is configured to',
            'is designed to',
            'is intended to',
            'allows',
            'lets users',
            'lets you',
            'provides',
            'contains',
            'stores',
            'uses',
            'handles',
            'processes',
            'communicates with',

            // Structural / ownership / location relationships
            'manages',
            'controls',
            'performs',
            'runs',
            'builds',
            'creates',
            'updates',
            'retrieves',
            'loads',
            'saves',
            'lives',
            'is located',
            'is found',
            'can be found',
            'is responsible for',
            'consists of',
            'is made up of',
            'integrates with',
            'integrates into',
            'relies on',
            'requires the use of',
            'needs',
            'needs to',
            'you need to',
            'you have to',
            'must',
            'can only',
            'cannot',
            'can not',
            'does not allow',
            'only allows',
            'is required',
            'is necessary',
            'is needed',

            // Observation / report structures
            'shows',
            'show',
            'confirms',
            'confirm',
            'indicates',
            'indicate',
            'reveals',
            'reveal',
            'reports',
            'report',
            'demonstrates',
            'demonstrate',

            // Project observation subjects
            'logs',
            'tests',
            'test results',
            'test output',
            'console output',
            'results',
            'performance report',
            'benchmark',
            'benchmarks',
            'metrics'
        ]
    }
};

const THRESHOLD = 4;

/**
 * Get registered project names and aliases dynamically.
 * This prevents the eligibility system from needing hard-coded
 * project names.
 */
async function getRegisteredProjectNames() {
    try {
        const projects = await projectRegistry.getAllProjects();

        const names = [];

        for (const project of projects) {
            if (project.name) {
                names.push(String(project.name).toLowerCase());
            }

            if (project.project_key) {
                names.push(String(project.project_key).toLowerCase());
            }

            if (Array.isArray(project.aliases)) {
                for (const alias of project.aliases) {
                    if (alias) {
                        names.push(String(alias).toLowerCase());
                    }
                }
            }
        }

        return [...new Set(names)];
    } catch (error) {
        console.error(
            '[MemoryEligibility] Failed to load registered projects:',
            error.message
        );

        return [];
    }
}

async function checkEligibility(message) {
    if (!message) {
        return {
            eligible: false,
            score: 0,
            reason: 'Empty message',
            matchedSignals: []
        };
    }

    const lowerMsg = message.toLowerCase();
    let score = 0;
    const matchedSignals = [];

    for (const [signalName, config] of Object.entries(SIGNALS)) {
        for (const phrase of config.phrases) {
            if (lowerMsg.includes(phrase)) {
                score += config.weight;
                matchedSignals.push(signalName);
                break;
            }
        }
    }

    // Dynamically detect references to registered projects.
    const registeredProjects = await getRegisteredProjectNames();

    const matchedProject = registeredProjects.find(projectName => {
        if (!projectName) return false;

        const escaped = projectName.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
        );

        return new RegExp(`\\b${escaped}\\b`, 'i').test(message);
    });

    if (matchedProject) {
        score += SIGNALS.project_reference.weight;
        matchedSignals.push('registered_project_reference');
    }

    // Project facts become much stronger when they reference an actual
    // registered project.
    const hasProjectFact = SIGNALS.project_fact.phrases.some(
        phrase => lowerMsg.includes(phrase)
    );

    const hasStrongProjectFact =
        matchedProject &&
        [
            'uses',
            'requires',
            'supports',
            'includes',
            'has',
            'depends on',
            'runs on',
            'works with',
            'relies on',
            'is configured with',
            'is configured to',
            'is built with',
            'is built using',
            'is implemented with',
            'is implemented using',
            'is responsible for',
            'consists of',
            'is made up of',
            'can be found',
            'is located'
        ].some(phrase => lowerMsg.includes(phrase));

    if (matchedProject && hasStrongProjectFact) {
        score += 2;
        matchedSignals.push('project_fact_combination');
    }

    // Questions are normally not memories unless they contain a very
    // strong explicit-memory signal.
    if (
        lowerMsg.includes('?') &&
        score < 8 &&
        !matchedSignals.includes('explicit_memory')
    ) {
        return {
            eligible: false,
            score,
            reason: 'Question (below high-confidence threshold)',
            matchedSignals
        };
    }

    const eligible = score >= THRESHOLD;

    return {
        eligible,
        score,
        reason: eligible
            ? 'Matched memory signals'
            : 'Below threshold',
        matchedSignals,
        projectReference: matchedProject || null
    };
}

module.exports = {
    checkEligibility
};
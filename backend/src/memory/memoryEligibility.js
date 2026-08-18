// backend/src/memory/memoryEligibility.js

const projectRegistry = require('./projectRegistry');
const { PROCEDURAL_FACT_PATTERNS } = require('./deterministicExtractor');

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

    // Procedural instructions - the user teaching Alice a standing rule
    // for how to behave, reason, format, or interact. Previously there
    // was no signal category for this at all, so anything short of
    // hitting "remember" / "from now on" (explicit_memory) or an
    // "i always" / "i never" identity phrase never reached the
    // threshold, and true procedural teaching moments were silently
    // dropped before they ever reached the extractor.
    procedural_instruction: {
        weight: 5,
        phrases: [
            'whenever you',
            'whenever i ask',
            'any time you',
            'any time i ask',
            'every time you',
            'every time i ask',
            'when you explain',
            'when explaining',
            'when responding',
            'when answering',
            'when writing code',
            'when giving me',
            'when helping me',
            'when i ask',
            'when you ask',
            'next time',
            'going forward',
            'from here on',
            'from here on out',
            'you should always',
            'you should never',
            'can you always',
            'can you never',
            'could you always',
            'could you never',
            'please always',
            'please never',
            'make sure to always',
            'make sure you always',
            "don't ever",
            'do not ever',
            'never again'
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
    },

    // General knowledge/world facts - "The Pacific Ocean is the
    // largest ocean on Earth.", "Python was created by Guido van
    // Rossum." These have no fixed lead-in phrase at all (unlike
    // project_fact, which is anchored to a registered project, or
    // procedural_instruction's "you should"/"whenever you" framing),
    // so a phrase list can't cover this the way it does for the
    // other signals - see isDeclarativeFactCandidate below, checked
    // structurally rather than by phrase. weight is intentionally
    // present here (used via SIGNALS.declarative_fact.weight) even
    // though `phrases` stays empty, so this signal is scored,
    // referenced, and documented the same way every other one is.
    declarative_fact: {
        weight: 4,
        phrases: []
    },

    // Hedged/uncertain claims - "I suspect this API uses OAuth.",
    // "I believe the deploy happens on push." These are first-person,
    // so isDeclarativeFactCandidate below deliberately excludes them
    // (to avoid overlapping with identity/preference and to reduce
    // false positives from ordinary "I ..." chit-chat) - but a hedge
    // marker is a much more specific, low-false-positive-risk signal
    // than a bare first-person opener, and per the plan (§17 Test G)
    // this is exactly the case that must reach extraction so it can
    // be stored as type: "assumption" rather than silently dropped
    // or, worse, silently upgraded to an unhedged fact.
    hedged_claim: {
        weight: 4,
        phrases: [
            'i suspect',
            'i believe',
            'i think that',
            'i assume',
            "i'm guessing",
            'my guess is',
            "it's possible that",
            'presumably'
        ]
    }
};

const THRESHOLD = 4;

function containsPhrase(message, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(
        `\\b${escaped.replace(/\s+/g, '\\s+')}\\b`,
        'i'
    ).test(message);
}

// A general third-person declarative statement with a copula or
// strong assertive verb - "X is/are/was/were/has Y" - is the
// structural shape of a factual claim, independent of subject
// matter. This is deliberately structural (not a phrase list) for
// the same reason the procedural-pattern check above is: a hand-
// maintained list of "knowledge sentence starters" would need to be
// extended forever, one missed phrasing at a time, exactly the
// pattern that kept recurring for procedural instructions before
// that was fixed the same way.
//
// This is intentionally permissive - over-triggering here only means
// an extra (fast, schema-constrained) LLM classification call that
// correctly returns "no memory" for ordinary chit-chat; the actual
// precision gate is the classifier and deduplication downstream, not
// this pre-filter.
const DECLARATIVE_LEAD_PRONOUNS =
    /^(i|you|we|my|your|our|it|that|this|he|she|they)\b/i;

// Greeting interjections are never the subject of a factual claim -
// without this, casual openers like "Hey how are you doing today"
// score as a declarative fact purely because "are" appears in them
// (a real copula, just not asserting anything about "Hey"). The
// question-mark gate further down only catches this when the
// message actually ends in "?" - plenty of casual speech doesn't
// bother.
const DECLARATIVE_LEAD_GREETING =
    /^(hey|hi|hello|yo|hiya|sup|howdy)\b/i;

const DECLARATIVE_VERBS =
    /\b(is|are|was|were|has|have|consists of|refers to|orbits|originated|was discovered|was invented|was founded|was created)\b/i;

function isDeclarativeFactCandidate(message) {
    const trimmed = message.trim();

    // Needs to look like an actual statement, not a fragment,
    // greeting, or short command.
    if (trimmed.split(/\s+/).filter(Boolean).length < 4) {
        return false;
    }

    // Starts with a capitalized subject - not a pronoun, which is
    // either already covered by identity/preference ("I"/"my") or
    // too generic on its own ("It is...", "That was...") to be a
    // reliable factual-claim signal by itself.
    if (!/^[A-Z]/.test(trimmed)) {
        return false;
    }

    if (DECLARATIVE_LEAD_PRONOUNS.test(trimmed)) {
        return false;
    }

    if (DECLARATIVE_LEAD_GREETING.test(trimmed)) {
        return false;
    }

    return DECLARATIVE_VERBS.test(trimmed);
}

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
            if (containsPhrase(message, phrase)) {
                score += config.weight;
                matchedSignals.push(signalName);
                break;
            }
        }
    }

    // The phrase list above only catches procedural instructions with
    // a recognizable lead-in ("you should always", "please never",
    // "when you explain"...). Anything the deterministic extractor's
    // own fast-path patterns recognize must ALSO be eligible here, or
    // that pattern's most natural input never reaches extraction at
    // all - e.g. a bare imperative like "Always double check file
    // paths before editing." has no lead-in phrase to match, even
    // though it's exactly what the always_when/imperative_obligation
    // patterns are built to catch. Checking the real patterns here,
    // instead of hand-maintaining a second phrase list that has to be
    // kept in sync with them, means eligibility can't silently drift
    // out of sync with what extraction can actually catch again.
    if (!matchedSignals.includes('procedural_instruction')) {
        const matchesProceduralPattern = PROCEDURAL_FACT_PATTERNS.some(
            pattern => {
                try {
                    return pattern.match(message) !== null;
                } catch (error) {
                    return false;
                }
            }
        );

        if (matchesProceduralPattern) {
            score += SIGNALS.procedural_instruction.weight;
            matchedSignals.push('procedural_instruction');
        }
    }

    // General factual/knowledge statements ("The Pacific Ocean is
    // the largest ocean on Earth.") have no dedicated phrase list -
    // see isDeclarativeFactCandidate's comment for why. Without this,
    // knowledge memories could never reach the extractor at all: none
    // of the signals above are about third-person world facts.
    if (isDeclarativeFactCandidate(message)) {
        score += SIGNALS.declarative_fact.weight;
        matchedSignals.push('declarative_fact');
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
        phrase => containsPhrase(message, phrase)
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
        ].some(phrase => containsPhrase(message, phrase));

    if (matchedProject && hasStrongProjectFact) {
        score += 2;
        matchedSignals.push('project_fact_combination');
    }

    // Questions are normally not memories unless they contain a very
    // strong explicit-memory or procedural-instruction signal (e.g.
    // "can you always ask before deleting a file?" is a procedural
    // teaching moment despite the trailing question mark).
    if (
        lowerMsg.includes('?') &&
        score < 8 &&
        !matchedSignals.includes('explicit_memory') &&
        !matchedSignals.includes('procedural_instruction')
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
const projectResolver = require('./projectResolver');

/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

function normalizeProjectName(name) {
    if (!name) return '';

    return name
        .trim()
        .replace(/[.!?,]+$/, '')
        .replace(/\s+(now|right now|currently|again|today)$/i, '')
        .replace(/\s+(project)$/i, '')
        .trim();
}

function normalizeMemoryValue(value) {
    if (!value) return '';

    return value
        .replace(/[.!?]+$/, '')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeMemoryKey(value) {
    if (!value) return '';

    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s_-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_');
}

function normalizeSemanticDomain(domain) {
    if (!domain) return '';

    return normalizeMemoryValue(domain)
        .toLowerCase();
}

/**
 * ============================================================
 * PROJECT FACT PATTERN FAMILIES
 * ============================================================
 *
 * IMPORTANT:
 *
 * These patterns recognize LANGUAGE STRUCTURE only.
 *
 * They should NOT contain semantic dictionaries such as:
 *
 *   "database" -> database
 *   "model" -> models
 *   "auth" -> authentication
 *
 * Semantic interpretation belongs to semanticEnricher.js.
 *
 * If a new linguistic edge case is discovered, add a pattern
 * family here rather than adding semantic aliases elsewhere.
 *
 * Each pattern should return:
 *
 *   {
 *       projectName,
 *       value,
 *       domain,
 *       key
 *   }
 *
 * or null when the pattern does not match.
 *
 * ============================================================
 */

const PROJECT_FACT_PATTERNS = [

    /**
     * --------------------------------------------------------
     * NESTED PROJECT RELATIONSHIP
     *
     * The memory system inside Atlas uses a project memory cache
     * The context manager within Atlas requires Redis
     * The voice pipeline in Atlas uses Whisper
     *
     * The project is embedded inside a larger noun phrase rather
     * than appearing as the grammatical subject.
     * --------------------------------------------------------
     */
    {
        name: 'nested_relationship',
        match(message) {
            const match = message.match(
                /^(?:the\s+)?(.+?)\s+(?:inside|within|in)\s+(?:the\s+)?(.+?)(?:\s+project)?\s*,?\s+(uses|requires|supports|includes|has|connects to|connects with|is built with|is built using|depends on|runs on|works with|relies on)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) return null;

            const component = normalizeMemoryValue(match[1]);
            const projectName = normalizeProjectName(match[2]);
            const verb = match[3].toLowerCase().trim();
            const rawValue = normalizeMemoryValue(match[4]);

            if (!component || !projectName || !rawValue) {
                return null;
            }

            const identity = extractRelationshipIdentity(
                rawValue,
                verb
            );

            return {
                projectName,
                value: `${component} ${verb} ${identity.value}`,
                domain: component,
                key: normalizeMemoryKey(component)
            };
        }
    },

        /**
     * --------------------------------------------------------
     * OBSERVATION WRAPPER
     *
     * One thing I learned about Atlas is that...
     * What I found in Atlas is that...
     * Looking through Atlas's code, I found that...
     * While inspecting Atlas, I found that...
     * After testing Atlas, I found that...
     *
     * These sentences contain a project fact inside an
     * observational wrapper. Strip the wrapper, then run
     * the remaining clause through the existing fact patterns.
     * --------------------------------------------------------
     */
    {
        name: 'observation_wrapper',
        match(message) {

            let match = message.match(
                /^(?:one thing i learned about|something i learned about|what i found in|what i discovered in|what i noticed in|what i observed in|while inspecting|while looking through|looking through|after testing|after inspecting|after reviewing)\s+(?:the\s+)?(.+?)(?:['’]s)?(?:\s+code|\s+project|\s+system)?\s*(?:is that|was that|,?\s*i found that|,?\s*i discovered that|,?\s*i noticed that|,?\s*i observed that|,?\s*i learned that)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) {
                return null;
            }

            const projectName = normalizeProjectName(match[1]);
            const fact = normalizeMemoryValue(match[2]);

            if (!projectName || !fact) {
                return null;
            }

            return {
                projectName,
                value: fact,
                domain: null,
                key: normalizeMemoryKey(fact)
            };
        }
    },

    /**
     * --------------------------------------------------------
     * RELATIONSHIP
     *
     * Atlas uses Supabase for memory
     * Atlas requires Node
     * Atlas supports voice input
     * Atlas includes a planner
     * Atlas has a memory cache
     * Atlas connects to Ollama
     * Atlas depends on Supabase
     * --------------------------------------------------------
     */
    {
        name: 'relationship',
        match(message) {
            const match = message.match(
                /^(?:(?:for|regarding|about|in)\s+)?(?:the\s+)?(.+?)(?:\s+project)?\s*,?\s+(uses|requires|supports|includes|has|connects to|connects with|is built with|is built using|depends on|runs on|works with|relies on)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) return null;

            const projectName = normalizeProjectName(match[1]);
            const verb = match[2].toLowerCase().trim();
            const rawValue = normalizeMemoryValue(match[3]);

            if (!projectName || !rawValue) {
                return null;
            }

            const identity = extractRelationshipIdentity(
                rawValue,
                verb
            );

            return {
                projectName,
                value: identity.value,
                domain: identity.domain,
                key: identity.key
            };
        }
    },

    /**
     * --------------------------------------------------------
     * POSSESSION
     *
     * Atlas has a planner
     * Atlas contains a memory system
     * Atlas includes a project registry
     *
     * This is intentionally separate from the relationship
     * family so it can be expanded independently later.
     * --------------------------------------------------------
     */
    {
        name: 'possession',
        match(message) {
            const match = message.match(
                /^(?:the\s+)?(.+?)(?:\s+project)?\s+(?:has|contains|includes)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) return null;

            const projectName = normalizeProjectName(match[1]);
            const value = normalizeMemoryValue(match[2]);

            if (!projectName || !value) {
                return null;
            }

            return {
                projectName,
                value,
                domain: null,
                key: normalizeMemoryKey(value)
            };
        }
    },

    /**
     * --------------------------------------------------------
     * OWNERSHIP / COMPONENT
     *
     * Atlas's planner handles task normalization
     * Atlas's memory manager controls deduplication
     * --------------------------------------------------------
     */
    {
        name: 'ownership',
        match(message) {
            const match = message.match(
                /^(?:the\s+)?(.+?)['’]s\s+(.+?)\s+(handles|manages|controls|performs|runs|processes|stores|builds|creates|updates|retrieves|loads|saves)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) return null;

            const projectName = normalizeProjectName(match[1]);
            const component = normalizeMemoryValue(match[2]);
            const action = match[3].toLowerCase().trim();
            const target = normalizeMemoryValue(match[4]);

            if (!projectName || !component || !target) {
                return null;
            }

            return {
                projectName,
                value: `${component} ${action} ${target}`,
                domain: component,
                key: normalizeMemoryKey(component)
            };
        }
    },

    /**
     * --------------------------------------------------------
     * LOCATION / CONTAINMENT
     *
     * Inside Atlas, the memory manager is in src/memory
     * In Atlas, memoryExtractor.js is located in src/memory
     * Atlas's context manager is located in src/core
     * --------------------------------------------------------
     */
    {
        name: 'location',
        match(message) {
            let match = message.match(
                /^(?:inside|within|in)\s+(?:the\s+)?(.+?)(?:\s+project)?\s*,\s*(.+?)\s+(?:is\s+)?(?:located|found|living|lives)\s+(?:in|under|inside)\s+(.+?)(?:[.!?]|$)/i
            );

            if (match) {
                const projectName = normalizeProjectName(match[1]);
                const component = normalizeMemoryValue(match[2]);
                const location = normalizeMemoryValue(match[3]);

                if (projectName && component && location) {
                    return {
                        projectName,
                        value: `${component} is located in ${location}`,
                        domain: 'files',
                        key: normalizeMemoryKey(component)
                    };
                }
            }

            match = message.match(
                /^(?:the\s+)?(.+?)['’]s\s+(.+?)\s+(?:is\s+)?(?:located|found|living|lives)\s+(?:in|under|inside)\s+(.+?)(?:[.!?]|$)/i
            );

            if (match) {
                const projectName = normalizeProjectName(match[1]);
                const component = normalizeMemoryValue(match[2]);
                const location = normalizeMemoryValue(match[3]);

                if (projectName && component && location) {
                    return {
                        projectName,
                        value: `${component} is located in ${location}`,
                        domain: 'files',
                        key: normalizeMemoryKey(component)
                    };
                }
            }

            return null;
        }
    },

    /**
     * --------------------------------------------------------
     * OBSERVATION / EVIDENCE
     *
     * Atlas's logs show...
     * Atlas's tests show...
     * The logs for Atlas show...
     * The test output confirms...
     * --------------------------------------------------------
     */
    {
        name: 'observation',
        match(message) {

            /**
             * ------------------------------------------------
             * PROJECT'S EVIDENCE / REPORT
             *
             * Atlas's logs show that...
             * Atlas's tests confirm that...
             * Atlas's performance report shows that...
             * Atlas's benchmark results indicate that...
             * ------------------------------------------------
             */
            let match = message.match(
                /^(?:the\s+)?(.+?)['’]s\s+(logs|tests|test results|output|console output|results|performance report|benchmark results|reports?)\s+(show|shows|confirm|confirms|indicate|indicates|reveal|reveals)\s+(?:that\s+)?(.+?)(?:[.!?]|$)/i
            );

            if (match) {
                const projectName = normalizeProjectName(match[1]);
                const evidence = normalizeMemoryValue(match[2]);
                const verb = normalizeMemoryValue(match[3]);
                const result = normalizeMemoryValue(match[4]);

                if (projectName && evidence && result) {
                    return {
                        projectName,
                        value: `${evidence} ${verb} ${result}`,
                        domain: evidence,
                        key: normalizeMemoryKey(`${evidence}_${result}`)
                    };
                }
            }

            /**
             * ------------------------------------------------
             * EVIDENCE FOR PROJECT
             *
             * The logs for Atlas show that...
             * The tests for Atlas confirm that...
             * Test results from Atlas indicate that...
             * ------------------------------------------------
             */
            match = message.match(
                /^(?:the\s+)?(logs|tests|test results|output|console output|results|performance report|benchmark results|reports?)\s+(?:for|from|of)\s+(.+?)\s+(show|shows|confirm|confirms|indicate|indicates|reveal|reveals)\s+(?:that\s+)?(.+?)(?:[.!?]|$)/i
            );

            if (match) {
                const evidence = normalizeMemoryValue(match[1]);
                const projectName = normalizeProjectName(match[2]);
                const verb = normalizeMemoryValue(match[3]);
                const result = normalizeMemoryValue(match[4]);

                if (projectName && evidence && result) {
                    return {
                        projectName,
                        value: `${evidence} ${verb} ${result}`,
                        domain: evidence,
                        key: normalizeMemoryKey(`${evidence}_${result}`)
                    };
                }
            }

            return null;
        }
    },

    /**
     * --------------------------------------------------------
     * CAUSATION
     *
     * Because of X, Atlas does Y
     * Atlas does Y because X
     * X happens because Atlas does Y
     *
     * This is deliberately its own family because the causal
     * relationship itself is meaningful information.
     * --------------------------------------------------------
     */
    {
        name: 'causation',
        match(message) {
            let match = message.match(
                /^because\s+of\s+(.+?),\s*(?:the\s+)?(.+?)(?:\s+project)?\s+(.+?)(?:[.!?]|$)/i
            );

            if (match) {
                const cause = normalizeMemoryValue(match[1]);
                const projectName = normalizeProjectName(match[2]);
                const effect = normalizeMemoryValue(match[3]);

                if (projectName && cause && effect) {
                    return {
                        projectName,
                        value: `Because of ${cause}, ${effect}`,
                        domain: 'causation',
                        key: normalizeMemoryKey(effect)
                    };
                }
            }

            match = message.match(
                /^(?:the\s+)?(.+?)(?:\s+project)?\s+(.+?)\s+because\s+(.+?)(?:[.!?]|$)/i
            );

            if (match) {
                const projectName = normalizeProjectName(match[1]);
                const effect = normalizeMemoryValue(match[2]);
                const cause = normalizeMemoryValue(match[3]);

                if (projectName && effect && cause) {
                    return {
                        projectName,
                        value: `${effect} because ${cause}`,
                        domain: 'causation',
                        key: normalizeMemoryKey(effect)
                    };
                }
            }

            return null;
        }
    },

    /**
     * --------------------------------------------------------
     * CAPABILITY
     *
     * Atlas can...
     * Atlas cannot...
     * Atlas is able to...
     * Atlas is unable to...
     * --------------------------------------------------------
     */
    {
        name: 'capability',
        match(message) {
            const match = message.match(
                /^(?:the\s+)?(.+?)(?:\s+project)?\s+(can|cannot|can't|is able to|is unable to)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) return null;

            const projectName = normalizeProjectName(match[1]);
            const capability = normalizeMemoryValue(match[3]);
            const mode = match[2].toLowerCase();

            if (!projectName || !capability) {
                return null;
            }

            return {
                projectName,
                value: `${mode} ${capability}`,
                domain: 'capability',
                key: normalizeMemoryKey(capability)
            };
        }
    },

    /**
     * --------------------------------------------------------
     * CONFIGURATION
     *
     * Atlas is configured to use...
     * Atlas is configured with...
     * Atlas is set up to...
     * --------------------------------------------------------
     */
    {
        name: 'configuration',
        match(message) {
            const match = message.match(
                /^(?:the\s+)?(.+?)(?:\s+project)?\s+(?:is configured to|is configured with|is set up to|is set up with)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) return null;

            const projectName = normalizeProjectName(match[1]);
            const configuration = normalizeMemoryValue(match[2]);

            if (!projectName || !configuration) {
                return null;
            }

            return {
                projectName,
                value: configuration,
                domain: 'configuration',
                key: normalizeMemoryKey(configuration)
            };
        }
    },

    /**
     * --------------------------------------------------------
     * DESCRIPTIVE / STRUCTURAL
     *
     * The memory manager handles deduplication
     * The planner is responsible for normalization
     * Atlas's architecture consists of...
     * --------------------------------------------------------
     */
    {
        name: 'structural',
        match(message) {
            let match = message.match(
                /^(?:the\s+)?(.+?)(?:\s+project)?['’]s?\s+(.+?)\s+(handles|manages|controls|is responsible for|consists of|is made up of|contains)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) return null;

            const projectName = normalizeProjectName(match[1]);
            const component = normalizeMemoryValue(match[2]);
            const relationship = normalizeMemoryValue(match[3]);
            const target = normalizeMemoryValue(match[4]);

            if (!projectName || !component || !target) {
                return null;
            }

            return {
                projectName,
                value: `${component} ${relationship} ${target}`,
                domain: component,
                key: normalizeMemoryKey(component)
            };
        }
    },

    /**
     * --------------------------------------------------------
     * FILE / CODE REFERENCES
     *
     * memoryManager.js handles...
     * src/memory/memoryExtractor.js performs...
     * --------------------------------------------------------
     */
    {
        name: 'code_reference',
        match(message) {
            const match = message.match(
                /^(?:the\s+)?([a-zA-Z0-9_./\\-]+\.(?:js|ts|jsx|tsx|py|json|sql|md|css|html))\s+(handles|manages|controls|performs|runs|processes|stores|builds|creates|updates|retrieves|loads|saves)\s+(.+?)(?:[.!?]|$)/i
            );

            if (!match) return null;

            const file = normalizeMemoryValue(match[1]);
            const action = normalizeMemoryValue(match[2]);
            const target = normalizeMemoryValue(match[3]);

            if (!file || !target) {
                return null;
            }

            return {
                projectName: null,
                value: `${file} ${action} ${target}`,
                domain: 'files',
                key: normalizeMemoryKey(file)
            };
        }
    }
];

/**
 * ============================================================
 * RELATIONSHIP IDENTITY
 * ============================================================
 *
 * This handles grammatical structures such as:
 *
 *   uses Supabase for memory
 *   uses Supabase as the database
 *   uses SQLite to store project data
 *
 * It does NOT decide what "memory" means semantically.
 */

function extractRelationshipIdentity(rawValue, factVerb) {
    const normalized = normalizeMemoryValue(rawValue);

    if (factVerb === 'uses') {

        const forMatch = normalized.match(
            /^(.+?)\s+for\s+(?:the\s+|its\s+|their\s+|our\s+)?(.+)$/i
        );

        if (forMatch) {
            const value = normalizeMemoryValue(forMatch[1]);
            const domain = normalizeSemanticDomain(forMatch[2]);

            if (value && domain) {
                return {
                    value,
                    domain,
                    key: normalizeMemoryKey(domain)
                };
            }
        }

        const asMatch = normalized.match(
            /^(.+?)\s+as\s+(?:the\s+|its\s+|their\s+|our\s+)?(.+)$/i
        );

        if (asMatch) {
            const value = normalizeMemoryValue(asMatch[1]);
            const domain = normalizeSemanticDomain(asMatch[2]);

            if (value && domain) {
                return {
                    value,
                    domain,
                    key: normalizeMemoryKey(domain)
                };
            }
        }

        const toActionMatch = normalized.match(
            /^(.+?)\s+to\s+(?:store|save|persist|cache|manage|handle|process|track|maintain)\s+(?:all\s+of\s+)?(?:its\s+|their\s+|our\s+|the\s+)?(.+)$/i
        );

        if (toActionMatch) {
            const value = normalizeMemoryValue(toActionMatch[1]);
            const domain = normalizeSemanticDomain(toActionMatch[2]);

            if (value && domain) {
                return {
                    value,
                    domain,
                    key: normalizeMemoryKey(domain)
                };
            }
        }
    }

    return {
        value: normalized,
        domain: null,
        key: normalizeMemoryKey(normalized)
    };
}

/**
 * ============================================================
 * PROJECT PATTERN RESOLUTION
 * ============================================================
 */

function extractWrappedProjectFact(projectName, fact) {
    const candidates = [
        fact,
        `${projectName} ${fact}`,
        `${projectName}'s ${fact}`
    ];

    for (const candidate of candidates) {
        for (const pattern of PROJECT_FACT_PATTERNS) {
            if (pattern.name === 'observation_wrapper') {
                continue;
            }

            try {
                const result = pattern.match(candidate);

                if (result) {
                    return result;
                }
            } catch (error) {
                console.error(
                    `[DeterministicExtractor] Nested pattern "${pattern.name}" failed:`,
                    error.message
                );
            }
        }
    }

    return null;
}

async function resolveProjectFact(patternResult) {
    if (!patternResult) {
        return null;
    }

    if (!patternResult.projectName) {
        return null;
    }

    const result = await projectResolver.resolveProject(
        patternResult.projectName
    );

    if (result.type !== 'existing_project') {
        return null;
    }

    return {
        project: result.project,
        value: patternResult.value,
        domain: patternResult.domain,
        key: patternResult.key
    };
}

/**
 * ============================================================
 * MAIN EXTRACTOR
 * ============================================================
 */

async function extract(message) {
    console.log(
        '[DeterministicExtractor] INPUT:',
        JSON.stringify(message)
    );

    const memories = [];

    if (!message || typeof message !== 'string') {
        return {
            memories: [],
            conversation_update: {},
            deterministic: false
        };
    }

    /**
     * --------------------------------------------------------
     * USER PREFERENCE
     * --------------------------------------------------------
     */

    const favMatch = message.match(
        /my favorite (\w+(?:\s\w+)?) is (.+)/i
    );

    if (favMatch) {
        const keyPart = favMatch[1]
            .toLowerCase()
            .replace(/\s+/g, '_');

        const value = favMatch[2]
            .replace(/[.!?]$/, '')
            .trim();

        memories.push({
            shouldRemember: true,
            category: 'preference',
            subject: 'user',
            key: `favorite_${keyPart}`,
            value,
            confidence: 0.95
        });
    }

    /**
     * --------------------------------------------------------
     * PROJECT SWITCH
     * --------------------------------------------------------
     */

    const switchMatch = message.match(
        /(?:switch to|move to|go back to)\s+(?:the\s+)?(.+?)(?:[.!?]|$)/i
    );

    if (switchMatch) {
        const requestedName = normalizeProjectName(
            switchMatch[1]
        );

        const result =
            await projectResolver.resolveProjectChange(
                requestedName
            );

        if (result.allowed) {
            memories.push({
                shouldRemember: true,
                category: 'state',
                subject: 'user',
                key: 'current_project',
                value: result.project.project_key,
                confidence: 0.95
            });
        }
    }

    /**
     * --------------------------------------------------------
     * USER WORKING STATE
     * --------------------------------------------------------
     */

    const workMatch = message.match(
        /i(?:'m| am)\s+(?:(?:currently|back|still)\s+)?(?:working on|working with)\s+(?:the\s+)?(.+?)(?:[.!?]|$)/i
    );

    if (workMatch) {
        const requestedName = normalizeProjectName(
            workMatch[1]
        );

        if (requestedName) {
            const result =
                await projectResolver.resolveProject(
                    requestedName
                );

            if (result.type === 'existing_project') {
                memories.push({
                    shouldRemember: true,
                    category: 'state',
                    subject: 'user',
                    key: 'current_project',
                    value: result.project.project_key,
                    confidence: 0.90
                });
            }
        }
    }

    /**
     * --------------------------------------------------------
     * PROJECT FACT PATTERN PIPELINE
     * --------------------------------------------------------
     */

    if (memories.length === 0) {

        for (const pattern of PROJECT_FACT_PATTERNS) {

            try {
                const result = pattern.match(message);

                if (!result) {
                    continue;
                }

                let resolved;

                if (pattern.name === 'observation_wrapper') {
                    const nestedFact =
                        extractWrappedProjectFact(
                            result.projectName,
                            result.value
                        );

                    if (nestedFact) {
                        resolved =
                            await resolveProjectFact(
                                nestedFact
                            );
                    } else {
                        resolved =
                            await resolveProjectFact(
                                result
                            );
                    }
                } else {
                    resolved =
                        await resolveProjectFact(
                            result
                        );
                }

                if (!resolved) {
                    continue;
                }

                if (!resolved.key || !resolved.value) {
                    continue;
                }

                const memory = {
                    shouldRemember: true,
                    category: 'project',
                    project_key:
                        resolved.project.project_key,

                    subject: null,
                    topics: [],

                    key: resolved.key,
                    value: resolved.value,

                    semantic_hint:
                        resolved.domain || null,

                    needs_semantic_enrichment:
                        true,

                    confidence: 0.95
                };

                memories.push(memory);

                console.log(
                    `[DeterministicExtractor] Project fact detected via ${pattern.name}: ${resolved.project.project_key} | ${resolved.key} | ${resolved.value}`
                );

                break;

            } catch (error) {
                console.error(
                    `[DeterministicExtractor] Pattern "${pattern.name}" failed:`,
                    error.message
                );
            }
        }
    }

    /**
     * --------------------------------------------------------
     * RESULT
     * --------------------------------------------------------
     */

    if (memories.length > 0) {
        return {
            memories,
            conversation_update: {},
            deterministic: true
        };
    }

    return {
        memories: [],
        conversation_update: {},
        deterministic: false
    };
}

module.exports = {
    extract,
    PROJECT_FACT_PATTERNS
};
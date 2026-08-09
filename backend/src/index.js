require('dotenv').config();

const readline = require('readline');
const conversationEngine = require('./core/conversationEngine');
const personalityEngine = require('./core/personalityEngine');
const projectCache = require('./core/projectCache');
const memory = require('./memory');
const sessionManager = require('./memory/sessionManager');
const { createModelAdapter } = require('./models/modelAdapter');
const { stripThinking } = require('./utils/jsonExtractor');

const modelAdapter = createModelAdapter();
let currentMode = personalityEngine.DEFAULT_MODE;
let sessionId = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'you> ',
});

// Robust JSON extractor with Regex fallback for summary
function extractReflectionJSON(text) {
    // 1. Remove thinking traces (handles a stray closing </think> with no
    // matching opener, which the old paired-tag-only regex here missed)
    let cleanText = stripThinking(text);
    
    // 2. Try standard JSON parse
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
            return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
        } catch (e) {
            // 3. REGEX FALLBACK: If JSON parse fails, try to extract summary and learnings via regex
            console.log("[Reflection] JSON parse failed, attempting regex extraction...");
            const summaryMatch = cleanText.match(/"summary":\s*"([^"]+)"/i);
            const learningsMatch = cleanText.match(/"learnings":\s*(\[[\s\S]*?\])/i);
            
            let summary = summaryMatch ? summaryMatch[1] : null;
            let learnings = [];
            
            if (learningsMatch) {
                try {
                    learnings = JSON.parse(learningsMatch[1]);
                } catch (e2) {}
            }
            
            if (summary) {
                return { summary, learnings };
            }
        }
    }
    return null;
}

// --- STARTUP REFLECTION ---
async function initializeAtlas() {
    await projectCache.initialize();
    sessionId = await sessionManager.startSession();
    console.log(`Atlas Session Started: ${sessionId}`);
    
    const recentReflections = await memory.reflectionJournal.getRecent(1);
    
    if (recentReflections.length > 0) {
        const lastSession = recentReflections[0];
        console.log('Atlas - Stage 1 (Conversation Engine). Type /help for commands.\n');
        console.log(`atlas> Welcome back, Jelani. Last time (${new Date(lastSession.timestamp).toLocaleString()}), we worked on:\n${lastSession.summary}\n`);
    } else {
        console.log('Atlas - Stage 1 (Conversation Engine). Type /help for commands.\n');
        console.log('atlas> Hello Jelani. Ready when you are.\n');
    }
    
    rl.prompt();
}

// --- EXIT REFLECTION (Upgraded) ---
async function handleExit() {
    const history = await memory.workingMemory.getHistory(sessionId);
    
    if (history.length > 2) {
        console.log('\natlas> Reflecting on our session...');
        try {
            const fastModel = process.env.OLLAMA_MODEL_FAST || 'qwen3:4b';
            
            const reflectionResponse = await modelAdapter.complete([
                {
                    role: 'system',
                    content: 'You are Atlas\'s reflection engine. Analyze the conversation. Return ONLY valid JSON.\nFormat: {"summary": "2-3 sentence summary of topics and tasks.", "learnings": [{"trigger": "conceptual condition", "action": "generalized behavior to follow", "context": "category"}]}\nFor "learnings", extract any implicit rules, corrections, or behaviors the user explicitly taught you (e.g., "Always do X", "Never do Y"). CRITICAL: The "trigger" MUST be a generalized concept (e.g., "When asked about system history"), NOT the exact user sentence. The "action" MUST be the generalized behavior. Do NOT extract questions or casual chat. If none, return an empty array.'
                },
                {
                    role: 'user',
                    content: JSON.stringify(history)
                }
            ], { think: true, temperature: 0.3, model: fastModel }); // FORCED think: true

            let parsedReflection = extractReflectionJSON(reflectionResponse);
            
            // Safe Fallback: If JSON parsing fails, DO NOT save the raw reasoning text
            if (!parsedReflection) {
                let cleanFallback = stripThinking(reflectionResponse);
                if (cleanFallback.length > 300 || cleanFallback === '') {
                    cleanFallback = "The session involved various tasks and interactions. Detailed summary parsing encountered an issue, but the session was completed successfully.";
                }
                parsedReflection = { summary: cleanFallback, learnings: [] };
            }

            // Save implicit learnings to procedural memory
            if (parsedReflection.learnings && parsedReflection.learnings.length > 0) {
                for (const learning of parsedReflection.learnings) {
                    if (learning.trigger && learning.action) {
                        await memory.proceduralMemory.addProcedure({
                            trigger: learning.trigger,
                            action: learning.action,
                            context: learning.context || "reflection_learning"
                        });
                        console.log(`[Reflection] Learned new procedure: If ${learning.trigger}...`);
                    }
                }
            }

            await memory.reflectionJournal.append({
                sessionId: sessionId,
                summary: parsedReflection.summary
            });
            console.log('atlas> Session saved. Goodbye.');
        } catch (err) {
            console.error('Reflection failed:', err.message);
        }
    }
    
    await sessionManager.endSession();
    process.exit(0);
}

rl.on('line', async (line) => {
    const input = line.trim();
    if (input.startsWith('/')) {
        const exiting = await handleCommand(input);
        if (exiting) return;
        rl.prompt();
        return;
    }
    if (!input) {
        rl.prompt();
        return;
    }
    try {
        const reply = await conversationEngine.handleMessage(
            input,
            {
                memory,
                mode: currentMode,
                sessionId
            }
        );
        console.log(`atlas> ${reply}\n`);
    } catch(err) {
        console.error(`atlas> (error) ${err.message}\n`);
    }
    rl.prompt();
});

async function handleCommand(input) {
    const [command, arg] = input.slice(1).split(' ');
    switch(command) {
        case 'mode':
            if (personalityEngine.listModes().includes(arg)) {
                currentMode = arg;
                console.log(`(mode set to ${arg})\n`);
            } else {
                console.log(`(invalid mode. available: ${personalityEngine.listModes().join(', ')})\n`);
            }
            break;
        case 'reset':
            await memory.workingMemory.clear(sessionId);
            console.log('(conversation cleared)\n');
            break;
        case 'help':
            console.log(
                '/mode <auto|work|creative|casual|emergency> switch personality mode\n' +
                '/reset clear current conversation\n' +
                '/exit quit\n'
            );
            break;
        case 'exit':
            rl.close();
            return true;
        default:
            console.log(`(unknown command: ${command})\n`);
    }
    return false;
}

rl.on('close', async () => {
    await handleExit();
});

// Start the application
initializeAtlas();
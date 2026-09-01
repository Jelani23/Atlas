require('dotenv').config();

const readline = require('readline');
const conversationEngine = require('./core/conversationEngine');
const personalityEngine = require('./core/personalityEngine');
const projectCache = require('./core/projectCache');
const memory = require('./memory');
const sessionManager = require('./memory/sessionManager');
let currentMode = personalityEngine.DEFAULT_MODE;
let sessionId = null;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'you> ',
});

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

// --- EXIT REFLECTION ---
// Delegates to the shared reflectionEngine (see memory/reflectionEngine.js)
// instead of duplicating the prompt/parser/fallback logic that used to
// live here and, separately, in interface/atlasInterface.js.
async function handleExit() {
    const history = await memory.workingMemory.getHistory(sessionId);

    if (history.length > 2) {
        console.log('\natlas> Reflecting on our session...');
        await memory.reflectionEngine.generateReflection(sessionId, history);
        console.log('atlas> Session saved. Goodbye.');
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
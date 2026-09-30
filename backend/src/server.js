// backend/src/server.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const { WebSocketServer } = require('ws');
const { AtlasInterface } = require('./interface/atlasInterface');
const ttsManager = require('./voice/tts/ttsManager');
const kokoroProcess = require('./voice/tts/providers/kokoroProcess');
const workspaceState = require('./state/workspaceState');

const PORT = process.env.ATLAS_PORT || 7341;
const atlas = new AtlasInterface();
let isReady = false;
let hostHeartbeatTimer = null;

const FORWARDED_EVENTS = [
    'user.message',
    'atlas.request_started',
    'atlas.thinking',
    'atlas.tool_started',
    'atlas.tool_progress',
    'atlas.tool_completed',
    'atlas.response',
    'atlas.error',
    'atlas.status',
    'atlas.model_changed',
    'permission.requested',
    'atlas.streaming',
    'atlas.audio_chunk',
];

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: isReady ? 'ready' : 'initializing' }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('[Atlas Backend] Electron client connected via WS.');
    const handlers = {};
    FORWARDED_EVENTS.forEach(evt => {
        handlers[evt] = (payload) => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: evt, payload }));
        };
        atlas.on(evt, handlers[evt]);
    });

    ws.on('message', async (data) => {
        const msg = JSON.parse(data.toString());
        const { id, method, args = [] } = msg;
        try {
            let result;
            if (method === 'sendMessage') {
                const res = await atlas.sendMessage(...args);
                result = { ok: true, ...res };
            }
            else if (method === 'getState') result = atlas.getState();
            else if (method === 'listModes') result = atlas.listModes();
            else if (method === 'setMode') result = { ok: true, mode: atlas.setMode(...args) };
            else if (method === 'resetConversation') {
                await atlas.resetConversation();
                result = { ok: true };
            }
            else if (method === 'resolvePermission') {
                atlas.resolvePermission(args[0], args[1]);
                result = { ok: true };
            }
            else if (method === 'listConversations') result = await atlas.listConversations();
            else if (method === 'getConversation') result = await atlas.getConversation(...args);
            else if (method === 'newConversation') {
                console.log('[Atlas Backend] RPC newConversation received.');
                result = { ok: true, sessionId: await atlas.newConversation() };
                console.log(`[Atlas Backend] RPC newConversation completed | session=${result.sessionId}`);
            }
            else if (method === 'resumeConversation') {
                console.log(`[Atlas Backend] RPC resumeConversation received | session=${args[0]}`);
                result = { ok: true, sessionId: await atlas.resumeConversation(...args) };
                console.log(`[Atlas Backend] RPC resumeConversation completed | session=${result.sessionId}`);
            }
            else if (method === 'deleteConversation') result = await atlas.deleteConversation(...args);
            else if (method === 'renameConversation') result = await atlas.renameConversation(...args);
            else if (method === 'shutdown') {
                await atlas.shutdown();
                result = { ok: true };
            }
            else if (method === 'transcribeAudio') result = await atlas.transcribeAudio(...args);
            else if (method === 'interrupt') {
                atlas.interrupt();
                result = { ok: true };
            }
            ws.send(JSON.stringify({ id, result }));
        } catch (err) {
            ws.send(JSON.stringify({ id, error: err.message }));
        }
    });

    ws.on('close', () => {
        FORWARDED_EVENTS.forEach(evt => atlas.off(evt, handlers[evt]));
        console.log('[Atlas Backend] Electron client disconnected.');
    });
});

server.listen(PORT, async () => {
    console.log(`[Atlas Backend] HTTP/WS Server listening on port ${PORT}`);
    try {
        await Promise.all([
            atlas.initialize(),
            (async () => {
                console.log('[Atlas Backend] Initializing TTS Provider...');
                await ttsManager.checkHealth();
            })()
        ]);

        isReady = true;
        console.log('[Atlas Backend] Atlas is fully initialized and ready.');

        await workspaceState.heartbeatHost({ activity: 'Alice / Atlas available' });
        hostHeartbeatTimer = setInterval(() => {
            void workspaceState.heartbeatHost({ activity: 'Alice / Atlas available' });
        }, 30000);
    } catch (e) {
        console.error('[Atlas Backend] Initialization failed:', e);
        process.exit(1);
    }
});

async function gracefulShutdown(signal) {
    console.log(`[Atlas Backend] Shutting down (${signal})...`);
    if (hostHeartbeatTimer) {
        clearInterval(hostHeartbeatTimer);
        hostHeartbeatTimer = null;
    }
    await workspaceState.markHostOffline('Atlas host stopped');
    await atlas.shutdown();

    if (process.env.KOKORO_AUTOSTART === 'true') kokoroProcess.stop();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

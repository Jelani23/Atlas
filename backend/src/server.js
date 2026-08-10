// backend/src/server.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const { WebSocketServer } = require('ws');
const { AtlasInterface } = require('./interface/atlasInterface');

const PORT = process.env.ATLAS_PORT || 7341;
const atlas = new AtlasInterface();
let isReady = false;

const FORWARDED_EVENTS = [
    'user.message',
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
];

// Phase B: Health endpoint for wait-on and Electron to poll
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: isReady ? 'ready' : 'initializing' }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

// Phase C: WebSocket server for Electron to connect to
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('[Atlas Backend] Electron client connected via WS.');
    
    const handlers = {};
    FORWARDED_EVENTS.forEach(evt => {
        handlers[evt] = (payload) => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: evt, payload }));
            }
        };
        atlas.on(evt, handlers[evt]);
    });

    // Listen for RPC commands from Electron
    ws.on('message', async (data) => {
        const msg = JSON.parse(data.toString());
        const { id, method, args = [] } = msg;
        try {
            let result;
            if (method === 'sendMessage') result = { ok: true, reply: await atlas.sendMessage(...args) };
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
            else if (method === 'newConversation') result = { ok: true, sessionId: await atlas.newConversation() };
            else if (method === 'deleteConversation') result = await atlas.deleteConversation(...args);
            else if (method === 'renameConversation') result = await atlas.renameConversation(...args);
            else if (method === 'shutdown') {
                await atlas.shutdown();
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
        await atlas.initialize();
        isReady = true;
        console.log('[Atlas Backend] Atlas is fully initialized and ready.');
    } catch (e) {
        console.error('[Atlas Backend] Initialization failed:', e);
        process.exit(1); // Exit so nodemon can restart it
    }
});

async function gracefulShutdown(signal) {
    console.log(`[Atlas Backend] Shutting down (${signal})...`);
    await atlas.shutdown();
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
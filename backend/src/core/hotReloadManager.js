// backend/src/core/hotReloadManager.js
const fs = require('fs');
const path = require('path');
const taskManager = require('../tasks/taskManager');
const { eventBus } = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');

let isPendingRestart = false;
let watcher = null;

function initialize() {
    // We watch the src directory recursively. 
    // (Node's fs.watch supports recursive natively on Windows and macOS)
    const srcPath = path.join(__dirname, '../');
    console.log(`[HotReload] Watching ${srcPath} for changes...`);
    
    try {
        watcher = fs.watch(srcPath, { recursive: true }, (eventType, filename) => {
            if (filename && (filename.endsWith('.js') || filename.endsWith('.json'))) {
                console.log(`\n[HotReload] File changed: ${filename}`);
                requestRestart();
            }
        });
    } catch (e) {
        console.error('[HotReload] Failed to start watcher:', e.message);
    }

    eventBus.on(EventTypes.TASK_COMPLETED, checkPendingRestart);
    eventBus.on(EventTypes.TASK_FAILED, checkPendingRestart);
    eventBus.on(EventTypes.REQUEST_COMPLETED, checkPendingRestart);
    eventBus.on(EventTypes.REQUEST_FAILED, checkPendingRestart);
}

function requestRestart() {
    const activeCount = taskManager.getActiveTaskCount();
    
    if (activeCount > 0) {
        if (!isPendingRestart) {
            console.log(`[HotReload] ${activeCount} task(s) running. Deferring restart until complete...`);
            isPendingRestart = true;
        }
    } else {
        doRestart();
    }
}

function checkPendingRestart() {
    if (isPendingRestart) {
        const activeCount = taskManager.getActiveTaskCount();
        if (activeCount === 0) {
            doRestart();
        }
    }
}

function doRestart() {
    console.log('[HotReload] Safe to restart. Exiting process gracefully...');
    if (watcher) watcher.close();
    process.exit(0); // Nodemon sees the process exit and restarts it immediately
}

module.exports = { initialize };
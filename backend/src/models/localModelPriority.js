const { AsyncLocalStorage } = require('node:async_hooks');
const backgroundContext = new AsyncLocalStorage();
let foreground = 0;
const background = new Set();
const waiters = new Set();
function enterForeground() {
    foreground++;
    for (const controller of background) controller.abort();
    let released = false;
    return () => {
        if (released) return;
        released = true;
        if (--foreground === 0) for (const wake of [...waiters]) wake();
    };
}
function waitForForeground(signal) {
    if (!foreground) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const cleanup = () => { waiters.delete(wake); signal?.removeEventListener('abort', abort); };
        const wake = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(signal.reason || new Error('Cancelled')); };
        waiters.add(wake);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
    });
}
async function complete(run, options = {}) {
    if (!backgroundContext.getStore()) {
        const release = enterForeground();
        try { return await run(options); } finally { release(); }
    }
    // Retry only the interrupted model call, never surrounding memory writes.
    for (;;) {
        await waitForForeground(options.signal);
        options.signal?.throwIfAborted();
        if (foreground) continue;
        const controller = new AbortController();
        background.add(controller);
        try {
            const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
            const result = await run({ ...options, signal });
            if (!controller.signal.aborted) return result;
        } catch (error) {
            if (!controller.signal.aborted || options.signal?.aborted) throw error;
        } finally { background.delete(controller); }
    }
}
module.exports = { complete, enterForeground, runBackground: fn => backgroundContext.run(true, fn) };

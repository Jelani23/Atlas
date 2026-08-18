// backend/src/memory/llmQueue.js

/**
 * ============================================================
 * BACKGROUND MEMORY LLM QUEUE
 * ============================================================
 *
 * Ollama on a single local GPU processes one completion at a
 * time. The memory pipeline can end up firing more than one
 * completion at once - semantic enrichment fans multiple project
 * memories out with Promise.all, and consecutive user messages can
 * each kick off their own background extraction task before the
 * previous one has finished. When that happens, the requests pile
 * up inside Ollama in an order Node has no visibility into, which
 * is what was showing up as memory extraction being slow and
 * inconsistent from one run to the next.
 *
 * This queue serializes those calls client-side so they queue in a
 * predictable, visible order instead of racing each other inside
 * Ollama.
 *
 * IMPORTANT: this intentionally does NOT wrap the main
 * conversational reply path (modelAdapter.streamComplete in
 * conversationEngine.js). Only background memory-extraction and
 * semantic-enrichment calls go through here, so the user-facing
 * reply is never held up waiting behind a queued memory call.
 * ============================================================
 */

let tail = Promise.resolve();
let queueLength = 0;

function enqueue(fn) {
    queueLength += 1;

    const run = tail.then(() => fn());

    // Keep the chain alive even if a queued call rejects - one
    // failed enrichment/extraction shouldn't wedge everything
    // queued behind it. Callers still get their own rejection via
    // the promise returned from enqueue().
    tail = run.then(
        () => {},
        () => {}
    );

    // Handle both branches explicitly (rather than .finally) so this
    // bookkeeping fork never becomes an unhandled rejection itself.
    run.then(
        () => {
            queueLength -= 1;
        },
        () => {
            queueLength -= 1;
        }
    );

    return run;
}

function size() {
    return queueLength;
}

module.exports = { enqueue, size };

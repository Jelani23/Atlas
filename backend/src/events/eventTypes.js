// backend/src/events/eventTypes.js
module.exports = {
    // System Lifecycle
    SYSTEM_STARTED: 'system.started',
    SYSTEM_STOPPED: 'system.stopped',

    // Request Lifecycle (Main User Request)
    REQUEST_STARTED: 'request.started',
    REQUEST_COMPLETED: 'request.completed',
    REQUEST_FAILED: 'request.failed',
    REQUEST_CANCELLED: 'request.cancelled',

    // Task Lifecycle (Background Work)
    TASK_CREATED: 'task.created',
    TASK_STARTED: 'task.started',
    TASK_PROGRESS: 'task.progress',
    TASK_COMPLETED: 'task.completed',
    TASK_FAILED: 'task.failed',
    TASK_CANCELLED: 'task.cancelled',

    // Model Operations
    MODEL_SELECTED: 'model.selected',
    MODEL_STARTED: 'model.started',
    MODEL_COMPLETED: 'model.completed',
    LLM_FIRST_TOKEN: 'llm.first_token',
    LLM_FIRST_CONTENT: 'llm.first_content', // NEW: TTFC
    LLM_TOKEN_STREAM: 'llm.token_stream',
    LLM_METRICS: 'llm.metrics',

    // Tool Operations
    TOOL_STARTED: 'tool.started',
    TOOL_COMPLETED: 'tool.completed',
    TOOL_FAILED: 'tool.failed',

    // Context Operations
    CONTEXT_CACHE_HIT: 'context.cache_hit',
    CONTEXT_CACHE_MISS: 'context.cache_miss',

    // Permission Operations
    PERMISSION_CHECKED: 'permission.checked',
    PERMISSION_REQUESTED: 'permission.requested',
    PERMISSION_APPROVED: 'permission.approved',
    PERMISSION_DENIED: 'permission.denied',

    // Reload Operations
    RELOAD_REQUESTED: 'reload.requested',
    RELOAD_STARTED: 'reload.started',
    RELOAD_COMPLETED: 'reload.completed',
    RELOAD_DEFERRED: 'reload.deferred',

    // Performance Diagnostics
    STAGE_STARTED: 'stage.started',
    STAGE_COMPLETED: 'stage.completed'
};
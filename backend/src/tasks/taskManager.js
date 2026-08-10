// backend/src/tasks/taskManager.js
const { eventBus } = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');

// NEW: Explicit task states
const TaskStates = {
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    INTERRUPTED: 'INTERRUPTED',
    RECOVERING: 'RECOVERING'
};

class TaskManager {
    constructor() {
        this.tasks = new Map();
        this.taskCounter = 1;
    }

    async createTask(type, workFn, parentTaskId = null, requestId = null) {
        const taskId = `BG-${String(this.taskCounter++).padStart(4, '0')}`;
        const now = Date.now();
        
        const task = {
            taskId,
            parentTaskId,
            requestId,
            type,
            status: TaskStates.QUEUED, // Use constant
            progress: 0,
            stage: 'Initializing',
            createdAt: now,
            startedAt: null,
            completedAt: null,
            duration: null,
            result: null,
            error: null
        };

        this.tasks.set(taskId, task);
        eventBus.emit(EventTypes.TASK_STARTED, { taskId, parentTaskId, requestId, type, timestamp: now });

        this._executeTask(taskId, workFn);
        return taskId;
    }

    async _executeTask(taskId, workFn) {
        const task = this.tasks.get(taskId);
        
        // If it was cancelled before it even started, abort.
        if (task.status === TaskStates.CANCELLED) return;

        const now = Date.now();
        task.status = TaskStates.RUNNING;
        task.startedAt = now;
        
        try {
            const result = await workFn({
                taskId,
                updateProgress: (progress, stage) => {
                    task.progress = progress;
                    task.stage = stage;
                    eventBus.emit(EventTypes.TASK_PROGRESS, { taskId, progress, stage, timestamp: Date.now() });
                },
                // Cancellation checker
                isCancelled: () => task.status === TaskStates.CANCELLED
            });
            
            // Check if it was cancelled during execution
            if (task.status === TaskStates.CANCELLED) return;

            const completedAt = Date.now();
            task.status = TaskStates.COMPLETED;
            task.completedAt = completedAt;
            task.duration = completedAt - task.startedAt;
            task.result = result;
            eventBus.emit(EventTypes.TASK_COMPLETED, { taskId, result, timestamp: completedAt, duration: task.duration });
        } catch (error) {
            // If it was cancelled, a throw is expected, but we don't want to mark it as FAILED.
            if (task.status === TaskStates.CANCELLED) return;

            const failedAt = Date.now();
            task.status = TaskStates.FAILED;
            task.completedAt = failedAt;
            task.duration = failedAt - task.startedAt;
            task.error = error.message;
            eventBus.emit(EventTypes.TASK_FAILED, { taskId, error: error.message, timestamp: failedAt, duration: task.duration });
            console.error(`[TaskManager] Task ${taskId} failed:`, error);
        }
    }

    // Task cancellation
    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (task && (task.status === TaskStates.RUNNING || task.status === TaskStates.QUEUED)) {
            const now = Date.now();
            task.status = TaskStates.CANCELLED;
            task.completedAt = now;
            task.duration = now - (task.startedAt || now);
            eventBus.emit(EventTypes.TASK_CANCELLED, { taskId, timestamp: now });
            console.log(`[TaskManager] Task ${taskId} cancelled by user.`);
        }
    }

    startRequest(taskId, requestId, type = 'main_request', parentTaskId = null) {
        const now = Date.now();
        this.tasks.set(taskId, {
            taskId,
            requestId,
            parentTaskId,
            type,
            status: TaskStates.RUNNING, // Use constant
            createdAt: now,
            startedAt: now,
            completedAt: null,
            duration: null,
            result: null,
            error: null
        });
    }

    endRequest(taskId) {
        const task = this.tasks.get(taskId);
        if (task) {
            const now = Date.now();
            task.status = TaskStates.COMPLETED; // Use constant
            task.completedAt = now;
            task.duration = now - task.startedAt;
        }
    }

    getActiveTaskCount() {
        let count = 0;
        for (const task of this.tasks.values()) {
            if (task.status === TaskStates.RUNNING || task.status === TaskStates.QUEUED) count++;
        }
        return count;
    }

    getTask(taskId) {
        return this.tasks.get(taskId);
    }

    getAllTasks() {
        return Array.from(this.tasks.values());
    }
}

// Export TaskStates so other files can use it
module.exports = new TaskManager();
module.exports.TaskStates = TaskStates;
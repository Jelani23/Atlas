// backend/src/tasks/taskManager.js
const { eventBus } = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');

// Explicit task states
const TaskStates = {
    CREATED: 'CREATED',
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    INTERRUPTED: 'INTERRUPTED',
    RECOVERING: 'RECOVERING'
};

// Task priorities
const TaskPriorities = {
    CRITICAL: 'CRITICAL',
    HIGH: 'HIGH',
    NORMAL: 'NORMAL',
    LOW: 'LOW'
};

class TaskManager {
    constructor() {
        this.tasks = new Map();
        this.taskCounter = 1;
    }

    async createTask(type, workFn, parentTaskId = null, requestId = null, priority = TaskPriorities.NORMAL) {
        const taskId = `BG-${String(this.taskCounter++).padStart(4, '0')}`;
        const now = Date.now();
        
        const task = {
            taskId,
            parentTaskId,
            requestId,
            type,
            priority,
            status: TaskStates.CREATED,
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
        
        // Explicitly transition to QUEUED, then RUNNING
        task.status = TaskStates.QUEUED;
        eventBus.emit(EventTypes.TASK_CREATED, { taskId, parentTaskId, requestId, type, priority, timestamp: now });
        
        // Execute asynchronously
        this._executeTask(taskId, workFn);
        return taskId;
    }

    async _executeTask(taskId, workFn) {
        const task = this.tasks.get(taskId);
        if (!task) return;
        
        // If it was cancelled before it even started, abort.
        if (task.status === TaskStates.CANCELLED) return;

        const now = Date.now();
        task.status = TaskStates.RUNNING;
        task.startedAt = now;
        eventBus.emit(EventTypes.TASK_STARTED, { taskId, parentTaskId: task.parentTaskId, requestId: task.requestId, type: task.type, timestamp: now });
        
        try {
            const result = await workFn({
                taskId,
                updateProgress: (progress, stage) => {
                    task.progress = progress;
                    task.stage = stage;
                    eventBus.emit(EventTypes.TASK_PROGRESS, { taskId, progress, stage, timestamp: Date.now() });
                },
                isCancelled: () => task.status === TaskStates.CANCELLED
            });
            
            if (task.status === TaskStates.CANCELLED) return;

            const completedAt = Date.now();
            task.status = TaskStates.COMPLETED;
            task.completedAt = completedAt;
            task.duration = completedAt - task.startedAt;
            task.result = result;
            eventBus.emit(EventTypes.TASK_COMPLETED, { taskId, result, timestamp: completedAt, duration: task.duration });
        } catch (error) {
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

    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (task && (task.status === TaskStates.RUNNING || task.status === TaskStates.QUEUED || task.status === TaskStates.CREATED)) {
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
            priority: TaskPriorities.CRITICAL, // Foreground requests are critical
            status: TaskStates.RUNNING,
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
            task.status = TaskStates.COMPLETED;
            task.completedAt = now;
            task.duration = now - task.startedAt;
        }
    }

    getActiveTaskCount() {
        let count = 0;
        for (const task of this.tasks.values()) {
            if (task.status === TaskStates.RUNNING || task.status === TaskStates.QUEUED || task.status === TaskStates.CREATED) count++;
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

module.exports = new TaskManager();
module.exports.TaskStates = TaskStates;
module.exports.TaskPriorities = TaskPriorities;
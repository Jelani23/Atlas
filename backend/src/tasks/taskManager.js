// backend/src/tasks/taskManager.js
const { eventBus } = require('../events/eventBus');
const EventTypes = require('../events/eventTypes');

class TaskManager {
    constructor() {
        this.tasks = new Map();
        this.taskCounter = 1; // Zero-dependency counter
    }

    /**
     * Creates and runs a background task.
     * @param {string} type - The type of task (e.g., 'analyze_project')
     * @param {Function} workFn - The async function to execute
     * @returns {string} The Task ID
     */
    async createTask(type, workFn) {
        const taskId = `BG-${String(this.taskCounter++).padStart(4, '0')}`;
        
        const task = {
            taskId,
            type,
            status: 'PENDING',
            progress: 0,
            stage: 'Initializing',
            createdAt: Date.now(),
            result: null,
            error: null
        };

        this.tasks.set(taskId, task);
        eventBus.emit(EventTypes.TASK_STARTED, { taskId, type });

        // Fire and forget the work function
        this._executeTask(taskId, workFn);

        return taskId;
    }

    async _executeTask(taskId, workFn) {
        const task = this.tasks.get(taskId);
        task.status = 'RUNNING';
        
        try {
            const result = await workFn({
                taskId,
                updateProgress: (progress, stage) => {
                    task.progress = progress;
                    task.stage = stage;
                    eventBus.emit(EventTypes.TASK_PROGRESS, { taskId, progress, stage });
                }
            });
            
            task.status = 'COMPLETED';
            task.result = result;
            eventBus.emit(EventTypes.TASK_COMPLETED, { taskId, result });
        } catch (error) {
            task.status = 'FAILED';
            task.error = error.message;
            eventBus.emit(EventTypes.TASK_FAILED, { taskId, error: error.message });
            console.error(`[TaskManager] Task ${taskId} failed:`, error);
        }
    }

    startRequest(taskId, type = 'main_request') {
        this.tasks.set(taskId, {
            taskId,
            type,
            status: 'RUNNING',
            createdAt: Date.now()
        });
    }

    endRequest(taskId) {
        if (this.tasks.has(taskId)) {
            this.tasks.delete(taskId);
        }
    }

    getActiveTaskCount() {
        let count = 0;
        for (const task of this.tasks.values()) {
            if (task.status === 'RUNNING' || task.status === 'PENDING') count++;
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
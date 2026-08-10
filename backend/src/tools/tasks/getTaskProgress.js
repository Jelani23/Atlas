// src/tools/tasks/getTaskProgress.js
const taskManager = require('../../tasks/taskManager');

async function getTaskProgress(taskId) {
    try {
        if (!taskId) return "Error: No task ID provided.";
        const task = taskManager.getTask(taskId);
        if (!task) return `Error: Task ${taskId} not found.`;
        return `Task ${task.taskId} (${task.type})\nStatus: ${task.status}\nProgress: ${task.progress}%\nStage: ${task.stage}`;
    } catch (error) {
        return `Error getting task progress: ${error.message}`;
    }
}

module.exports = {
    execute: getTaskProgress,
    intentSchema: {
        name: 'getTaskProgress',
        domain: 'TASKS',
        triggers: ["task progress","status of task","bg-","task-"],
        requiredEntities: ["TASK_ID"],
        extractParams: (message, entities) => {
        const taskId = entities.find(e => e.type === 'TASK_ID');
        return [taskId ? taskId.value : null];
    }
    }
};

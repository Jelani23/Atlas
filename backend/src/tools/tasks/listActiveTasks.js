// src/tools/tasks/listActiveTasks.js
const taskManager = require('../../tasks/taskManager');

async function listActiveTasks() {
    try {
        const allTasks = taskManager.getAllTasks();
        const active = allTasks.filter(t => t.status === 'RUNNING' || t.status === 'QUEUED');
        if (active.length === 0) return "No active background tasks running.";
        const taskStrings = active.map(t => `- ${t.taskId} (${t.type}): ${t.status}, ${t.progress}% - ${t.stage}`);
        return `Active Background Tasks:\n${taskStrings.join('\n')}`;
    } catch (error) {
        return `Error listing active tasks: ${error.message}`;
    }
}

module.exports = {
    execute: listActiveTasks,
    intentSchema: {
        name: 'listActiveTasks',
        domain: 'TASKS',
        triggers: ['active tasks', 'running tasks', 'background tasks', 'working on anything'],
        requiredEntities: [],
        extractParams: (message, entities) => { return []; }
    }
};

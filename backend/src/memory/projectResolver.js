// backend/src/memory/projectResolver.js

const projectRegistry = require('./projectRegistry');

async function resolveProject(name) {
    if (!name) {
        return {
            type: 'none',
            project: null
        };
    }

    const project = await projectRegistry.findProject(name);

    if (project) {
        return {
            type: 'existing_project',
            project
        };
    }

    return {
        type: 'unknown',
        project: null,
        requestedName: name
    };
}

async function resolveProjectChange(name) {
    const result = await resolveProject(name);

    if (result.type === 'existing_project') {
        return {
            allowed: true,
            action: 'switch',
            project: result.project
        };
    }

    return {
        allowed: false,
        action: 'reject',
        project: null,
        requestedName: result.requestedName,
        reason: 'Project does not exist in the project registry.'
    };
}

async function resolveProjectCreation(name) {
    const result = await resolveProject(name);

    if (result.type === 'existing_project') {
        return {
            allowed: false,
            action: 'already_exists',
            project: result.project
        };
    }

    if (result.type === 'unknown') {
        return {
            allowed: true,
            action: 'create',
            projectName: result.requestedName
        };
    }

    return {
        allowed: false,
        action: 'invalid'
    };
}

module.exports = {
    resolveProject,
    resolveProjectChange,
    resolveProjectCreation
};
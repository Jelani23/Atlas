const projectRegistry = require('./projectRegistry');
const projectCommandResolver = require('./projectCommandResolver');

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
            project,
            projectId: project.id,
            projectKey: project.project_key
        };
    }

    return {
        type: 'unknown',
        project: null,
        requestedName: name
    };
}

async function resolveProjectByKey(projectKey) {
    if (!projectKey) {
        return {
            type: 'none',
            project: null
        };
    }

    const project = await projectRegistry.findProjectByKey(projectKey);

    if (project) {
        return {
            type: 'existing_project',
            project,
            projectId: project.id,
            projectKey: project.project_key
        };
    }

    return {
        type: 'unknown',
        project: null,
        requestedKey: projectKey
    };
}

async function resolveProjectChange(name) {
    const result = await resolveProject(name);

    if (result.type === 'existing_project') {
        return {
            allowed: true,
            action: 'switch',
            project: result.project,
            projectId: result.project.id,
            projectKey: result.project.project_key
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

async function handleProjectCommand(message) {
    const command =
        await projectCommandResolver.resolveProjectCommand(message);

    if (!command.detected) {
        return {
            handled: false,
            action: 'not_detected'
        };
    }

    if (command.action === 'already_exists') {
        return {
            handled: true,
            action: 'already_exists',
            project: command.project
        };
    }

    if (command.action === 'create') {
        const result = await projectRegistry.addProject({
            name: command.requestedName
        });

        if (!result.created) {
            return {
                handled: true,
                action: 'already_exists',
                project: result.project
            };
        }

        return {
            handled: true,
            action: 'created',
            project: result.project
        };
    }

    return {
        handled: true,
        action: 'invalid'
    };
}

module.exports = {
    resolveProject,
    resolveProjectByKey,
    resolveProjectChange,
    resolveProjectCreation,
    handleProjectCommand
};
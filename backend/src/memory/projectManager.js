const projectCommandResolver = require('./projectCommandResolver');
const projectRegistry = require('./projectRegistry');

async function handleProjectCommand(userInput) {
    const result = await projectCommandResolver.resolveProjectCreation(
        userInput
    );

    if (!result.detected) {
        return {
            handled: false
        };
    }

    if (result.action === 'already_exists') {
        return {
            handled: true,
            action: 'already_exists',
            project: result.project,
            message: `The project "${result.project.name}" already exists.`
        };
    }

    if (result.action === 'create') {
        const created = await projectRegistry.addProject({
            name: result.requestedName
        });

        if (!created.created) {
            return {
                handled: true,
                action: 'already_exists',
                project: created.project,
                message: `The project "${created.project.name}" already exists.`
            };
        }

        return {
            handled: true,
            action: 'created',
            project: created.project,
            message: `Created the project "${created.project.name}".`
        };
    }

    return {
        handled: true,
        action: 'unknown'
    };
}

module.exports = {
    handleProjectCommand
};
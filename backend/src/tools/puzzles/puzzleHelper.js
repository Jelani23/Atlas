const pipeline = require('../../puzzles/puzzlePipeline');
module.exports = {
    execute: request => {
        const interaction = require('../../devices/interactionContext').getInteraction();
        if (interaction?.client?.capabilities?.screenshot?.supported && /^\s*(?:please\s+)?wordle\s*:/i.test(request) && !interaction.manualWordleRequested)
            return 'Wordle uses the visual conversation route on this client. Ask to start or continue the game; manual commands require an explicit “Wordle:” request.';
        return pipeline.execute(request);
    },
    intentSchema: {
        name: 'puzzleHelper',
        domain: 'PUZZLES',
        description: 'Session-scoped Wordle and Connections helper. Pass the entire explicit Wordle: or Connections: command unchanged. Records only user-reported feedback; checks locally generated suggestions. Use help for syntax.',
        triggers: ['wordle', 'connections'],
        requiredEntities: [],
        matchesRequest: pipeline.matchesRequest,
        extractParams: message => [message],
        examples: ['Wordle: new', 'Wordle: BRAIN BYBYB', 'Wordle: suggest', 'Connections: hint']
    }
};

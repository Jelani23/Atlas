// backend/src/events/eventBus.js
const EventEmitter = require('events');

class AtlasEventBus extends EventEmitter {
    constructor() {
        super();
        // Prevent memory leak warnings if we get many subscribers
        this.setMaxListeners(20); 
    }
}

// Export a singleton instance
const eventBus = new AtlasEventBus();
module.exports = { eventBus };
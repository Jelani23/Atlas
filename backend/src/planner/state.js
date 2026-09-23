// Async context keeps in-flight requests attached to their conversation.
const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();
const sessions = new Map();
const fresh = id => ({ id, closed: false, lastSearchQuery: null, lastFileAction: null,
    pendingAction: null, pendingPlan: null, codeEvidence: null, projectQuestion: null });
const legacy = fresh(null); // Isolated callers/tests without a session.
const current = () => storage.getStore() || legacy;
const methods = {
    getSessionScope: current,
    isSessionClosed: () => current().closed,
    bindToSession(callback) {
        const scope = current();
        return (...args) => storage.run(scope, () => callback(...args));
    },
    runInSession(id, callback) {
        if (id == null) return storage.run(legacy, callback);
        const key = String(id);
        if (!sessions.has(key)) sessions.set(key, fresh(key));
        return storage.run(sessions.get(key), callback);
    },
    endSession(id) {
        const key = id == null ? null : String(id);
        const scope = key == null ? legacy : sessions.get(key);
        if (!scope) return;
        scope.closed = true;
        scope.codeEvidence = null;
        scope.projectQuestion = null;
        scope.pendingAction = scope.pendingPlan = scope.lastFileAction = scope.lastSearchQuery = null;
        require('../permissions/permissionManager').cancelScope(scope);
        if (key != null) sessions.delete(key);
    }
};
module.exports = new Proxy(methods, {
    get(target, key) { return key in target ? target[key] : current()[key]; },
    set(_target, key, value) {
        if (!current().closed) current()[key] = value;
        return true;
    }
});

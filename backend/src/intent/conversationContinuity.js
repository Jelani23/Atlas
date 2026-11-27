// Short-lived interpretation context, not durable memory or execution authority.
const TTL = 10 * 60 * 1000;
function get(scope, connectionId, now = Date.now()) {
    const value = scope.conversationContinuity;
    return value && value.connectionId === connectionId && now - value.at < TTL
        ? { ...value, task: value.task && now - value.task.at < TTL ? value.task : null } : null;
}
function user(scope, connectionId, text) {
    const prior = get(scope, connectionId);
    scope.conversationContinuity = { connectionId, at: Date.now(),
        turns: [...(prior?.turns || []), { role: 'user', content: String(text).slice(0, 1200) }].slice(-8),
        task: prior?.task || null };
}
function assistant(scope, text) {
    const value = scope.conversationContinuity;
    if (!value) return;
    value.at = Date.now();
    value.turns = [...value.turns, { role: 'assistant', content: String(text).slice(0, 1800) }].slice(-8);
}
function task(scope, data) {
    if (scope.conversationContinuity) scope.conversationContinuity.task = { ...data, at: Date.now() };
}
module.exports = { get, user, assistant, task };

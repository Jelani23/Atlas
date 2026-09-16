const { atlasState } = require('../core/atlasState');

function validateProfile(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Invalid agent profile');
    const string = value => typeof value === 'string' && value.trim().length > 0;
    const strings = value => Array.isArray(value) && value.every(string);
    if (!['name', 'role', 'platform', 'user', 'userRelationship'].every(key => string(profile.identity?.[key]))
        || !string(profile.inspiration)
        || !['traits', 'values', 'reasoningPrinciples', 'avoid'].every(key => strings(profile[key]))
        || !['enjoys', 'dislikes', 'lighterDislikes'].every(key => strings(profile.preferences?.[key]))
        || !['avatar', 'palette', 'atmosphere'].every(key => string(profile.aesthetic?.[key]))) {
        throw new Error('Invalid agent profile shape');
    }
    return profile;
}

function createAgentProfileStore({ client, seeds = { alice: atlasState }, ttlMs = 30000, now = Date.now }) {
    const cache = new Map();
    const clone = value => JSON.parse(JSON.stringify(value));
    async function get(agentId = 'alice') {
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(agentId)) throw new Error('Invalid agent ID');
        const cached = cache.get(agentId);
        if (cached && now() - cached.loadedAt < ttlMs) return clone(cached);
        let result;
        let failure;
        try {
            result = await client.from('agent_profiles').select('agent_id, schema_version, revision, profile')
                .eq('agent_id', agentId).maybeSingle();
            if (result.error) throw result.error;
        } catch (error) {
            failure = error.code || 'read_unavailable';
        }
        let snapshot;
        if (!failure && result.data) {
            if (result.data.agent_id !== agentId || result.data.schema_version !== 1) throw new Error('Agent profile identity/version mismatch');
            validateProfile(result.data.profile);
            snapshot = { agentId, source: 'database', revision: result.data.revision, profile: result.data.profile, degraded: false };
        } else if (cached?.source === 'database' || cached?.source === 'cached_database') {
            snapshot = { ...cached, source: 'cached_database', degraded: true, reason: failure || 'profile_missing' };
        } else if (Object.hasOwn(seeds, agentId)) {
            snapshot = { agentId, source: 'seed_fallback', revision: null, profile: validateProfile(seeds[agentId]),
                degraded: true, reason: failure || 'profile_missing' };
        } else {
            throw new Error(`Profile unavailable for agent ${agentId}; refusing to substitute another agent`);
        }
        snapshot.loadedAt = now();
        cache.set(agentId, clone(snapshot));
        return clone(snapshot);
    }
    return { get, invalidate: agentId => cache.delete(agentId) };
}

let defaultStore;
function getAgentProfile(agentId = process.env.ATLAS_AGENT_ID || 'alice') {
    defaultStore ||= createAgentProfileStore({ client: require('../database/supabaseClient') });
    return defaultStore.get(agentId);
}

module.exports = { createAgentProfileStore, getAgentProfile, validateProfile };

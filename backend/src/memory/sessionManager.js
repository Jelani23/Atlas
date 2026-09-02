// backend/src/memory/sessionManager.js
const supabase = require('../database/supabaseClient');

let currentSessionId = null;
let reflectionLifecycleSupported = null;
let emptySessionCleanupSupported = null;

const REFLECTION_MIN_MESSAGES = Math.max(
    1,
    Number(process.env.REFLECTION_MIN_MESSAGES) || 3
);
const REFLECTION_MAX_ATTEMPTS = Math.max(
    1,
    Number(process.env.REFLECTION_MAX_ATTEMPTS) || 3
);

// The lifecycle migration is deliberately feature-detected at runtime. This
// keeps a checked-out backend usable before migration 004 has been applied to
// Supabase, while enabling the durable queue automatically after it is.
async function supportsReflectionLifecycle() {
    if (reflectionLifecycleSupported !== null) {
        return reflectionLifecycleSupported;
    }

    const { error } = await supabase
        .from('sessions')
        .select('reflection_status')
        .limit(1);

    reflectionLifecycleSupported = !error;

    if (error) {
        console.warn(
            '[SessionManager] Reflection lifecycle migration is not active; ' +
            'using the legacy close-session path.'
        );
    } else {
        console.log('[SessionManager] Durable reflection lifecycle is active.');
    }

    return reflectionLifecycleSupported;
}

async function startSession() {
    const { data, error } = await supabase
        .from('sessions')
        .insert({})
        .select('id')
        .single();

    if (error) {
        throw new Error(`Failed to start session in Supabase: ${error.message}`);
    }

    currentSessionId = data.id;
    return currentSessionId;
}

function getCurrentSession() {
    return currentSessionId;
}

// Most recent sessions, each with a preview pulled from its first user
// message — enough to render a conversation history list without pulling
// every message for every session.
async function listSessions(limit = 50) {
    const { data, error } = await supabase
        .from('sessions')
        .select('id, started_at, ended_at, title')
        .order('started_at', { ascending: false })
        .limit(limit);

    if (error) {
        throw new Error(`Failed to list sessions from Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
        return [];
    }

    const ids = data.map((s) => s.id);
    const { data: userMessages, error: previewError } = await supabase
        .from('conversations')
        .select('session_id, content')
        .in('session_id', ids)
        .eq('role', 'user')
        .order('id', { ascending: true });

    if (previewError) {
        // Non-fatal — the list is still useful without previews.
        console.error('Failed to load conversation previews:', previewError.message);
    }

    const previewBySession = new Map();
    for (const row of userMessages || []) {
        if (!previewBySession.has(row.session_id)) {
            previewBySession.set(row.session_id, row.content);
        }
    }

    return data.map((s) => ({
        id: s.id,
        startedAt: s.started_at,
        endedAt: s.ended_at,
        title: s.title || null,
        preview: previewBySession.get(s.id) || '',
    }));
}

async function listTitledSessions(limit = 500) {
    const { data, error } = await supabase
        .from('sessions')
        .select('id, title, started_at, ended_at')
        .not('title', 'is', null)
        .order('started_at', { ascending: false })
        .limit(limit);

    if (error) {
        throw new Error(`Failed to list titled sessions from Supabase: ${error.message}`);
    }

    return (data || []).filter(session => String(session.title || '').trim());
}

// Full ordered transcript for a single session (for reopening a past
// conversation, or restoring the current one after a renderer reload).
async function getSessionMessages(sessionId) {
    if (!sessionId) {
        return [];
    }

    const { data, error } = await supabase
        .from('conversations')
        .select('role, content, timestamp')
        .eq('session_id', sessionId)
        .order('id', { ascending: true });

    if (error) {
        throw new Error(`Failed to load conversation from Supabase: ${error.message}`);
    }

    return data;
}

// Deletes a session outright (right-click > Delete in the Conversations
// sidebar). `conversations` rows cascade via the FK in the schema, so this
// is the one call that fully removes a conversation log.
async function deleteSession(sessionId) {
    if (!sessionId) return;

    const { error } = await supabase.from('sessions').delete().eq('id', sessionId);

    if (error) {
        throw new Error(`Failed to delete session from Supabase: ${error.message}`);
    }

    if (currentSessionId != null && String(currentSessionId) === String(sessionId)) {
        currentSessionId = null;
    }
}

// Renames a session (right-click > Rename). Empty string clears back to the
// auto preview.
async function renameSession(sessionId, title) {
    if (!sessionId) return null;

    const cleanTitle = (title || '').trim() || null;
    const { error } = await supabase
        .from('sessions')
        .update({ title: cleanTitle })
        .eq('id', sessionId);

    if (error) {
        throw new Error(`Failed to rename session in Supabase: ${error.message}`);
    }

    return cleanTitle;
}

function getSessionResumeUpdate(lifecycleEnabled) {
    const update = { ended_at: null };
    if (lifecycleEnabled) {
        Object.assign(update, {
            reflection_status: 'open',
            reflection_attempts: 0,
            reflection_error: null,
            reflection_started_at: null,
            reflected_at: null
        });
    }
    return update;
}

async function resumeSession(sessionId) {
    if (!sessionId) {
        throw new Error('A conversation id is required.');
    }

    const lifecycleEnabled = await supportsReflectionLifecycle();
    const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select(lifecycleEnabled ? 'id, reflection_status' : 'id')
        .eq('id', sessionId)
        .maybeSingle();

    if (sessionError) {
        throw new Error(`Failed to load conversation ${sessionId}: ${sessionError.message}`);
    }
    if (!session) {
        throw new Error(`Conversation ${sessionId} does not exist.`);
    }
    if (lifecycleEnabled && session.reflection_status === 'processing') {
        throw new Error('That conversation is still being reflected. Try again shortly.');
    }

    const update = getSessionResumeUpdate(lifecycleEnabled);

    const { error } = await supabase
        .from('sessions')
        .update(update)
        .eq('id', session.id);

    if (error) {
        throw new Error(`Failed to resume conversation ${sessionId}: ${error.message}`);
    }

    currentSessionId = session.id;
    console.log(`[SessionManager] Resumed session ${session.id}.`);
    return session.id;
}

async function getSessionMessageCount(sessionId) {
    if (!sessionId) return 0;

    const { count, error } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId);

    if (error) {
        throw new Error(`Failed to count session messages: ${error.message}`);
    }

    return count || 0;
}

function getSessionCloseOutcome(messageCount, lifecycleEnabled) {
    if (messageCount === 0) {
        return { deleted: true, reflectionStatus: 'deleted' };
    }

    return {
        deleted: false,
        reflectionStatus: lifecycleEnabled
            ? (messageCount >= REFLECTION_MIN_MESSAGES ? 'pending' : 'skipped')
            : null
    };
}

async function endSession(sessionId = currentSessionId) {
    if (!sessionId) {
        return { sessionId: null, reflectionStatus: 'skipped', messageCount: 0 };
    }

    const lifecycleEnabled = await supportsReflectionLifecycle();
    const messageCount = await getSessionMessageCount(sessionId);
    const outcome = getSessionCloseOutcome(messageCount, lifecycleEnabled);
    if (outcome.deleted) {
        await deleteSession(sessionId);
        console.log(`[SessionManager] Removed empty session ${sessionId}.`);
        return {
            sessionId,
            reflectionStatus: outcome.reflectionStatus,
            messageCount,
            lifecycleEnabled,
            deleted: true
        };
    }

    let reflectionStatus = outcome.reflectionStatus;
    let update = { ended_at: new Date().toISOString() };

    if (lifecycleEnabled) {
        update = {
            ...update,
            reflection_status: reflectionStatus,
            reflection_error: null,
            reflection_started_at: null
        };
    }

    const { error } = await supabase
        .from('sessions')
        .update(update)
        .eq('id', sessionId);

    if (error) {
        throw new Error(`Failed to close session in Supabase: ${error.message}`);
    }

    if (currentSessionId != null && String(currentSessionId) === String(sessionId)) {
        currentSessionId = null;
    }

    console.log(
        `[SessionManager] Closed session ${sessionId}` +
        (lifecycleEnabled
            ? ` | messages=${messageCount} | reflection=${reflectionStatus}`
            : ' | legacy reflection lifecycle')
    );

    return { sessionId, reflectionStatus, messageCount, lifecycleEnabled, deleted: false };
}

async function removeHistoricalEmptySessions() {
    if (emptySessionCleanupSupported === false) {
        return { supported: false, removed: 0 };
    }

    const { data, error } = await supabase.rpc('remove_empty_sessions', {
        p_exclude_session_id: currentSessionId
    });

    if (error) {
        emptySessionCleanupSupported = false;
        console.warn(
            '[SessionManager] Empty-session cleanup migration is not active.'
        );
        return { supported: false, removed: 0 };
    }

    emptySessionCleanupSupported = true;
    const removed = Array.isArray(data) ? data.length : Number(data) || 0;
    if (removed > 0) {
        console.log(`[SessionManager] Removed ${removed} historical empty session(s).`);
    }
    return { supported: true, removed };
}

// Recover lifecycle work that could not finish because Electron closed,
// nodemon restarted the backend, or the process crashed. Existing sessions
// from before migration 004 are marked `backfill_pending` by the migration and
// are intentionally excluded here so a large historical backlog never steals
// the GPU from a live conversation without an explicit backfill run.
async function recoverReflectionLifecycle() {
    if (!(await supportsReflectionLifecycle())) {
        return { supported: false, recovered: 0, abandoned: 0 };
    }

    const { data: staleBackfillRows, error: staleBackfillError } = await supabase
        .from('sessions')
        .update({
            reflection_status: 'backfill_pending',
            reflection_started_at: null,
            reflection_error: 'Recovered interrupted historical backfill.'
        })
        .eq('reflection_status', 'processing')
        .like('reflection_error', 'Historical backfill%')
        .select('id');

    if (staleBackfillError) {
        throw new Error(`Failed to recover historical backfills: ${staleBackfillError.message}`);
    }

    const { data: staleRows, error: staleError } = await supabase
        .from('sessions')
        .update({
            reflection_status: 'pending',
            reflection_started_at: null,
            reflection_error: 'Recovered after an interrupted reflection attempt.'
        })
        .eq('reflection_status', 'processing')
        .select('id');

    if (staleError) {
        throw new Error(`Failed to recover stale reflection jobs: ${staleError.message}`);
    }

    const { data: retryRows, error: retryError } = await supabase
        .from('sessions')
        .update({ reflection_status: 'pending', reflection_started_at: null })
        .eq('reflection_status', 'failed')
        .lt('reflection_attempts', REFLECTION_MAX_ATTEMPTS)
        .select('id');

    if (retryError) {
        throw new Error(`Failed to requeue reflection jobs: ${retryError.message}`);
    }

    const { data: abandonedRows, error: abandonedError } = await supabase
        .from('sessions')
        .select('id')
        .eq('reflection_status', 'open');

    if (abandonedError) {
        throw new Error(`Failed to find abandoned sessions: ${abandonedError.message}`);
    }

    let abandoned = 0;
    for (const row of abandonedRows || []) {
        await endSession(row.id);
        abandoned += 1;
    }

    return {
        supported: true,
        recovered: (staleBackfillRows || []).length + (staleRows || []).length + (retryRows || []).length,
        abandoned
    };
}

async function claimNextReflectionSession() {
    if (!(await supportsReflectionLifecycle())) return null;

    const { data: candidates, error: candidateError } = await supabase
        .from('sessions')
        .select('id, reflection_attempts, ended_at')
        .eq('reflection_status', 'pending')
        .order('ended_at', { ascending: true, nullsFirst: true })
        .limit(1);

    if (candidateError) {
        throw new Error(`Failed to load pending reflection: ${candidateError.message}`);
    }

    const candidate = candidates?.[0];
    if (!candidate) return null;

    return claimReflectionSession(candidate.id);
}

async function claimReflectionSession(sessionId) {
    if (!sessionId || !(await supportsReflectionLifecycle())) return null;

    const { data: candidate, error: candidateError } = await supabase
        .from('sessions')
        .select('id, reflection_attempts')
        .eq('id', sessionId)
        .eq('reflection_status', 'pending')
        .maybeSingle();

    if (candidateError) {
        throw new Error(`Failed to load pending reflection ${sessionId}: ${candidateError.message}`);
    }
    if (!candidate) return null;

    const { data, error } = await supabase
        .from('sessions')
        .update({
            reflection_status: 'processing',
            reflection_attempts: (candidate.reflection_attempts || 0) + 1,
            reflection_started_at: new Date().toISOString(),
            reflection_error: null
        })
        .eq('id', candidate.id)
        .eq('reflection_status', 'pending')
        .select('id, reflection_attempts')
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to claim pending reflection: ${error.message}`);
    }

    return data || null;
}

async function markReflectionComplete(sessionId) {
    if (!(await supportsReflectionLifecycle())) return;

    const { error } = await supabase
        .from('sessions')
        .update({
            reflection_status: 'complete',
            reflected_at: new Date().toISOString(),
            reflection_started_at: null,
            reflection_error: null
        })
        .eq('id', sessionId);

    if (error) {
        throw new Error(`Failed to complete reflection job: ${error.message}`);
    }
}

async function markReflectionFailed(sessionId, errorMessage, attemptCount = REFLECTION_MAX_ATTEMPTS) {
    if (!(await supportsReflectionLifecycle())) return;

    const shouldRetry = Number(attemptCount) < REFLECTION_MAX_ATTEMPTS;

    const { error } = await supabase
        .from('sessions')
        .update({
            reflection_status: shouldRetry ? 'pending' : 'failed',
            reflection_started_at: null,
            reflection_error: String(errorMessage || 'Unknown reflection failure').slice(0, 1000)
        })
        .eq('id', sessionId);

    if (error) {
        throw new Error(`Failed to record reflection failure: ${error.message}`);
    }

    return shouldRetry ? 'pending' : 'failed';
}

async function requeueReflection(sessionId) {
    if (!(await supportsReflectionLifecycle())) {
        throw new Error('Reflection lifecycle migration is not active.');
    }

    const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, ended_at')
        .eq('id', sessionId)
        .maybeSingle();

    if (sessionError) {
        throw new Error(`Failed to load session ${sessionId}: ${sessionError.message}`);
    }
    if (!session) throw new Error(`Session ${sessionId} was not found.`);
    if (!session.ended_at) throw new Error(`Session ${sessionId} is still open.`);

    const messageCount = await getSessionMessageCount(sessionId);
    if (messageCount < REFLECTION_MIN_MESSAGES) {
        throw new Error(`Session ${sessionId} has only ${messageCount} messages.`);
    }

    const { error } = await supabase
        .from('sessions')
        .update({
            reflection_status: 'pending',
            reflection_attempts: 0,
            reflection_error: null,
            reflection_started_at: null,
            reflected_at: null
        })
        .eq('id', sessionId);

    if (error) {
        throw new Error(`Failed to requeue session ${sessionId}: ${error.message}`);
    }

    return { sessionId: Number(sessionId), messageCount, reflectionStatus: 'pending' };
}

async function listReflectionBackfillCandidates(limit = 5, sessionIds = []) {
    if (!(await supportsReflectionLifecycle())) {
        throw new Error('Reflection lifecycle migration is not active.');
    }

    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 5));
    let query = supabase
        .from('sessions')
        .select('id, title, started_at, ended_at')
        .eq('reflection_status', 'backfill_pending')
        .not('ended_at', 'is', null);

    if (sessionIds.length > 0) {
        query = query.in('id', sessionIds);
    }

    const { data, error } = await query
        .order('ended_at', { ascending: false, nullsFirst: false })
        .limit(safeLimit);

    if (error) {
        throw new Error(`Failed to load reflection backfill candidates: ${error.message}`);
    }

    const candidates = [];
    for (const session of data || []) {
        const [messageCount, previewResult] = await Promise.all([
            getSessionMessageCount(session.id),
            supabase
                .from('conversations')
                .select('content')
                .eq('session_id', session.id)
                .eq('role', 'user')
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle()
        ]);

        if (previewResult.error) {
            throw new Error(
                `Failed to load preview for session ${session.id}: ${previewResult.error.message}`
            );
        }

        candidates.push({
            ...session,
            messageCount,
            preview: previewResult.data?.content || ''
        });
    }

    return candidates;
}

async function claimReflectionBackfillSession(sessionId) {
    if (!(await supportsReflectionLifecycle())) {
        throw new Error('Reflection lifecycle migration is not active.');
    }

    const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, reflection_status, reflection_attempts, ended_at')
        .eq('id', sessionId)
        .maybeSingle();

    if (sessionError) {
        throw new Error(`Failed to load session ${sessionId}: ${sessionError.message}`);
    }
    if (!session) throw new Error(`Session ${sessionId} was not found.`);
    if (session.reflection_status !== 'backfill_pending') {
        throw new Error(
            `Session ${sessionId} is ${session.reflection_status}, not backfill_pending.`
        );
    }
    if (!session.ended_at) throw new Error(`Session ${sessionId} is still open.`);

    const messageCount = await getSessionMessageCount(sessionId);
    if (messageCount < REFLECTION_MIN_MESSAGES) {
        const { error } = await supabase
            .from('sessions')
            .update({ reflection_status: 'skipped' })
            .eq('id', sessionId)
            .eq('reflection_status', 'backfill_pending');
        if (error) {
            throw new Error(`Failed to skip short session ${sessionId}: ${error.message}`);
        }
        return {
            id: Number(sessionId),
            reflection_attempts: session.reflection_attempts || 0,
            skipReason: 'too_short'
        };
    }

    const { data, error } = await supabase
        .from('sessions')
        .update({
            reflection_status: 'processing',
            reflection_attempts: (session.reflection_attempts || 0) + 1,
            reflection_error: 'Historical backfill in progress.',
            reflection_started_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .eq('reflection_status', 'backfill_pending')
        .select('id, reflection_attempts')
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to claim backfill session ${sessionId}: ${error.message}`);
    }
    if (!data) {
        throw new Error(`Session ${sessionId} changed before it could be claimed.`);
    }

    return data;
}

async function markReflectionBackfillFailed(sessionId, errorMessage) {
    const { error } = await supabase
        .from('sessions')
        .update({
            reflection_status: 'backfill_pending',
            reflection_started_at: null,
            reflection_error: String(errorMessage || 'Unknown backfill failure').slice(0, 1000)
        })
        .eq('id', sessionId)
        .eq('reflection_status', 'processing');

    if (error) {
        throw new Error(`Failed to return session ${sessionId} to backfill: ${error.message}`);
    }
}

async function skipReflectionBackfill(sessionId, reason = 'Reviewed as low-value historical context.') {
    const { data, error } = await supabase
        .from('sessions')
        .update({
            reflection_status: 'skipped',
            reflection_started_at: null,
            reflection_error: String(reason).slice(0, 1000)
        })
        .eq('id', sessionId)
        .eq('reflection_status', 'backfill_pending')
        .select('id')
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to skip backfill session ${sessionId}: ${error.message}`);
    }
    if (!data) {
        throw new Error(`Session ${sessionId} is no longer backfill_pending.`);
    }

    return { sessionId: Number(sessionId), status: 'skipped' };
}

// Phase 3C.2: Fetch the rolling conversation working context
async function getWorkingContext(sessionId) {
    if (!sessionId) return {};
    const { data, error } = await supabase
        .from('sessions')
        .select('working_context')
        .eq('id', sessionId)
        .single();
    
    if (error) {
        console.error('Failed to load working context:', error.message);
        return {};
    }
    return data?.working_context || {};
}

// Phase 3C.2: Atomically merge a rolling conversation working-context delta.
//
// IMPORTANT:
// Callers must provide only the changes they want to make.
// They must NOT read working_context, merge locally, and write the
// resulting snapshot back.
//
// The database owns the canonical merge so concurrent background
// tasks cannot overwrite each other's context updates.
async function mergeWorkingContext(sessionId, contextDelta) {
    if (!sessionId) {
        return {};
    }

    if (
        !contextDelta ||
        typeof contextDelta !== 'object' ||
        Array.isArray(contextDelta)
    ) {
        console.warn(
            '[SessionManager] Ignoring invalid working-context delta.'
        );

        return {};
    }

    if (Object.keys(contextDelta).length === 0) {
        return await getWorkingContext(sessionId);
    }

    const { data, error } = await supabase.rpc(
        'merge_session_working_context',
        {
            p_session_id: sessionId,
            p_delta: contextDelta
        }
    );

    if (error) {
        console.error(
            '[SessionManager] Failed to merge working context:',
            error.message
        );

        return {};
    }

    return data || {};
}

module.exports = {
    startSession,
    getCurrentSession,
    endSession,
    listSessions,
    listTitledSessions,
    getSessionMessages,
    deleteSession,
    renameSession,
    resumeSession,
    getSessionResumeUpdate,
    getSessionCloseOutcome,
    removeHistoricalEmptySessions,
    getWorkingContext,
    mergeWorkingContext,
    supportsReflectionLifecycle,
    recoverReflectionLifecycle,
    claimNextReflectionSession,
    claimReflectionSession,
    markReflectionComplete,
    markReflectionFailed,
    requeueReflection,
    listReflectionBackfillCandidates,
    claimReflectionBackfillSession,
    markReflectionBackfillFailed,
    skipReflectionBackfill,
    getSessionMessageCount,
    REFLECTION_MIN_MESSAGES,
    REFLECTION_MAX_ATTEMPTS
};

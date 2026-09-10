// Optimistic ownership of a verification attempt. Every write must still match
// the snapshot that this worker claimed, including the attempt counter.
function staleWrite(message) {
    const error = new Error(message);
    error.code = 'KNOWLEDGE_VERIFICATION_STALE';
    return error;
}

function assertSnapshot(id, snapshot) {
    if (!snapshot || String(snapshot.id) !== String(id) ||
        typeof snapshot.value !== 'string' || typeof snapshot.updated_at !== 'string' ||
        !snapshot.updated_at || typeof snapshot.verification_status !== 'string' ||
        !Number.isSafeInteger(snapshot.verification_attempts) || snapshot.verification_attempts < 0) {
        throw new Error('Verification writes require a complete expected record snapshot.');
    }
}

function whereSnapshot(query, id, snapshot) {
    return query.eq('id', id).eq('value', snapshot.value)
        .eq('updated_at', snapshot.updated_at)
        .eq('verification_status', snapshot.verification_status)
        .eq('verification_attempts', snapshot.verification_attempts);
}

function createVerificationWrites(client, now = () => new Date().toISOString()) {
    return {
        async begin(id, expected) {
            assertSnapshot(id, expected);
            if (['pending', 'superseded'].includes(expected.verification_status)) {
                throw staleWrite('This record is already being verified or has been superseded.');
            }
            const query = client.from('knowledge_library').update({
                verification_status: 'pending', verification_error: null,
                verification_attempts: expected.verification_attempts + 1, updated_at: now()
            });
            const { data, error } = await whereSnapshot(query, id, expected).select('*').maybeSingle();
            if (error) throw new Error(`Failed to claim knowledge verification: ${error.message}`);
            if (!data) throw staleWrite('The record changed before verification could be claimed. Retry from its current state.');
            return data;
        },
        async apply(id, update, claimed) {
            assertSnapshot(id, claimed);
            if (claimed.verification_status !== 'pending') throw staleWrite('This worker does not own a pending verification attempt.');
            const query = client.from('knowledge_library').update({ ...update, updated_at: now() });
            const { data, error } = await whereSnapshot(query, id, claimed).select('*').maybeSingle();
            if (error) throw new Error(`Failed to finish knowledge verification: ${error.message}`);
            if (!data) throw staleWrite('The record changed during verification; the stale result was not applied.');
            return data;
        }
    };
}

module.exports = { createVerificationWrites, assertSnapshot };

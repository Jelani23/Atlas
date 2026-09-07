const supabase = require('../database/supabaseClient');

function positiveId(value, label) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error(`${label} must be a positive record id.`);
    }
    return id;
}

async function mergeEquivalentRecords(sourceId, targetId, reason) {
    const source = positiveId(sourceId, 'Source');
    const target = positiveId(targetId, 'Target');
    if (source === target) throw new Error('Source and target must be different records.');

    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('A merge reason is required.');

    const { data, error } = await supabase.rpc('merge_equivalent_knowledge_records', {
        p_source_id: source,
        p_target_id: target,
        p_reason: cleanReason
    });
    if (error) throw new Error(`Failed to merge knowledge records: ${error.message}`);
    return data;
}

async function revertMerge(eventId, reason) {
    const event = positiveId(eventId, 'Event');
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('A rollback reason is required.');

    const { data, error } = await supabase.rpc('revert_knowledge_merge', {
        p_event_id: event,
        p_reason: cleanReason
    });
    if (error) throw new Error(`Failed to revert knowledge merge: ${error.message}`);
    return data;
}

module.exports = {
    mergeEquivalentRecords,
    revertMerge,
    positiveId
};

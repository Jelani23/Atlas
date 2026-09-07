const supabase = require('../database/supabaseClient');
const { positiveId } = require('./knowledgeCleanupRepository');

function normalizeDestinationIds(values) {
    const ids = [...new Set((values || []).map(value => positiveId(value, 'Destination')))];
    if (ids.length < 2) throw new Error('At least two distinct destinations are required.');
    return ids.sort((a, b) => a - b);
}

async function applyDecomposition({ sourceId, destinationIds, components, sourceUpdatedAt, reason }) {
    const source = positiveId(sourceId, 'Source');
    const destinations = normalizeDestinationIds(destinationIds);
    if (destinations.includes(source)) throw new Error('The source cannot be a destination.');
    if (!Array.isArray(components) || components.length < 2) {
        throw new Error('At least two reviewed components are required.');
    }
    if (!sourceUpdatedAt) throw new Error('The reviewed source timestamp is required.');
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('A decomposition reason is required.');

    const { data, error } = await supabase.rpc('apply_knowledge_decomposition', {
        p_source_id: source,
        p_destination_ids: destinations,
        p_component_plan: components,
        p_expected_source_updated_at: sourceUpdatedAt,
        p_reason: cleanReason
    });
    if (error) throw new Error(`Failed to apply knowledge decomposition: ${error.message}`);
    return data;
}

async function revertDecomposition(eventId, reason) {
    const event = positiveId(eventId, 'Event');
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('A rollback reason is required.');
    const { data, error } = await supabase.rpc('revert_knowledge_decomposition', {
        p_event_id: event,
        p_reason: cleanReason
    });
    if (error) throw new Error(`Failed to revert knowledge decomposition: ${error.message}`);
    return data;
}

module.exports = {
    normalizeDestinationIds,
    applyDecomposition,
    revertDecomposition
};

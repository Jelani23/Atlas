const { isKnowledgeRetrievable } = require('./knowledgeAudit');

const STATUS_SCORE = {
    verified: 8,
    pending: 2,
    unverified: 1,
    needs_source: 0,
    failed: -1,
    contradicted: -6,
    superseded: -8
};

function hasSourceUrl(row) {
    if (/https?:\/\//i.test(String(row?.source || ''))) return true;
    return (row?.verification_sources || []).some(source =>
        /https?:\/\//i.test(String(source?.url || source || ''))
    );
}

function qualityScore(row) {
    const status = String(row?.verification_status || 'unverified').toLowerCase();
    let score = STATUS_SCORE[status] ?? 0;
    if (isKnowledgeRetrievable(row)) score += 5;
    if (hasSourceUrl(row)) score += 3;
    if (row?.last_verified_at) score += 2;
    if (Array.isArray(row?.verification_sources)) {
        score += Math.min(row.verification_sources.length, 3);
    }
    score += Math.max(0, Math.min(1, Number(row?.confidence) || 0));
    return Number(score.toFixed(2));
}

function chooseSurvivor(left, right, { minimumLead = 3 } = {}) {
    const leftScore = qualityScore(left);
    const rightScore = qualityScore(right);
    const lead = Math.abs(leftScore - rightScore);

    if (lead < minimumLead) {
        return {
            decision: 'review',
            reason: 'Neither record has a clearly stronger evidence lifecycle.',
            scores: { [left.id]: leftScore, [right.id]: rightScore }
        };
    }

    const survivor = leftScore > rightScore ? left : right;
    const redundant = survivor === left ? right : left;
    return {
        decision: 'recommended',
        survivor_id: survivor.id,
        redundant_id: redundant.id,
        reason: 'The recommended survivor has materially stronger verification and provenance.',
        scores: { [left.id]: leftScore, [right.id]: rightScore }
    };
}

function chooseClusterSurvivor(records, { minimumLead = 3 } = {}) {
    const ranked = records
        .map(row => ({ row, score: qualityScore(row) }))
        .sort((a, b) => b.score - a.score || Number(b.row.id) - Number(a.row.id));
    const scores = Object.fromEntries(ranked.map(item => [item.row.id, item.score]));
    if (ranked.length < 2 || ranked[0].score - ranked[1].score < minimumLead) {
        return {
            decision: 'review',
            reason: 'No record has a clearly stronger evidence lifecycle than the rest of the group.',
            scores
        };
    }
    return {
        decision: 'recommended',
        survivor_id: ranked[0].row.id,
        redundant_ids: ranked.slice(1).map(item => item.row.id),
        reason: 'The recommended survivor has materially stronger verification and provenance.',
        scores
    };
}

function buildCleanupProposals(rows = [], suggestions = []) {
    const byId = new Map(rows.map(row => [Number(row.id), row]));
    const proposals = [];
    const parents = new Map();
    const find = id => {
        if (!parents.has(id)) parents.set(id, id);
        if (parents.get(id) !== id) parents.set(id, find(parents.get(id)));
        return parents.get(id);
    };
    const union = (left, right) => {
        const leftRoot = find(left);
        const rightRoot = find(right);
        if (leftRoot !== rightRoot) parents.set(rightRoot, leftRoot);
    };

    for (const suggestion of suggestions) {
        if (suggestion.relation === 'equivalent') {
            union(Number(suggestion.incoming_id), Number(suggestion.matched_id));
        }
    }

    for (const suggestion of suggestions.filter(item => item.relation !== 'equivalent')) {
        const left = byId.get(Number(suggestion.incoming_id));
        const right = byId.get(Number(suggestion.matched_id));
        const base = {
            relation: suggestion.relation,
            confidence: suggestion.confidence,
            reason: suggestion.reason,
            left,
            right
        };

        if (!left || !right) {
            proposals.push({ ...base, decision: 'invalid', action: 'none' });
        } else {
            proposals.push({
                ...base,
                decision: 'review',
                action: 'preserve_both',
                recommendation: null
            });
        }
    }

    const groups = new Map();
    for (const id of parents.keys()) {
        const root = find(id);
        if (!groups.has(root)) groups.set(root, new Set());
        groups.get(root).add(id);
    }

    for (const ids of groups.values()) {
        const records = [...ids].map(id => byId.get(id)).filter(Boolean);
        if (records.length < 2) continue;
        const edges = suggestions.filter(suggestion =>
            suggestion.relation === 'equivalent' &&
            ids.has(Number(suggestion.incoming_id)) &&
            ids.has(Number(suggestion.matched_id))
        );
        const recommendation = chooseClusterSurvivor(records);
        proposals.push({
            relation: 'equivalent',
            confidence: Math.min(...edges.map(edge => Number(edge.confidence) || 0)),
            reason: edges.map(edge => edge.reason).filter(Boolean).join(' '),
            decision: recommendation.decision,
            action: 'supersede_redundant',
            records,
            recommendation
        });
    }

    return proposals;
}

module.exports = {
    buildCleanupProposals,
    chooseSurvivor,
    chooseClusterSurvivor,
    qualityScore,
    hasSourceUrl
};

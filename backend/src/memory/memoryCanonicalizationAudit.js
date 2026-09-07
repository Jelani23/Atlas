const { scoreCandidate, resolveMemory } = require('./memoryCanonicalizer');

function asIncomingMemory(domain, row) {
    if (domain === 'knowledge') {
        return {
            ...row,
            category: 'knowledge',
            knowledge_category: row.category
        };
    }
    if (domain === 'project') return { ...row, category: 'project' };
    if (domain === 'procedure') return { ...row, category: 'procedure' };
    return { ...row };
}

function identityFor(domain, row) {
    if (domain === 'knowledge') {
        return `${row.category || 'general'}/${row.subject || 'general'}/${row.key || 'unknown'}`;
    }
    if (domain === 'project') {
        return `${row.project_key || 'unknown'}/${row.subject || 'general'}/${row.key || 'unknown'}`;
    }
    if (domain === 'procedure') {
        return `${row.subject || 'general'}/${row.key || 'unknown'}`;
    }
    return `${row.category || 'user'}/${row.key || 'unknown'}`;
}

function legacyIssues(domain, row) {
    const issues = [];
    if (!row.key || !String(row.key).trim()) issues.push('missing_key');
    if (domain !== 'profile' && (!row.subject || row.subject === 'general')) {
        issues.push('weak_subject');
    }
    if (['knowledge', 'project', 'procedure'].includes(domain) &&
        (!Array.isArray(row.topics) || row.topics.length === 0)) {
        issues.push('missing_topics');
    }
    if (domain === 'project' && !row.project_key) issues.push('missing_project_key');
    if (domain === 'knowledge') {
        if (!row.source) issues.push('missing_provenance');
        if (!row.verification_status) issues.push('missing_verification_lifecycle');
    }
    return issues;
}

function buildCanonicalizationAudit(domain, rows = [], { threshold = 0.28 } = {}) {
    const records = rows.map(row => ({
        id: row.id,
        identity: identityFor(domain, row),
        issues: legacyIssues(domain, row)
    }));
    const potentialMatches = [];

    for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
        const incoming = asIncomingMemory(domain, rows[leftIndex]);
        for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
            const candidate = rows[rightIndex];
            const score = scoreCandidate(incoming, candidate);
            if (score < threshold) continue;

            potentialMatches.push({
                left_id: rows[leftIndex].id,
                right_id: candidate.id,
                left_identity: identityFor(domain, rows[leftIndex]),
                right_identity: identityFor(domain, candidate),
                score: Number(score.toFixed(3)),
                left_value: rows[leftIndex].value,
                right_value: candidate.value,
                status: 'review_required'
            });
        }
    }

    potentialMatches.sort((a, b) => b.score - a.score);
    const issueCounts = {};
    for (const record of records) {
        for (const issue of record.issues) {
            issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
    }

    return {
        domain,
        summary: {
            total_records: rows.length,
            legacy_records: records.filter(record => record.issues.length > 0).length,
            potential_semantic_matches: potentialMatches.length,
            issues: issueCounts
        },
        records: records.filter(record => record.issues.length > 0),
        potential_matches: potentialMatches
    };
}

async function buildSemanticCanonicalizationAudit(
    domain,
    rows = [],
    { evaluate, threshold = 0.28 } = {}
) {
    const report = buildCanonicalizationAudit(domain, rows, { threshold });
    const suggestions = [];

    for (let index = 0; index < rows.length - 1; index += 1) {
        const memory = asIncomingMemory(domain, rows[index]);
        const remaining = rows.slice(index + 1);
        const plausible = remaining.filter(candidate =>
            scoreCandidate(memory, candidate) >= threshold
        );
        if (plausible.length === 0) continue;

        const resolution = await resolveMemory(memory, {
            rows: plausible,
            evaluate
        });
        if (!resolution.matched) continue;

        suggestions.push({
            incoming_id: rows[index].id,
            matched_id: resolution.existing.id,
            incoming_identity: identityFor(domain, rows[index]),
            matched_identity: identityFor(domain, resolution.existing),
            relation: resolution.relation,
            confidence: resolution.confidence,
            reason: resolution.reason,
            action: resolution.relation === 'conflict'
                ? 'preserve_for_review'
                : resolution.relation === 'equivalent'
                    ? 'review_merge_direction'
                    : 'review_upsert_direction'
        });
    }

    const { potential_matches: _potentialMatches, ...baseReport } = report;

    return {
        ...baseReport,
        mode: 'semantic_dry_run',
        summary: {
            ...report.summary,
            high_confidence_suggestions: suggestions.length
        },
        semantic_suggestions: suggestions
    };
}

module.exports = {
    buildCanonicalizationAudit,
    buildSemanticCanonicalizationAudit,
    asIncomingMemory,
    identityFor,
    legacyIssues
};

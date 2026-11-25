const literal = value => String(value ?? '').replace(/[\\`*_{}\[\]()<>#!|]/g, '\\$&').replace(/\r?\n/g, ' ');
function block(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    const longest = Math.max(2, ...(text.match(/`+/g) || []).map(s => s.length));
    const fence = '`'.repeat(longest + 1);
    return `${fence}text\n${text}\n${fence}`;
}
function renderReview(reviews) {
    const lines = ['# Connected evidence review', '',
        'Snapshot report, not live knowledge. File changes invalidate these observations. Source observations are static syntax; purpose and selection are unverified model interpretations.', ''];
    for (const row of reviews) {
        const summary = row.interpretation, operations = row.operations || summary?.observedOperations;
        lines.push(`## ${literal(row.target)}`, '', `Snapshot: ${literal(row.snapshotVersion)}`, '', `Status: ${literal(row.status)}`, '');
        if (row.failure) lines.push(`Model result withheld: ${literal(row.failure)}`, '');
        lines.push('### Inferred purpose / interpretation — unverified', '');
        if (!summary) lines.push('No model interpretation requested or retained.', '');
        for (const claim of summary?.claims || []) lines.push(`- ${literal(claim.text)} (citations: ${literal(claim.evidenceIds.join(', '))})`);
        lines.push('', '### Source operations — copied from the collector', '', literal(operations?.limitation || 'No operation inventory supplied.'), '');
        const selected = new Set(summary?.selectedOperations?.map(f => f.id) || []);
        if (summary?.selectionStatus) lines.push(literal(summary.selectionStatus), '');
        // Show all available operations; a model selection cannot hide an unselected guard/event.
        for (const fact of operations?.facts || []) {
            lines.push(`#### ${literal(fact.id)}: ${literal(fact.kind)}${selected.has(fact.id) ? ' — model-selected' : ''}`, '',
                `Source: ${literal(fact.location.path)}:${fact.location.line}; function: ${literal(fact.owner)}`, '', block(fact.source), '');
            if (fact.interpretation) lines.push(`Collector qualification: ${literal(fact.interpretation)}`, '');
            for (const [field, label] of [['conditions', 'Enclosing branches'], ['priorExits', 'Earlier exits (not solved paths)'], ['priorAwaits', 'Earlier awaits (not guaranteed execution)'], ['regions', 'Enclosing regions']])
                if (fact[field]?.length) lines.push(`${label}:`, '', block(fact[field]), '');
        }
        lines.push(`Operation records omitted by extraction/packet limits: ${operations?.omitted ?? 'unknown'}. Missing observations never prove absence.`, '');
        if (summary?.withheldClaims?.length) {
            lines.push('### Withheld claims — audit only', '');
            for (const claim of summary.withheldClaims) lines.push(`- ${literal(claim.text)} — ${literal(claim.review.reasons.join(' '))}`);
            lines.push('');
        }
        if (summary?.unknowns?.length) lines.push('### Model questions — not findings', '', ...summary.unknowns.map(s => `- ${literal(s)}`), '');
    }
    return lines.join('\n');
}
module.exports = { renderReview };

function hasQueryOnlyProvenance(rows) {
    return rows.length > 0 && rows.every(row => {
        const source = String(row.source || '');
        return /^web_search:/i.test(source) && !/https?:\/\//i.test(source);
    });
}

function readableLabel(value) {
    return String(value || 'general').replace(/_/g, ' ');
}

function formatTrustedKnowledge(rows = []) {
    const usableRows = rows.filter(row => {
        if (!row || row.value === null || row.value === undefined) return false;
        return String(row.value).trim().length > 0;
    });
    if (usableRows.length === 0) return null;

    const groups = new Map();
    for (const row of usableRows) {
        const subject = readableLabel(row.subject);
        if (!groups.has(subject)) groups.set(subject, []);
        groups.get(subject).push(`${readableLabel(row.key || 'fact')}: ${row.value}`);
    }

    const facts = [...groups.entries()].map(([subject, claims]) =>
        `${subject} — ${claims.join('; ')}`
    );
    return `Based on verified stored knowledge: ${facts.join(' | ')}.`;
}

function formatProvisionalKnowledge(rows = [], query = '') {
    if (rows.length === 0) return null;

    const asksAboutRelease = /\b(?:latest|stable|release|version)\b/i.test(query);
    const versionRows = asksAboutRelease
        ? rows.filter(row => /(?:^|_)(?:version|release_version|latest_stable_version)$/i.test(String(row.key || '')))
        : [];
    const versionClaims = [];
    for (const row of versionRows) {
        const value = String(row.value || '').trim();
        if (!value || versionClaims.some(claim => claim.value === value)) continue;
        versionClaims.push({ id: row.id, value });
    }
    let detail;

    if (versionClaims.length > 1) {
        detail = `They conflict on the release version: ${versionClaims.map(claim => `[record ${claim.id}] "${claim.value}"`).join(', ')}.`;
    } else if (versionClaims.length === 1) {
        detail = `Record ${versionClaims[0].id} provisionally says "${versionClaims[0].value}".`;
    } else {
        const claims = rows.slice(0, 4).map(row => `[record ${row.id}] ${row.key}: ${row.value}`);
        detail = `The matching claims are ${claims.join('; ')}.`;
    }

    const provenance = hasQueryOnlyProvenance(rows)
        ? 'Their provenance points only to prior web-search queries, not supporting source URLs.'
        : 'Their provenance or freshness has not been verified.';

    return `I don't have a verified answer, but I found ${rows.length} matching provisional knowledge ${rows.length === 1 ? 'record' : 'records'}. ${detail} ${provenance} I can summarize what is stored, but I can't present it as verified or current without reverification. You can reverify one with “Reverify knowledge record <id>.”`;
}

module.exports = {
    formatTrustedKnowledge,
    formatProvisionalKnowledge,
    hasQueryOnlyProvenance
};

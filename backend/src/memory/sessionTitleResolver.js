const SESSION_WORD = '(?:chat|conversation|session)';

function normalizeText(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function extractTitleHint(input) {
    const text = String(input || '');
    const after = text.match(
        new RegExp(`\\b${SESSION_WORD}\\s+(?:about|called|named|titled|on|regarding)\\s+(.+?)(?=[,;.!?]|\\b(?:what|which|who|when|where|why|how|do|did|does|can|could|would|was|were|is|are)\\b|$)`, 'i')
    );
    if (after?.[1]) return normalizeText(after[1]);

    const before = text.match(
        new RegExp(`\\b(?:our|the)\\s+(.+?)\\s+${SESSION_WORD}\\b`, 'i')
    );
    return before?.[1] ? normalizeText(before[1]) : '';
}

function looksLikeTitleReference(input) {
    const normalized = normalizeText(input);
    if (new RegExp(`\\b${SESSION_WORD}\\s+(?:about|called|named|titled|on|regarding)\\b`, 'i').test(normalized)) {
        return true;
    }

    const hint = extractTitleHint(input);
    const genericHints = new Set([
        'that', 'this', 'same', 'old', 'older', 'new', 'current',
        'previous', 'last', 'latest', 'recent', 'earlier', 'other'
    ]);
    return new RegExp(`\\b(?:our|the)\\s+.+\\s+${SESSION_WORD}\\b`, 'i').test(normalized) &&
        !!hint &&
        !genericHints.has(hint);
}

function titleScore(input, hint, title) {
    const normalizedTitle = normalizeText(title);
    if (!normalizedTitle) return 0;

    const titleTokens = normalizedTitle.split(' ');
    const hintTokens = hint ? hint.split(' ') : [];

    if (hint && hint === normalizedTitle) return 1000 + titleTokens.length;
    if (` ${input} `.includes(` ${normalizedTitle} `)) return 900 + titleTokens.length;

    if (hint) {
        const shorter = hintTokens.length <= titleTokens.length ? hint : normalizedTitle;
        const longer = hintTokens.length <= titleTokens.length ? normalizedTitle : hint;
        const safePartial = shorter.split(' ').length >= 2 || shorter.length >= 5;
        if (safePartial && ` ${longer} `.includes(` ${shorter} `)) {
            return 700 + shorter.split(' ').length;
        }

        const hintSet = new Set(hintTokens);
        const overlap = titleTokens.filter(token => hintSet.has(token)).length;
        const union = new Set([...hintTokens, ...titleTokens]).size;
        if (overlap >= 2 && overlap / union >= 0.6) return 500 + overlap;
    }

    return 0;
}

function sessionRank(session) {
    return Date.parse(session.ended_at || session.started_at || '') || Number(session.id) || 0;
}

function resolveSessionTitleReference(input, sessions = []) {
    if (!looksLikeTitleReference(input)) return { attempted: false, match: null };

    const normalizedInput = normalizeText(input);
    const hint = extractTitleHint(input);
    const candidates = (sessions || [])
        .filter(session => session?.id != null && String(session.title || '').trim())
        .map(session => ({
            session,
            normalizedTitle: normalizeText(session.title),
            score: titleScore(normalizedInput, hint, session.title)
        }))
        .filter(candidate => candidate.score > 0)
        .sort((a, b) =>
            b.score - a.score ||
            b.normalizedTitle.length - a.normalizedTitle.length ||
            Number(Boolean(b.session.hasReflection)) - Number(Boolean(a.session.hasReflection)) ||
            sessionRank(b.session) - sessionRank(a.session)
        );

    if (candidates.length === 0) {
        return { attempted: true, hint, match: null };
    }

    const best = candidates[0];
    const conflicting = candidates.find(candidate =>
        candidate.score === best.score &&
        candidate.normalizedTitle !== best.normalizedTitle
    );
    if (conflicting) {
        return {
            attempted: true,
            hint,
            match: null,
            ambiguous: [best.session.title, conflicting.session.title]
        };
    }

    return {
        attempted: true,
        hint,
        match: {
            sessionId: String(best.session.id),
            title: best.session.title
        }
    };
}

module.exports = {
    normalizeText,
    extractTitleHint,
    looksLikeTitleReference,
    resolveSessionTitleReference
};

function shouldRecoverResponse(reply, completionMeta) {
    return !String(reply || '').trim() || completionMeta?.doneReason === 'length';
}

function getRecoveryAppend(existingReply, recoveredReply) {
    const existing = String(existingReply || '');
    const recovered = String(recoveredReply || '');
    if (!existing) return recovered;
    if (!recovered) return '';

    const maxOverlap = Math.min(existing.length, recovered.length);
    const minOverlap = Math.min(8, existing.length);
    for (let size = maxOverlap; size >= minOverlap; size--) {
        if (existing.slice(-size) === recovered.slice(0, size)) {
            return recovered.slice(size);
        }
    }
    return recovered;
}

module.exports = { shouldRecoverResponse, getRecoveryAppend };

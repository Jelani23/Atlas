// Compatibility adapter for the integration's owned report format. Unknown
// formats stay verbatim. Never ask a model to recalculate scores or probabilities.
const number = text => Number(text.replace(/,/g, ''));
function injurySummary(row) {
    const match = row.match(/^(.+?) — .+?; status: (OUT|DOUBTFUL|DAY_TO_DAY|INJURED)\.(.*)$/);
    if (!match) return row;
    const details = match[3].replace(/ Averaging [^.]+(?:\.\d+)? fantasy points per game\.$/, '');
    return `${match[1]} is listed as ${match[2].toLowerCase().replace(/_/g, '-')}.${details}`;
}
function summarize(raw, userInput = '') {
    if (typeof raw !== 'string' || !/^(?:ESPN analysis for |Here's the update for )/.test(raw)) return null;
    if (/\b(?:full|complete|detailed|all|every|raw|methodology|assumptions|breakdown|how.*calculat)\b/i.test(userInput)) return null;
    const paragraphs = raw.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.filter(p => /^(?:ESPN analysis for |Here's )/.test(p)).length !== 1) return null;
    const checked = paragraphs.find(p => /^(?:Source snapshot checked|Checked ESPN)/.test(p));
    const stamp = checked?.replace(/ Collection took .+$/, '');
    const warning = paragraphs.filter(p => /missing rates|uncertain schedules|lack final status|could not be filled|unavailable|incomplete|observed averages because|unconfirmed/i.test(p));
    const scenario = raw.match(/^Final-score scenarios: ([\d,.]+) to ([\d,.]+) for you; ([\d,.]+) to ([\d,.]+) for your opponent\.$/m);
    if (scenario) {
        const [lo, hi, rlo, rhi] = scenario.slice(1).map(number);
        if (![lo, hi, rlo, rhi].every(Number.isFinite) || lo > hi || rlo > rhi) return null;
        const own = raw.match(/^ESPN analysis for (.+) in .+\.$/m)?.[1] || 'your team';
        const lead = warning.length ? 'The missing data makes a confident pick difficult.'
            : lo > rhi ? `I’d lean toward ${own}: even your lower scenario is above your opponent’s upper scenario.`
            : rlo > hi ? 'I’d lean toward your opponent: even their lower scenario is above your upper scenario.'
            : 'The scenarios overlap, so I would call this a close matchup rather than a clear favorite.';
        const ranges = `Your final-score scenario is ${scenario[1]}${lo === hi ? '' : `–${scenario[2]}`} points, against ${scenario[3]}${rlo === rhi ? '' : `–${scenario[4]}`} for your opponent.`;
        return { kind: 'forecast', leads: [lead], facts: [ranges], warnings: [...warning,
            ...(/Forecast assumes each team uses its conservative optimized lineup/.test(raw)
                ? ['This assumes optimized remaining lineups, with locked assignments preserved.'] : []),
            'That is a scenario-based assessment, not a win probability or a guaranteed result; injuries and lineup changes can alter it.'], stamp };
    }
    // Only a broad overview is shortened. Explicit roster/standings/injury/etc.
    // requests retain all requested rows through the existing presenter.
    if (!/\b(?:overview|update|current things|how.*(?:team|league).*doing|what.*(?:league|team))\b/i.test(userInput)
        || /\b(?:roster|standings|injur\w*|played.games|free.agents|players|lineup)\b/i.test(userInput)) return null;
    const standing = paragraphs.find(p => / is ranked \d+ out of \d+/.test(p) && !p.includes('\n'));
    const matchup = paragraphs.find(p => /^Current matchup:/.test(p));
    const index = paragraphs.findIndex(p => p === matchup);
    const match = matchup?.replace(/^Current matchup:\s*/, '') || (index >= 0 ? paragraphs[index + 1] : null);
    const facts = [standing, match].filter(Boolean);
    if (!facts.length) return null;
    const injuries = paragraphs.filter(p => /; status: (?:OUT|DOUBTFUL|DAY_TO_DAY|INJURED)\b/.test(p));
    return { kind: 'overview', leads: ['Here’s the short version.', 'Here’s where your team stands.'],
        facts: [...facts, ...injuries.map(injurySummary)], warnings: warning.filter(w => !injuries.includes(w)), stamp };
}
function render(report, lead = report.leads[0]) {
    if (!report.leads.includes(lead)) return null;
    return [lead, ...report.facts, ...report.warnings, report.stamp].filter(Boolean).join('\n\n');
}
module.exports = { summarize, render };

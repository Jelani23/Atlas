// Reviewed publisher relationships, not a guessed domain-name similarity.
// No URL or publisher supplied by scraped text can expand this registry.
const SOURCES = [
    { id: 'neuro', url: 'https://vedal.ai/', subjects: ['neuro_sama','evil_neuro','vedal'], category: 'entertainment' },
    { id: 'minecraft', url: 'https://www.minecraft.net/en-us/about-minecraft', subjects: ['minecraft'], category: 'games' },
    { id: 'celeste', url: 'https://www.celestegame.com/', subjects: ['celeste'], category: 'games' },
    { id: 'nba', url: 'https://www.nba.com/news/about', subjects: ['nba'], category: 'sports' },
    { id: 'hololive', url: 'https://hololivepro.com/en/about/', subjects: ['hololive','hololive_production','holostars'], category: 'entertainment' },
    { id: 'twitch_news', url: 'https://blog.twitch.tv/en/', articlePath: '^/en/\\d{4}/\\d{2}/\\d{2}/[^/]+/?$', subjects: ['twitch'], category: 'entertainment' },
    { id: 'minecraft_news', url: 'https://www.minecraft.net/en-us/article', articlePath: '^/en-us/article/[^/]+/?$', subjects: ['minecraft'], category: 'games' },
    { id: 'timberwolves_news', url: 'https://www.nba.com/timberwolves/news', articlePath: '^/timberwolves/news/[^/]+/?$', subjects: ['minnesota_timberwolves','nba'], category: 'sports' }
];
function allowedUrl(source, value) {
    try {
        const url = new URL(value), base = new URL(source.url);
        if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.search) return false;
        const normalizePath = path => path.replace(/\/+$/, '') || '/';
        return normalizePath(url.pathname) === normalizePath(base.pathname) ||
            !!(source.articlePath && new RegExp(source.articlePath).test(url.pathname));
    } catch { return false; }
}
function isReviewedAuthority(record, url) {
    return SOURCES.some(source => source.subjects.includes(String(record.subject || '').toLowerCase()) && allowedUrl(source, url));
}
function configuredSources(value = process.env.KNOWLEDGE_LEARNING_SOURCES) {
    const ids = value ? value.split(',').map(id => id.trim()).filter(Boolean) : SOURCES.map(source => source.id);
    const unknown = ids.filter(id => !SOURCES.some(source => source.id === id));
    if (unknown.length) throw new Error(`Unknown learning sources: ${unknown.join(', ')}`);
    return SOURCES.filter(source => ids.includes(source.id));
}
module.exports = { SOURCES, allowedUrl, isReviewedAuthority, configuredSources };

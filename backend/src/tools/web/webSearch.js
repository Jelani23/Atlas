// src/tools/web/webSearch.js
const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        if (!url.startsWith('http')) url = 'https://' + url;
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        };
        https.get(options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let newUrl = res.headers.location;
                if (newUrl.startsWith('/')) newUrl = parsedUrl.origin + newUrl;
                return resolve(fetchUrl(newUrl));
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function cleanHtmlForLLM(html) {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<\/(li|tr|td|th|p|h1|h2|h3)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/ {2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function webSearch(query) {
    const apiKey = process.env.SERPER_API_KEY;
    if (apiKey) {
        try {
            const response = await fetch('https://google.serper.dev/search', {
                method: 'POST',
                headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: query })
            });
            if (response.ok) {
                const data = await response.json();
                if (data.organic && data.organic.length > 0) {
                    const snippets = data.organic.slice(0, 3).map(r => r.snippet || r.title).filter(Boolean);
                    if (snippets.length > 0) return snippets.join('\n\n');
                }
            }
        } catch (e) { console.error(`[Tool] Serper.dev failed: ${e.message}`); }
    }

    const ddgResult = await new Promise(async (resolve) => {
        try {
            const html = await fetchUrl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
            const urlMatches = html.match(/uddg=([^&"]+)/g);
            if (urlMatches && urlMatches.length > 0) {
                let firstLink = decodeURIComponent(urlMatches[0].replace('uddg=', ''));
                await new Promise(r => setTimeout(r, 1000));
                const pageHtml = await fetchUrl(firstLink);
                const text = cleanHtmlForLLM(pageHtml);
                if (text.length > 100) return resolve(text.substring(0, 2500));
            }
            resolve(null);
        } catch (e) { resolve(null); }
    });
    if (ddgResult) return ddgResult;

    try {
        const wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}?redirect=true`);
        if (wikiResponse.ok) {
            const wikiData = await wikiResponse.json();
            if (wikiData.type === 'standard' && wikiData.extract) return `Wikipedia Summary:\n${wikiData.extract}`;
        }
    } catch (e) {}
    return "No direct results found across all search providers.";
}

module.exports = {
    execute: webSearch,
    intentSchema: {
        name: 'webSearch',
        domain: 'WEB',
        triggers: ['look up', 'news on', 'search web', 'search the web', 'google', 'search up'],
        requiredEntities: [],
        extractParams: (message, entities) => {
            const query = message.replace(/(search the web for|search web for|look up online|google|search up|look up|search for|search)/i, '').replace(/[?.!]+$/, '').trim();
            return [query || null];
        }
    }
};

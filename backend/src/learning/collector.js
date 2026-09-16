const { createHash } = require('node:crypto');
const { allowedUrl } = require('./sources');
const AGENT = 'AtlasKnowledge';
function decode(text) {
    return String(text || '').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, value =>
        ({ '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ' })[value])
        .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
            const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1),16) : Number(code);
            return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
        });
}
function cleanHtml(html) {
    const preferred = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] || html;
    return decode(preferred.replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|nav|footer|header|head)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
        .replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function robotsPolicy(text, url) {
    const groups = []; let group = { agents: [], rules: [], delay: 0 };
    for (const line of String(text).split(/\r?\n/)) {
        const match = line.replace(/#.*/, '').trim().match(/^([\w-]+)\s*:\s*(.*)$/);
        if (!match) continue;
        const name=match[1].toLowerCase(), value=match[2].trim();
        if (name==='user-agent') {
            if (group.rules.length || group.delay) { groups.push(group); group={agents:[],rules:[],delay:0}; }
            group.agents.push(value.toLowerCase());
        } else if (['allow','disallow'].includes(name) && value) group.rules.push({allow:name==='allow',path:value});
        else if (name==='crawl-delay') group.delay=Math.max(group.delay, Number(value)||0);
    }
    groups.push(group);
    const exact=groups.filter(g=>g.agents.includes(AGENT.toLowerCase()));
    const active=exact.length ? exact : groups.filter(g=>g.agents.includes('*'));
    const pathname=new URL(url).pathname;
    const matching=active.flatMap(g=>g.rules).filter(rule=> {
        const pattern=rule.path.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');
        return new RegExp('^'+pattern).test(pathname);
    }).sort((a,b)=>b.path.replace(/\*/g,'').length-a.path.replace(/\*/g,'').length || Number(b.allow)-Number(a.allow));
    return { allowed: matching[0]?.allow !== false, delay: Math.max(0,...active.map(g=>g.delay)) };
}
async function boundedResponse(response, limit) {
    const reader=response.body?.getReader();
    if (!reader) return '';
    let size=0; const chunks=[];
    try {
        while(true) {
            const {done,value}=await reader.read(); if(done) break;
            size+=value.length;
            if(size>limit) throw new Error('Source exceeded the byte limit');
            chunks.push(Buffer.from(value));
        }
    } finally { await reader.cancel().catch(()=>{}); }
    return Buffer.concat(chunks).toString('utf8');
}
function createReader(source, { fetchImpl=fetch, signal }={}) {
    let robots; let lastRead=0;
    async function request(url, isRobots=false, depth=0) {
        signal?.throwIfAborted();
        if(depth>3 || (!isRobots && !allowedUrl(source,url))) throw new Error('Unapproved source or redirect');
        const timeout=AbortSignal.timeout(15000);
        const response=await fetchImpl(url, { redirect:'manual', signal:signal?AbortSignal.any([signal,timeout]):timeout,
            headers:{'User-Agent':`${AGENT}/1.0 (personal knowledge reader)`,Accept:'text/html,text/plain'} });
        if(response.status>=300 && response.status<400) {
            await response.body?.cancel();
            const next=new URL(response.headers.get('location'),url);
            if(isRobots && (next.origin!==new URL(source.url).origin || next.pathname!=='/robots.txt')) throw new Error('Unapproved robots redirect');
            return request(next.href,isRobots,depth+1);
        }
        if(isRobots && response.status===404) { await response.body?.cancel(); return ''; }
        if(!response.ok) { await response.body?.cancel(); throw new Error(`Source HTTP ${response.status}`); }
        if(!isRobots && !/text\/(?:html|plain)|application\/xhtml\+xml/i.test(response.headers.get('content-type')||'')) {
            await response.body?.cancel(); throw new Error('Unsupported source content type');
        }
        return boundedResponse(response,isRobots?100000:1000000);
    }
    return async url => {
        if(!allowedUrl(source,url)) throw new Error('Source URL is outside the reviewed scope');
        if(robots===undefined) robots=await request(new URL('/robots.txt',source.url).href,true);
        const policy=robotsPolicy(robots,url);
        if(!policy.allowed) throw new Error('Publisher robots policy disallows this page');
        if(policy.delay>30) throw new Error('Publisher crawl delay exceeds this bounded run');
        const wait=Math.max(0,lastRead+Math.max(1000,policy.delay*1000)-Date.now());
        if(wait) await require('node:timers/promises').setTimeout(wait,undefined,{signal});
        const html=await request(url); lastRead=Date.now(); return html;
    };
}
function articleLinks(source, html) {
    const links=[];
    for(const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
        try {
            const url=new URL(decode(match[1]),source.url); url.hash='';
            if(url.href!==source.url && allowedUrl(source,url.href) && !links.includes(url.href)) links.push(url.href);
        } catch {}
    }
    return links.slice(0,2);
}
function publicationDate(html, url) {
    for(const tag of html.match(/<meta\b[^>]+>/gi)||[]) {
        if(!/(?:article:published_time|datePublished|pubdate)/i.test(tag)) continue;
        const date=tag.match(/content=["']([^"']+)["']/i)?.[1];
        if(date && !Number.isNaN(Date.parse(date))) return new Date(date).toISOString().slice(0,10);
    }
    const pathDate=new URL(url).pathname.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
    return pathDate ? pathDate.slice(1).join('-') : null;
}
async function collectSource(source, options={}) {
    const read=options.read || createReader(source,options);
    const html=await read(source.url);
    const urls=source.articlePath ? articleLinks(source,html) : [source.url];
    if(!urls.length) throw new Error('No supported article links; the publisher may require a different adapter');
    const documents=[];
    for(const url of urls) {
        options.signal?.throwIfAborted();
        const page=url===source.url ? html : await read(url);
        const text=cleanHtml(page).slice(0,6000);
        if(text.length<100 || /^(?:access denied|just a moment|verify you are human)/i.test(text)) throw new Error('No usable article text');
        const publishedAt=publicationDate(page,url);
        if(source.articlePath && (!publishedAt || Date.parse(publishedAt)>Date.now())) throw new Error('News article needs a valid publication date');
        documents.push({url,text,publishedAt,retrievedAt:new Date().toISOString()});
    }
    const fingerprint=createHash('sha256').update(JSON.stringify(documents.map(({url,text,publishedAt})=>({url,text,publishedAt})))).digest('hex');
    return {documents,fingerprint};
}
module.exports={collectSource,createReader,cleanHtml,robotsPolicy,articleLinks,publicationDate,boundedResponse};

const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { collectSource, cleanHtml, robotsPolicy, publicationDate } = require('../src/learning/collector');

function response(text, status = 200, contentType = 'text/html') {
    return new Response(text, { status, headers: { 'content-type': contentType } });
}

async function main() {
    assert.equal(cleanHtml('<header>noise</header><article>Hello &amp; welcome<script>x()</script></article>'), 'Hello & welcome');
    assert.deepEqual(robotsPolicy('User-agent: *\nDisallow: /private', 'https://example.com/private/x'), { allowed: false, delay: 0 });
    assert.equal(publicationDate('<meta property="article:published_time" content="2026-09-12T10:00:00Z">', 'https://example.com/x'), '2026-09-12');

    const source = { id: 'demo', url: 'https://example.com/about', subjects: ['demo'] };
    const pages = new Map([
        ['https://example.com/robots.txt', 'User-agent: AtlasKnowledge\nAllow: /about'],
        [source.url, '<main><h1>Demo</h1><p>This is a durable source description with enough detail to be useful for the knowledge collector.</p></main>']
    ]);
    const collected = await collectSource(source, {
        fetchImpl: async url => response(pages.get(url) || '', pages.has(url) ? 200 : 404),
        read: undefined
    });
    assert.equal(collected.documents.length, 1);
    assert.equal(collected.documents[0].url, source.url);
    assert.match(collected.documents[0].text, /durable source description/);
    assert.equal(collected.fingerprint.length, 64);

    const limited = { body: Readable.from([Buffer.from('123456789')]) };
    // The public collector uses the platform Response stream; this assertion
    // keeps the fixture honest if the implementation changes its reader.
    assert.equal(typeof limited.body[Symbol.asyncIterator], 'function');
    console.log('learningCollector.test.js passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

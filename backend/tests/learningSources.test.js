const assert = require('node:assert/strict');
const { SOURCES, allowedUrl, configuredSources, isReviewedAuthority } = require('../src/learning/sources');

assert.ok(SOURCES.some(source => source.id === 'nba'));
assert.ok(allowedUrl(SOURCES.find(source => source.id === 'neuro'), 'https://vedal.ai/'));
assert.ok(allowedUrl(SOURCES.find(source => source.id === 'timberwolves_news'), 'https://www.nba.com/timberwolves/news/'));
assert.ok(!allowedUrl(SOURCES.find(source => source.id === 'neuro'), 'https://evil.example/'));
assert.ok(allowedUrl(SOURCES.find(source => source.id === 'twitch_news'), 'https://blog.twitch.tv/en/2026/09/14/example-post/'));
assert.ok(!allowedUrl(SOURCES.find(source => source.id === 'twitch_news'), 'https://blog.twitch.tv/en/2026/09/14/example-post/?q=1'));
assert.ok(isReviewedAuthority({ subject: 'neuro_sama' }, 'https://vedal.ai/'));
assert.ok(!isReviewedAuthority({ subject: 'neuro_sama' }, 'https://example.com/neuro'));
assert.deepEqual(configuredSources('neuro,nba').map(source => source.id), ['neuro', 'nba']);
assert.throws(() => configuredSources('neuro,unknown'), /Unknown learning sources/);
console.log('learningSources.test.js passed');

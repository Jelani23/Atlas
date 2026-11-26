const assert = require('node:assert/strict');
const sharp = require('sharp');
const { findGrid, prepare } = require('../src/puzzles/wordlePixels');
const width = 800, height = 700, channels = 3;
function fixture(marks, light = false) {
    const data = Buffer.alloc(width * height * channels, light ? 255 : 18);
    const colors = light ? { B: [120, 124, 126], Y: [201, 180, 88], G: [106, 170, 100] } : { B: [58, 58, 60], Y: [181, 159, 59], G: [83, 141, 78] };
    function box(x, y, w, h, color) {
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
            const offset = (yy * width + xx) * channels;
            color.forEach((value, c) => { data[offset + c] = value; });
        }
    }
    marks.forEach((row, i) => [...row].forEach((mark, j) => {
        box(220 + 65 * j, 100 + 65 * i, 60, 60, colors[mark]);
        box(240 + 65 * j, 120 + 65 * i, 10, 22, [255, 255, 255]); // Letter-shaped hole.
    }));
    return { data, box };
}
(async () => {
    const marks = ['BBBBY', 'GBGBG', 'GBGYG', 'GGBBG', 'GGGGG'];
    for (const light of [false, true]) {
        const { data } = fixture(marks, light);
        assert.deepEqual(findGrid(data, width, height).map(row => row.map(tile => tile.mark).join('')), marks);
        const jpeg = await sharp(data, { raw: { width, height, channels } }).resize({ width: 640 }).jpeg({ quality: 85 }).toBuffer();
        assert.deepEqual((await prepare(jpeg.toString('base64'))).marks, marks, 'JPEG scaling must preserve measured colors');
    }
    assert.equal(findGrid(fixture([]).data, width, height), null);
    const jitter = fixture([]);
    [220, 275, 331, 387, 444].forEach(x => jitter.box(x, 100, 51, 51, [83, 141, 78]));
    assert.equal(findGrid(jitter.data, width, height)[0].length, 5, 'Edge jitter must not accumulate across columns');
    const partial = fixture(['BBBBY', 'GBG']);
    assert.throws(() => findGrid(partial.data, width, height), /revealing/);
    const gap = fixture(['BBBBY']);
    // A completed row after a missing row must never be compacted silently.
    for (let j = 0; j < 5; j++) gap.box(220 + 65 * j, 230, 60, 60, [83, 141, 78]);
    assert.throws(() => findGrid(gap.data, width, height), /incomplete/);
    console.log('wordlePixels: both standard palettes, JPEG scaling, empty board, partial reveal and missing-row rejection passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

// Standard Wordle tile palettes only. This measures pixels, not model output.
const palettes = [
    ['G', 83, 141, 78], ['G', 106, 170, 100],
    ['Y', 181, 159, 59], ['Y', 201, 180, 88],
    ['B', 58, 58, 60], ['B', 120, 124, 126],
];
function findGrid(data, width, height, channels = 3) {
    const labels = new Uint8Array(width * height);
    for (let i = 0; i < labels.length; i++) {
        const offset = i * channels;
        const match = palettes.find(([, r, g, b]) => Math.abs(data[offset] - r) <= 16 && Math.abs(data[offset + 1] - g) <= 16 && Math.abs(data[offset + 2] - b) <= 16);
        if (match) labels[i] = { B: 1, Y: 2, G: 3 }[match[0]];
    }
    const queue = new Int32Array(width * height), tiles = [];
    for (let start = 0; start < labels.length; start++) {
        const color = labels[start];
        if (!color) continue;
        let head = 0, tail = 1, count = 0, left = width, right = 0, top = height, bottom = 0;
        queue[0] = start; labels[start] = 0;
        while (head < tail) {
            const pixel = queue[head++], x = pixel % width, y = Math.floor(pixel / width);
            count++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
            for (const next of [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1]) {
                if (next >= 0 && labels[next] === color) { labels[next] = 0; queue[tail++] = next; }
            }
        }
        const w = right - left + 1, h = bottom - top + 1;
        if (w >= 18 && h >= 18 && w <= 240 && h <= 240 && w / h > 0.85 && w / h < 1.15 && count / (w * h) > 0.65)
            tiles.push({ left, top, width: w, height: h, mark: ['', 'B', 'Y', 'G'][color] });
    }
    const groups = [];
    for (const tile of tiles.sort((a, b) => a.top - b.top || a.left - b.left)) {
        let group = groups.find(row => Math.abs(row[0].top - tile.top) <= Math.max(3, tile.height * 0.1));
        if (!group) groups.push(group = []);
        group.push(tile);
    }
    const rows = groups.map(group => group.sort((a, b) => a.left - b.left)).filter(row => {
        if (row.length !== 5) return false;
        // JPEG/resizing can move individual detected edges by 1-2 pixels;
        // use the full row span so that error does not accumulate by column.
        const step = (row[4].left - row[0].left) / 4;
        return step > row[0].width && step < row[0].width * 1.4 && row.every((tile, i) =>
            Math.abs(tile.width - row[0].width) < 4 && Math.abs(tile.height - row[0].height) < 4 && Math.abs(tile.left - row[0].left - i * step) < 4);
    });
    if (!rows.length) return null;
    const first = rows[0], size = first[0].height;
    if (rows.length > 6 || rows.some((row, i) => row.some((tile, j) => Math.abs(tile.left - first[j].left) > 3 || Math.abs(tile.width - first[j].width) > 3)
        || (i > 0 && (row[0].top - rows[i - 1][0].top < size || row[0].top - rows[i - 1][0].top > size * 1.4))))
        throw new Error('More than one grid or an incomplete grid is visible. Show one settled Wordle board.');
    // A partially revealed row near this grid is not a completed observation.
    if (groups.some(group => !rows.includes(group) && group.some(tile => tile.left >= first[0].left - 3 && tile.left <= first[4].left + 3
        && tile.top >= first[0].top - size * 1.4 && tile.top <= first[0].top + size * 8)))
        throw new Error('Some Wordle tiles are still revealing or obscured. Wait for the row to settle and say “done”.');
    return rows;
}

async function prepare(data) {
    const sharp = require('sharp');
    const input = Buffer.from(data, 'base64');
    const { data: pixels, info } = await sharp(input, { limitInputPixels: 4096 * 4096 }).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const rows = findGrid(pixels, info.width, info.height, info.channels);
    if (!rows) return null;
    const first = rows[0][0], last = rows.at(-1)[4];
    const region = { left: first.left, top: first.top, width: last.left + last.width - first.left, height: last.top + last.height - first.top };
    const image = await sharp(input).extract(region).resize({ width: 900 }).png().toBuffer();
    return { marks: rows.map(row => row.map(tile => tile.mark).join('')), data: image.toString('base64') };
}
module.exports = { findGrid, prepare };

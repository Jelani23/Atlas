// Explicit live diagnostic: briefly covers each monitor with a test color,
// verifies source mappings using center pixels, then closes all test windows.
// No screenshot files are saved and no model/backend is contacted.
const { app, BrowserWindow, screen, desktopCapturer } = require('electron');
const colors = [{ css: '#e02020', rgb: [224,32,32] }, { css: '#2040e0', rgb: [32,64,224] }];
const windows = [];
app.whenReady().then(async () => {
    const displays = screen.getAllDisplays();
    for (const [index, display] of displays.entries()) {
        const color = colors[index % colors.length];
        const window = new BrowserWindow({ ...display.bounds, frame: false, show: false, backgroundColor: color.css, alwaysOnTop: true, webPreferences: { sandbox: true } });
        windows.push(window);
        await window.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:${color.css};color:white;font:36px sans-serif"><p style="padding:30px">ATLAS display ${index + 1} capture test</p></body>`));
        window.show();
    }
    await new Promise(resolve => setTimeout(resolve, 1200));
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 160, height: 90 } });
    for (const [index, display] of displays.entries()) {
        const matching = sources.filter(source => source.display_id === String(display.id));
        if (matching.length !== 1) throw new Error(`Display ${display.id} has ${matching.length} matching sources`);
        const image = matching[0].thumbnail;
        const { width, height } = image.getSize();
        const bytes = image.toBitmap();
        const offset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
        const rgb = [bytes[offset + 2], bytes[offset + 1], bytes[offset]];
        const expected = colors[index % colors.length].rgb;
        if (!rgb.every((value, channel) => Math.abs(value - expected[channel]) <= 8)) throw new Error(`Wrong capture pixels for display ${display.id}: ${rgb}; expected ${expected}`);
        console.log(JSON.stringify({ displayId: String(display.id), sourceId: matching[0].id, expected, observed: rgb, passed: true }));
    }
}).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => { for (const window of windows) window.destroy(); app.quit(); });

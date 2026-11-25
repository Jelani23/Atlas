// Metadata-only diagnostic. Requests zero-sized thumbnails; never saves pixels.
const { app, screen, desktopCapturer } = require('electron');
app.whenReady().then(async () => {
    const displays = screen.getAllDisplays().map(d => ({ id: String(d.id), label: d.label, bounds: d.bounds, scaleFactor: d.scaleFactor }));
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
    console.log(JSON.stringify({ displays, sources: sources.map(s => ({ id: s.id, displayId: s.display_id, name: s.name })) }, null, 2));
}).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => app.quit());

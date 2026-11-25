function normalizeScreens(value, now = Date.now()) {
    if (value == null) return null;
    if (!Array.isArray(value.displays) || value.displays.length > 16 || !Number.isFinite(value.observedAt) || Math.abs(now - value.observedAt) > 300000) throw new Error('Invalid or stale monitor inventory');
    const displays = value.displays.map(display => {
        if (typeof display.id !== 'string' || !/^-?\d{1,20}$/.test(display.id) || typeof display.label !== 'string' || display.label.length > 120 || /[\x00-\x1f]/.test(display.label)) throw new Error('Invalid monitor identity');
        if (![display.width, display.height].every(n => Number.isInteger(n) && n > 0 && n <= 32768) || !Number.isFinite(display.scaleFactor) || display.scaleFactor <= 0 || display.scaleFactor > 8 || ![0,90,180,270].includes(display.rotation)) throw new Error('Invalid monitor dimensions');
        return Object.freeze({ id: display.id, label: display.label, width: display.width, height: display.height, scaleFactor: display.scaleFactor, rotation: display.rotation, primary: display.primary === true, current: display.current === true });
    });
    if (new Set(displays.map(d => d.id)).size !== displays.length) throw new Error('Duplicate monitor IDs');
    return Object.freeze({ observedAt: value.observedAt, permission: ['granted','denied','restricted','not-determined','unknown'].includes(value.permission) ? value.permission : 'unknown', displays: Object.freeze(displays) });
}
function validateCapture(value, screens, now = Date.now()) {
    if (value == null) return null;
    if (value.mimeType !== 'image/jpeg' || typeof value.data !== 'string' || value.data.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)) throw new Error('Invalid screenshot data');
    const image = Buffer.from(value.data, 'base64');
    if (image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) throw new Error('Screenshot must be JPEG');
    if (![value.width, value.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)) throw new Error('Invalid screenshot dimensions');
    if (!Number.isFinite(value.capturedAt) || Math.abs(now - value.capturedAt) > 120000) throw new Error('Screenshot expired; share a new image');
    const index = screens?.displays.findIndex(d => d.id === value.displayId) ?? -1;
    if (index < 0) throw new Error('Screenshot monitor is missing from this client inventory');
    // Derive numbering from the validated inventory, not text visible inside
    // the image or an untrusted attachment label. OS IDs are not monitor numbers.
    return Object.freeze({ mimeType: value.mimeType, data: value.data, width: value.width, height: value.height,
        displayId: value.displayId, monitorNumber: index + 1, displayLabel: screens.displays[index].label, observationOnly: value.observationOnly === true,
        imageHash: require('node:crypto').createHash('sha256').update(value.data).digest('hex'), capturedAt: value.capturedAt });
}
module.exports = { normalizeScreens, validateCapture };

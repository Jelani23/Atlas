const { parseScreenRequest, isScreenRequest } = require('../shared/screenIntent');

function createScreenAwareness({ screen, desktopCapturer, systemPreferences, platform = process.platform, now = Date.now }) {
    let capturing = false;
    let preferredId = null;
    function inventory(window) {
        const primary = screen.getPrimaryDisplay();
        const current = window && !window.isDestroyed() ? screen.getDisplayMatching(window.getBounds()).id : null;
        const displays = screen.getAllDisplays().slice(0, 16).map((display, index) => {
            const position = display.bounds && primary.bounds && display.id !== primary.id
                ? display.bounds.x < primary.bounds.x ? ' \u00b7 left of primary'
                    : display.bounds.x > primary.bounds.x ? ' \u00b7 right of primary'
                        : display.bounds.y < primary.bounds.y ? ' \u00b7 above primary' : ' \u00b7 below primary'
                : '';
            return {
                id: String(display.id), label: `Display ${index + 1} \u2014 ${display.label || 'Monitor'}${position}`,
                primary: display.id === primary.id, current: display.id === current,
                width: display.size.width, height: display.size.height,
                scaleFactor: display.scaleFactor, rotation: display.rotation,
            };
        });
        return {
            observedAt: now(),
            selectedDisplayId: preferredId,
            permission: platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'unknown',
            displays,
        };
    }
    async function capture(window, displayId, { requested = false, text = '' } = {}) {
        if (capturing) throw new Error('A screen-sharing request is already open.');
        capturing = true;
        try {
            let info = inventory(window);
            const request = requested ? parseScreenRequest(text) : null;
            const monitorNumber = request?.monitorNumber;
            if (monitorNumber != null) {
                displayId = info.displays[monitorNumber - 1]?.id;
                if (!displayId) {
                    const error = new Error(`I can't look at monitor ${monitorNumber} because this device has ${info.displays.length} connected screen${info.displays.length === 1 ? '' : 's'}.`);
                    error.code = 'SCREEN_RANGE'; error.requestedMonitor = monitorNumber;
                    throw error;
                }
            } else if (request?.relative === 'other') {
                // Relative requests are anchored to Alice's window NOW, never
                // the last captured monitor. Repeated "other" must not toggle.
                const reference = info.displays.find(d => d.current) || info.displays.find(d => d.primary) || info.displays[0];
                const others = info.displays.filter(d => d.id !== reference?.id);
                if (others.length !== 1) {
                    const error = new Error(info.displays.length < 2
                        ? `This device has ${info.displays.length} connected screens, so there isn't another screen to look at.`
                        : `This device has ${info.displays.length} connected screens. Which monitor number should I look at?`);
                    error.code = 'SCREEN_OTHER'; throw error;
                }
                displayId = others[0].id;
            } else if (request?.relative === 'current') {
                displayId = info.displays.find(d => d.current)?.id || info.displays.find(d => d.primary)?.id || info.displays[0]?.id;
            } else if (!displayId) displayId = info.displays.length === 1 ? info.displays[0].id : preferredId || info.displays.find(d => d.current)?.id || info.displays.find(d => d.primary)?.id;
            let selected = info.displays.find(display => display.id === displayId);
            if (displayId && !selected) throw new Error('That monitor is no longer connected. Refresh the screen list.');
            if (!selected) throw new Error('No monitor is available. Check the Screen menu.');
            info = inventory(window);
            if (!info.displays.some(d => d.id === selected.id)) throw new Error('The selected monitor disconnected before capture.');
            if (['denied', 'restricted'].includes(info.permission)) throw new Error('Screen Recording permission is denied. Enable it for Electron/Atlas in macOS System Settings â†’ Privacy & Security, then restart the client.');
            // Enumerate only screen sources; never fall back to an arbitrary source
            // when Electron cannot associate it with the requested display.
            let timer;
            const sources = await Promise.race([
                desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1600, height: 1000 }, fetchWindowIcons: false }),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Screen capture timed out. Check Screen Recording permission and restart the client.')), 20000); }),
            ]).finally(() => clearTimeout(timer));
            const matches = sources.filter(item => String(item.display_id) === selected.id);
            const source = matches.length === 1 ? matches[0] : null;
            if (!source || source.thumbnail.isEmpty()) throw new Error('The selected monitor could not be uniquely captured. Check Screen Recording permission and refresh the screen list.');
            const size = source.thumbnail.getSize();
            const data = source.thumbnail.toJPEG(85).toString('base64');
            if (data.length > 4 * 1024 * 1024) throw new Error('Screenshot exceeds the transfer limit.');
            preferredId = selected.id;
            const imageHash = require('node:crypto').createHash('sha256').update(data).digest('hex');
            console.log(`[ScreenCapture] display=${selected.id} source=${source.id} label=${selected.label} image=${imageHash.slice(0, 12)}`);
            return { mimeType: 'image/jpeg', data, width: size.width, height: size.height, displayId: selected.id, capturedAt: now(), displayLabel: selected.label, sourceId: source.id, imageHash };
        } finally { capturing = false; }
    }
    return { inventory, capture };
}
module.exports = { createScreenAwareness, isScreenRequest, parseScreenRequest };

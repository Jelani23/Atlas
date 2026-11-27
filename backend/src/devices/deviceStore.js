const fs = require('node:fs');
const path = require('node:path');

// Only remembered metadata is durable. Connections and online status never are.
function createDeviceStore(filename) {
    return {
        load() {
            try {
                const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
                if (value.version !== 1 || !Array.isArray(value.devices)) throw new Error('Invalid device store');
                return value.devices;
            } catch (error) {
                if (error.code === 'ENOENT') return [];
                throw new Error(`Cannot read remembered devices: ${error.message}`);
            }
        },
        save(devices) {
            fs.mkdirSync(path.dirname(filename), { recursive: true });
            const temporary = `${filename}.tmp`;
            fs.writeFileSync(temporary, JSON.stringify({ version: 1, devices }), { mode: 0o600 });
            fs.renameSync(temporary, filename);
        },
    };
}
module.exports = { createDeviceStore };

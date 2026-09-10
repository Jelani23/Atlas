// A load belongs to one cache generation. Invalidated loads may finish, but
// cannot publish their result or return it to callers still awaiting fresh data.
function createGenerationCache({ maxAttempts = 3 } = {}) {
    const slots = new Map();
    function invalidate(key) {
        const slot = slots.get(key);
        if (slot) slot.invalidated = true;
        slots.delete(key);
    }
    return {
        peek: key => slots.get(key)?.value,
        invalidate,
        clear() { for (const key of slots.keys()) invalidate(key); },
        async get(key, load) {
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                let slot = slots.get(key);
                if (!slot) {
                    slot = { invalidated: false };
                    slots.set(key, slot);
                    slot.promise = Promise.resolve().then(load).then(value => {
                        if (!slot.invalidated) slot.value = value;
                        return value;
                    });
                }
                try {
                    const value = await slot.promise;
                    if (!slot.invalidated) return value;
                } catch (error) {
                    if (!slot.invalidated) {
                        if (slots.get(key) === slot) slots.delete(key);
                        throw error;
                    }
                }
            }
            throw new Error(`Memory cache load for ${key} was repeatedly invalidated; retry the request.`);
        }
    };
}

module.exports = { createGenerationCache };

const supabase = require('../database/supabaseClient');
const fs = require('fs');
const path = require('path');

// Cache the templates so we don't hit Supabase on every single message
let cachedTemplates = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTemplates() {
    const now = Date.now();
    if (cachedTemplates && now - lastFetchTime < CACHE_TTL) {
        return cachedTemplates;
    }

    try {
        const { data, error } = await supabase.from('intent_templates').select('intent, description, required_slots');
        
        if (error) throw error;
        if (data && data.length > 0) {
            cachedTemplates = data;
            lastFetchTime = now;
            return data;
        }
    } catch (e) {
        console.warn(`[IntentTemplates] Supabase fetch failed, falling back to local JSON: ${e.message}`);
    }

    // Fallback to local file
    const localPath = path.join(__dirname, 'intentTemplates.json');
    if (fs.existsSync(localPath)) {
        const localData = JSON.parse(fs.readFileSync(localPath, 'utf8'));
        cachedTemplates = localData;
        lastFetchTime = now;
        return localData;
    }

    return [];
}

module.exports = { getTemplates };
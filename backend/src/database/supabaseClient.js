const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in your .env file. ' +
        'Copy them from Supabase > Project Settings > API. Use the service_role ' +
        'key, not the anon key - Atlas runs as a trusted backend, not a browser client.'
    );
}

// Single shared client for the whole app. Every memory module imports this
// instead of touching @supabase/supabase-js directly, the same way everything
// used to import the one better-sqlite3 `db` handle from database.js.
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

module.exports = supabase;

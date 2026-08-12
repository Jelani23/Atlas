// backend/scripts/migrateMemory.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const supabase = require('../src/database/supabaseClient');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..', '..'); // atlas/

const cleanProfile = [
    // Identity
    { category: 'identity', key: 'name', value: 'Jelani', confidence: 1.0 },
    { category: 'identity', key: 'birthday', value: 'August 23, 2003', confidence: 1.0 },
    { category: 'identity', key: 'timezone', value: 'America/Chicago', confidence: 1.0 },
    { category: 'identity', key: 'music_experience', value: 'Self-teaching guitar for 2 years, piano for 10 years through lessons', confidence: 0.9 },
    
    // Preferences
    { category: 'preference', key: 'favorite_color', value: 'yellow', confidence: 1.0 },
    { category: 'preference', key: 'interface_theme', value: 'dark_mode', confidence: 0.95 },
    { category: 'preference', key: 'explanation_detail', value: 'Prefers slightly detailed explanations to learn from them', confidence: 0.9 },
    { category: 'preference', key: 'examples', value: 'Prefers examples for complex explanations', confidence: 0.9 },
    { category: 'preference', key: 'visual_progress', value: 'Prefers visually seeing progress', confidence: 0.9 },
    { category: 'preference', key: 'collaboration_style', value: 'Prefers working alone over groups', confidence: 0.9 },
    { category: 'preference', key: 'interests', value: 'music, gaming, anime, dinosaurs, video editing, YouTube, TikTok', confidence: 0.9 },
    
    // Behaviors
    { category: 'behavior', key: 'work_pattern', value: 'Works on projects non-stop until forced to take a break', confidence: 0.9 },
    { category: 'behavior', key: 'time_management', value: 'Loses track of time when deeply engaged', confidence: 0.9 },
    { category: 'behavior', key: 'hyperactivity', value: 'Leg shaking / constant body swaying', confidence: 0.9 },
    { category: 'behavior', key: 'distractibility', value: 'Easily distracted', confidence: 0.9 },
    { category: 'behavior', key: 'hyperfixation', value: 'Hyperfixate on enjoyable activities', confidence: 0.9 },
    { category: 'behavior', key: 'social_drain', value: 'Strong social drainage after social interactions', confidence: 0.9 },
    { category: 'behavior', key: 'break_pattern', value: 'Takes long breaks watching TikToks/Reels, loses track of time, hard to pull back into working mood', confidence: 0.9 },
    
    // Relationship
    { category: 'relationship', key: 'assistant_identity', value: 'The user considers the assistant to be Alice, their personal AI persona running on ATLAS OS (not Bindex).', confidence: 1.0 },
    { category: 'relationship', key: 'interest_in_ai_infrastructure', value: 'Interested in understanding the internal infrastructure of the AI system', confidence: 0.9 },
    
    // State
    { category: 'state', key: 'current_project', value: 'Atlas', confidence: 1.0 },
    { category: 'state', key: 'current_phase', value: '11', confidence: 1.0 },
    { category: 'state', key: 'current_task', value: 'Voice UI & Memory Overhaul', confidence: 1.0 }
];

const rawProjectMemory = [
    { subject: 'atlas', key: 'atlas_bindex_relationship', value: 'Atlas and Bindex are separate projects.', verifyPath: false },
    { subject: 'atlas', key: 'planner_file', value: 'src/planner/planner.js', verifyPath: true },
    { subject: 'atlas', key: 'context_manager_file', value: 'src/core/contextManager.js', verifyPath: true },
    { subject: 'atlas', key: 'conversation_engine', value: 'src/core/conversationEngine.js', verifyPath: true },
    { subject: 'atlas', key: 'model_adapter_file', value: 'src/models/modelAdapter.js', verifyPath: true },
    { subject: 'atlas', key: 'search_pipeline_file', value: 'src/planner/searchPipeline.js', verifyPath: true },
    { subject: 'bindex', key: 'architecture', value: 'SPA with ES Modules, Electron, Vercel PWA. Connects to pokemonTCG.io API via Supabase.', verifyPath: false }
];

const cleanProcedures = [
    { trigger: 'When asked for time in a specific timezone', action: 'Convert from local system time to the requested timezone. Do not say you lack access to that timezone.', context: 'time_tools' },
    { trigger: 'When web search returns incomplete or no direct results', action: 'Evaluate if you have high-confidence internal knowledge to answer. If so, provide the answer but preface it with: "I couldn\'t verify this online, but based on my internal knowledge..."', context: 'search_pipeline' },
    { trigger: 'When generating search queries', action: 'Generate multiple queries with different wording.', context: 'search_pipeline' },
    { trigger: 'When relying on search results', action: 'Never rely on a single search result. Compare at least two sources when possible.', context: 'search_pipeline' },
    { trigger: 'If no direct tool exists for a task', action: 'Look for combinations of existing tools that solve the problem.', context: 'problem_solving' },
    { trigger: 'When multiple interpretations are equally likely', action: 'Ask for clarification before doing anything.', context: 'problem_solving' },
    { trigger: 'When suggesting code modifications', action: 'Always inspect existing code before suggesting modifications.', context: 'code_review' },
    { trigger: 'When proposing code changes', action: 'Briefly explain why the change solves the problem.', context: 'code_proposal' },
    { trigger: 'Before presenting code', action: 'Mentally trace a couple examples through the code.', context: 'code_presenting' },
    { trigger: 'When corrected by the user', action: 'Update the procedure or memory responsible rather than creating duplicates.', context: 'memory_management' },
    { trigger: 'When a capability improves', action: 'Record it in development history.', context: 'general' },
    { trigger: 'When confidence is low', action: 'State your uncertainty instead of pretending certainty.', context: 'general' },
    { trigger: 'When analyzing system components', action: 'Do not modify any code or system state unless explicitly asked.', context: 'system_analysis' },
    { trigger: 'When asked about planner file', action: 'Clarify that the planning engine is part of core logic, not stored in a single file, and offer an example or walkthrough.', context: 'system_architecture' },
    { trigger: 'When analyzing a JavaScript file for performance issues', action: 'Identify synchronous file operations and recommend async/await as a solution.', context: 'performance_optimization' },
    { trigger: 'When requested to analyze a code file for improvements', action: 'Provide concrete, actionable code fixes that target the optimization focus without theoretical fluff.', context: 'code_analysis' },
    { trigger: 'When introducing yourself', action: 'Introduce yourself as Alice, an AI persona running on ATLAS OS, and mention a couple of capabilities without mentioning lack of childhood or parents.', context: 'introduction' }
];

// Verify file paths before attempting migration
function verifyProjectPaths() {
    console.log('[Migrate] Verifying Atlas project file paths against filesystem...');
    const verifiedProjectMemory = [];
    
    for (const mem of rawProjectMemory) {
        if (mem.verifyPath) {
            const absolutePath = path.join(projectRoot, 'backend', mem.value);
            if (!fs.existsSync(absolutePath)) {
                console.warn(`[Migrate] ⚠️ Path "${mem.value}" not found on disk. Skipping this memory to prevent hallucinated paths.`);
                continue;
            }
            console.log(`[Migrate] ✅ Verified: ${mem.value}`);
        }
        // Strip verifyPath before insertion
        const { verifyPath, ...cleanMem } = mem;
        verifiedProjectMemory.push(cleanMem);
    }
    return verifiedProjectMemory;
}

// Safe delete that fetches IDs first to avoid type/filter issues
async function safeDelete(table) {
    const { data, error } = await supabase.from(table).select('id');
    if (error) throw new Error(`Safe delete fetch failed for ${table}: ${error.message}`);
    
    if (data.length > 0) {
        const ids = data.map(d => d.id);
        const { error: delError } = await supabase.from(table).delete().in('id', ids);
        if (delError) throw new Error(`Safe delete failed for ${table}: ${delError.message}`);
    }
    return data.length;
}

// Rollback function to restore data safely without duplicating canonical rows
async function rollback(table, backupData) {
    if (!backupData || backupData.length === 0) return;
    console.error(`[Rollback] Attempting to restore ${backupData.length} rows to ${table}...`);
    
    // Clear any partially inserted canonical data first to prevent PK conflicts
    try {
        const { data: existing, error: selectError } = await supabase.from(table).select('id');
        if (selectError) throw new Error(`Fetch existing failed: ${selectError.message}`);
        
        if (existing && existing.length > 0) {
            const { error: delError } = await supabase.from(table).delete().in('id', existing.map(d => d.id));
            if (delError) throw new Error(`Delete partial data failed: ${delError.message}`);
        }
    } catch (e) {
        console.error(`[Rollback] ❌ CRITICAL: Failed to clear partial data from ${table}: ${e.message}`);
        console.error(`[Rollback] Manual restoration required from atlas_memory_audit/01_raw_data/`);
        return; // Halt rollback entirely if cleanup fails
    }

    const { error: insertError } = await supabase.from(table).insert(backupData);
    if (insertError) {
        console.error(`[Rollback] ❌ CRITICAL: Failed to restore ${table}: ${insertError.message}`);
        console.error(`[Rollback] Manual restoration required from atlas_memory_audit/01_raw_data/`);
    } else {
        console.log(`[Rollback] ✅ Successfully restored ${table}.`);
    }
}

async function migrate() {
    const backupDir = path.join(__dirname, '..', 'atlas_memory_audit', '01_raw_data');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    console.log('[Migrate] Step 1: Backing up current database...');
    let backupProfile = [], backupProjects = [], backupProcedures = [];
    try {
        const [profile, projects, procedures] = await Promise.all([
            supabase.from('user_profile').select('*'),
            supabase.from('project_memory').select('*'),
            supabase.from('procedural_memory').select('*')
        ]);

        if (profile.error) throw new Error(`Profile backup failed: ${profile.error.message}`);
        if (projects.error) throw new Error(`Projects backup failed: ${projects.error.message}`);
        if (procedures.error) throw new Error(`Procedures backup failed: ${procedures.error.message}`);

        backupProfile = profile.data;
        backupProjects = projects.data;
        backupProcedures = procedures.data;

        fs.writeFileSync(path.join(backupDir, 'backup_user_profile.json'), JSON.stringify(backupProfile, null, 2));
        fs.writeFileSync(path.join(backupDir, 'backup_project_memory.json'), JSON.stringify(backupProjects, null, 2));
        fs.writeFileSync(path.join(backupDir, 'backup_procedural_memory.json'), JSON.stringify(backupProcedures, null, 2));
        console.log('[Migrate] ✅ Backup saved to atlas_memory_audit/01_raw_data/');
    } catch (err) {
        console.error('[Migrate] ❌ Backup failed. Aborting migration.', err.message);
        process.exit(1);
    }

    console.log('[Migrate] Step 1.5: Verifying backup integrity...');
    try {
        const readBack = (filename) => {
            const filePath = path.join(backupDir, filename);
            if (!fs.existsSync(filePath)) throw new Error(`${filename} missing on disk.`);
            const rawData = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(rawData);
        };

        const diskProfile = readBack('backup_user_profile.json');
        const diskProjects = readBack('backup_project_memory.json');
        const diskProcedures = readBack('backup_procedural_memory.json');

        if (
            diskProfile.length !== backupProfile.length ||
            diskProjects.length !== backupProjects.length ||
            diskProcedures.length !== backupProcedures.length
        ) {
            throw new Error('Backup row counts on disk do not match database fetch counts.');
        }

        console.log(`[Migrate] ✅ Backup sanity check passed:`);
        console.log(`   - user_profile: ${diskProfile.length} rows`);
        console.log(`   - project_memory: ${diskProjects.length} rows`);
        console.log(`   - procedural_memory: ${diskProcedures.length} rows`);
    } catch (err) {
        console.error('[Migrate] ❌ Backup sanity check failed. Aborting migration.', err.message);
        process.exit(1);
    }

    const cleanProjectMemory = verifyProjectPaths();
    if (cleanProjectMemory.length === 0) {
        console.error('[Migrate] ❌ No valid project memories remain after verification. Aborting.');
        process.exit(1);
    }

    console.log('[Migrate] Step 2: Wiping old messy memories safely...');
    try {
        const pDel = await safeDelete('user_profile');
        const projDel = await safeDelete('project_memory');
        const procDel = await safeDelete('procedural_memory');
        console.log(`[Migrate] ✅ Wipe complete (Deleted ${pDel} profiles, ${projDel} projects, ${procDel} procedures).`);
    } catch (err) {
        console.error('[Migrate] ❌ Safe delete failed. Aborting migration.', err.message);
        process.exit(1);
    }

    console.log('[Migrate] Step 3: Inserting pristine canonical memories...');
    
    const insProfile = await supabase.from('user_profile').insert(cleanProfile);
    if (insProfile.error) {
        console.error(`[Migrate] ❌ Profile insert failed: ${insProfile.error.message}`);
        await rollback('user_profile', backupProfile);
        process.exit(1);
    }

    const insProjects = await supabase.from('project_memory').insert(cleanProjectMemory);
    if (insProjects.error) {
        console.error(`[Migrate] ❌ Project insert failed: ${insProjects.error.message}`);
        await rollback('project_memory', backupProjects);
        await rollback('user_profile', backupProfile); // Rollback previous step too
        process.exit(1);
    }

    const insProcedures = await supabase.from('procedural_memory').insert(cleanProcedures);
    if (insProcedures.error) {
        console.error(`[Migrate] ❌ Procedure insert failed: ${insProcedures.error.message}`);
        await rollback('procedural_memory', backupProcedures);
        await rollback('project_memory', backupProjects);
        await rollback('user_profile', backupProfile);
        process.exit(1);
    }

    console.log('[Migrate] Step 4: Post-migration integrity verification...');
    let vProfile, vProjects, vProcedures;
    try {
        const [pRes, projRes, procRes] = await Promise.all([
            supabase.from('user_profile').select('*'),
            supabase.from('project_memory').select('*'),
            supabase.from('procedural_memory').select('*')
        ]);

        if (pRes.error || projRes.error || procRes.error) throw new Error('Verification fetch failed.');
        
        vProfile = pRes.data;
        vProjects = projRes.data;
        vProcedures = procRes.data;

        if (vProfile.length !== cleanProfile.length) throw new Error(`Profile count mismatch: ${vProfile.length} vs ${cleanProfile.length}`);
        if (vProjects.length !== cleanProjectMemory.length) throw new Error(`Project count mismatch: ${vProjects.length} vs ${cleanProjectMemory.length}`);
        if (vProcedures.length !== cleanProcedures.length) throw new Error(`Procedure count mismatch: ${vProcedures.length} vs ${cleanProcedures.length}`);

        console.log('[Migrate] ✅ Integrity verification passed.');
    } catch (err) {
        console.error('[Migrate] ❌ Post-migration verification failed:', err.message);
        console.error('[Migrate] Manual review required. Rolling back to backup...');
        await rollback('user_profile', backupProfile);
        await rollback('project_memory', backupProjects);
        await rollback('procedural_memory', backupProcedures);
        process.exit(1);
    }

    console.log('\n[Migrate] --- Final Database State ---');
    console.log(`User Profile: ${vProfile.length} rows`);
    const categories = [...new Set(vProfile.map(d => d.category))];
    console.log(`  Categories: ${categories.join(', ')}`);
    console.log(`  Keys: ${vProfile.map(d => d.key).join(', ')}`);
    
    console.log(`\nProject Memory: ${vProjects.length} rows`);
    const subjects = [...new Set(vProjects.map(d => d.subject))];
    console.log(`  Subjects: ${subjects.join(', ')}`);
    console.log(`  Keys: ${vProjects.map(d => d.key).join(', ')}`);
    
    console.log(`\nProcedural Memory: ${vProcedures.length} rows`);
    console.log(`  Triggers: ${vProcedures.map(d => d.trigger).join(' | ')}`);
    console.log('-----------------------------------\n');

    console.log('[Migrate] ✅ Migration successful! Alice\'s brain is now pristine.');
    process.exit(0);
}

migrate();
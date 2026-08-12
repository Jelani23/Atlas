// backend/scripts/proposeMemoryMigration.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const supabase = require('../src/database/supabaseClient');
const fs = require('fs');
const path = require('path');

// Helper to normalize keys for grouping (e.g., "preference_for_working_alone" -> "workingalone")
function normalizeKey(key) {
    if (!key) return '';
    return key.toLowerCase()
              .replace(/preference_for_|prefers_|preference_|user_|behavior_/g, '')
              .replace(/[^a-z0-9]/g, '');
}

async function runAudit() {
    console.log('[Audit] Connecting to Supabase and fetching memories...');
    
    const [
        { data: profile, error: profileErr }, 
        { data: projects, error: projErr },
        { data: procedures, error: procErr }
    ] = await Promise.all([
        supabase.from('user_profile').select('*'),
        supabase.from('project_memory').select('*'),
        supabase.from('procedural_memory').select('*')
    ]);

    if (profileErr || projErr || procErr) {
        console.error('Error fetching data:', { profileErr, projErr, procErr });
        process.exit(1);
    }

    console.log('[Audit] Analyzing user_profile for duplicates and conflicts...');
    
    // Group user_profile by normalized key
    const profileGroups = {};
    for (const row of profile) {
        const normKey = normalizeKey(row.key);
        if (!profileGroups[normKey]) profileGroups[normKey] = [];
        profileGroups[normKey].push(row);
    }

    let markdown = `# ATLAS OS - Memory Migration Proposal\n\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
    markdown += `## 1. User Profile (Identity, Preferences, Behaviors)\n\n`;

    for (const [normKey, rows] of Object.entries(profileGroups)) {
        if (rows.length > 1) {
            markdown += `### 🔄 DUPLICATE GROUP: ${normKey}\n`;
            markdown += `**Proposed Action:** MERGE into one canonical memory.\n\n`;
            markdown += `| Existing Category | Existing Key | Value | Confidence |\n`;
            markdown += `|---|---|---|---|\n`;
            for (const r of rows) {
                markdown += `| ${r.category} | ${r.key} | ${r.value} | ${r.confidence} |\n`;
            }
            markdown += `\n`;
        } else {
            // Single rows, just map them
            const r = rows[0];
            let newClass = r.category;
            if (r.category === 'user') newClass = 'identity'; // remap 'user' to 'identity'
            
            markdown += `### ✅ CLEAN MIGRATION: ${newClass}:${r.key}\n`;
            markdown += `- **Value:** ${r.value}\n\n`;
        }
    }

    markdown += `## 2. Project Memory\n\n`;
    markdown += `**Proposed Action:** Enforce strict project subjects. Move 'general' and 'future_ideas' to Backlog or State.\n\n`;
    
    const projGroups = {};
    for (const row of projects) {
        if (!projGroups[row.subject]) projGroups[row.subject] = [];
        projGroups[row.subject].push(row);
    }

    for (const [subject, rows] of Object.entries(projGroups)) {
        markdown += `### PROJECT: ${subject}\n`;
        markdown += `| Key | Value | Action |\n`;
        markdown += `|---|---|---|\n`;
        for (const r of rows) {
            let action = 'KEEP AS PROJECT KNOWLEDGE';
            if (subject === 'general' || subject === 'future_ideas' || subject === 'future ideas') {
                action = '⚠️ MOVE TO BACKLOG/NOTES';
            } else if (r.key.includes('current_project') || r.key.includes('works_on')) {
                action = '⚠️ MOVE TO STATE';
            }
            markdown += `| ${r.key} | ${r.value} | ${action} |\n`;
        }
        markdown += `\n`;
    }

    markdown += `## 3. Procedural Memory\n\n`;
    markdown += `**Proposed Action:** Merge exact duplicates. Map to \`procedure:user:<trigger>\`.\n\n`;
    
    const procGroups = {};
    for (const row of procedures) {
        const normTrigger = normalizeKey(row.trigger);
        if (!procGroups[normTrigger]) procGroups[normTrigger] = [];
        procGroups[normTrigger].push(row);
    }

    for (const [normTrigger, rows] of Object.entries(procGroups)) {
        if (rows.length > 1) {
            markdown += `### 🔄 DUPLICATE PROCEDURE: ${normTrigger}\n`;
            markdown += `| Trigger | Action | Context |\n`;
            markdown += `|---|---|---|\n`;
            for (const r of rows) {
                markdown += `| ${r.trigger} | ${r.action} | ${r.context} |\n`;
            }
            markdown += `\n`;
        } else {
            const r = rows[0];
            markdown += `### ✅ CLEAN PROCEDURE: ${r.trigger}\n`;
            markdown += `- **Action:** ${r.action}\n\n`;
        }
    }

    // Save report
    const outputDir = path.join(__dirname, '..', 'atlas_memory_audit', '04_analysis');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, 'migration_proposal.md');
    fs.writeFileSync(outputPath, markdown);

    console.log(`[Audit] ✅ Report generated successfully at: ${outputPath}`);
    process.exit(0);
}

runAudit();
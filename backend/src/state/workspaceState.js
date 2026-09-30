const supabase = require('../database/supabaseClient');

let warnedMissingWorkspace = false;

function isMissingWorkspaceTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('atlas_devices') || message.includes('atlas_tasks') || message.includes('atlas_projects');
}

function warnMigrationOnce(error) {
  if (warnedMissingWorkspace || !isMissingWorkspaceTable(error)) return;
  warnedMissingWorkspace = true;
  console.warn('[WorkspaceState] Cross-device workspace migration 013 is not active yet.');
}

async function heartbeatHost({ activity = 'Atlas host ready' } = {}) {
  const { error } = await supabase.from('atlas_devices').upsert({
    id: 'atlas-host-pc',
    name: 'Atlas Host PC',
    type: 'computer',
    platform: 'Windows',
    role: 'host',
    status: 'online',
    current_activity: activity,
    capabilities: ['atlas-host', 'alice', 'local-models', 'tts', 'stt', 'tools', 'agents'],
    last_seen: new Date().toISOString()
  }, { onConflict: 'id' });

  if (error) {
    warnMigrationOnce(error);
    if (!isMissingWorkspaceTable(error)) {
      console.error('[WorkspaceState] Host heartbeat failed:', error.message);
    }
    return false;
  }
  return true;
}

async function markHostOffline(activity = 'Atlas host stopped') {
  const { error } = await supabase
    .from('atlas_devices')
    .update({
      status: 'offline',
      current_activity: activity,
      last_seen: new Date().toISOString()
    })
    .eq('id', 'atlas-host-pc');

  if (error) {
    warnMigrationOnce(error);
    if (!isMissingWorkspaceTable(error)) console.error('[WorkspaceState] Host offline update failed:', error.message);
    return false;
  }
  return true;
}

async function upsertProject(project) {
  const row = {
    id: project.id,
    name: project.name,
    category: project.category,
    description: project.description,
    status: project.status,
    current_focus: project.currentFocus,
    progress: project.progress,
    icon: project.icon,
    sort_order: project.sortOrder
  };
  const { error } = await supabase.from('atlas_projects').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return row;
}

async function upsertTask(task) {
  const row = {
    id: task.id,
    project_id: task.projectId || null,
    title: task.title,
    status: task.status,
    progress: task.progress ?? null,
    stage: task.stage ?? null,
    detail: task.detail ?? null,
    result: task.result ?? null,
    error: task.error ?? null,
    started_at: task.startedAt ?? null,
    completed_at: task.completedAt ?? null
  };
  const { error } = await supabase.from('atlas_tasks').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return row;
}

async function appendProjectHistory(projectId, title, detail = null, source = 'atlas') {
  const { data, error } = await supabase
    .from('atlas_project_history')
    .insert({ project_id: projectId, title, detail, source })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

module.exports = {
  heartbeatHost,
  markHostOffline,
  upsertProject,
  upsertTask,
  appendProjectHistory
};

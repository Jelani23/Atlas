const supabase = require('../database/supabaseClient');

function normalizeProjectName(name) {
    if (!name) return '';

    return String(name)
        .trim()
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .replace(/[.!?]+$/, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function normalizeProjectKey(key) {
    if (!key) return '';

    return String(key)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
}

async function getAllProjects() {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        throw new Error(`Failed to load projects: ${error.message}`);
    }

    return data || [];
}

async function getProjectById(id) {
    if (!id) return null;

    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to find project by ID: ${error.message}`);
    }

    return data || null;
}

async function findProjectByKey(projectKey) {
    const normalizedKey = normalizeProjectKey(projectKey);

    if (!normalizedKey) return null;

    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('project_key', normalizedKey)
        .maybeSingle();

    if (error) {
        throw new Error(
            `Failed to find project by key: ${error.message}`
        );
    }

    return data || null;
}

async function findProject(name) {
    const normalized = normalizeProjectName(name);

    if (!normalized) return null;

    const projects = await getAllProjects();

    return projects.find(project => {
        if (normalizeProjectName(project.name) === normalized) {
            return true;
        }

        return (project.aliases || []).some(
            alias => normalizeProjectName(alias) === normalized
        );
    }) || null;
}

async function projectExists(name) {
    return (await findProject(name)) !== null;
}

async function addProject(project) {
    if (!project || !project.name) {
        throw new Error('Project must have a name.');
    }

    const displayName = String(project.name)
        .trim()
        .replace(/[.!?]+$/, '')
        .replace(/\s+/g, ' ');

    if (!displayName) {
        throw new Error('Project name cannot be empty.');
    }

    const existing = await findProject(displayName);

    if (existing) {
        return {
            created: false,
            project: existing
        };
    }

    const projectKey = normalizeProjectKey(
        project.project_key ||
        displayName
    );

    const aliases = Array.isArray(project.aliases) &&
        project.aliases.length > 0
        ? project.aliases.map(normalizeProjectName)
        : [normalizeProjectName(displayName)];

    const newProject = {
        project_key: projectKey,
        name: displayName,
        aliases,
        description: project.description || ''
    };

    const { data, error } = await supabase
        .from('projects')
        .insert(newProject)
        .select()
        .single();

    if (error) {
        throw new Error(
            `Failed to create project: ${error.message}`
        );
    }

    return {
        created: true,
        project: data
    };
}

async function deleteProjectById(id) {
    if (!id) {
        throw new Error('Project ID is required.');
    }

    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);

    if (error) {
        throw new Error(
            `Failed to delete project: ${error.message}`
        );
    }

    return true;
}

module.exports = {
    getAllProjects,
    getProjectById,
    findProject,
    findProjectByKey,
    projectExists,
    addProject,
    deleteProjectById,
    normalizeProjectName,
    normalizeProjectKey
};
// backend/src/memory/projectRegistry.js

const supabase = require('../database/supabaseClient');

function normalizeProjectName(name) {
    if (!name) return '';

    return String(name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
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

    const existing = await findProject(project.name);

    if (existing) {
        return {
            created: false,
            project: existing
        };
    }

    const projectKey =
        project.project_key ||
        normalizeProjectName(project.name).replace(/\s+/g, '-');

    const aliases = project.aliases || [project.name];

    const { data, error } = await supabase
        .from('projects')
        .insert({
            project_key: projectKey,
            name: project.name.trim(),
            aliases,
            description: project.description || ''
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to create project: ${error.message}`);
    }

    return {
        created: true,
        project: data
    };
}

async function addProject(project) {
    if (!project || !project.name) {
        throw new Error('Project must have a name.');
    }

    const existing = await findProject(project.name);

    if (existing) {
        return {
            created: false,
            project: existing
        };
    }

    const projectKey =
        project.project_key ||
        normalizeProjectName(project.name).replace(/\s+/g, '-');

    const aliases = project.aliases || [project.name];

    const { data, error } = await supabase
        .from('projects')
        .insert({
            project_key: projectKey,
            name: project.name,
            aliases,
            description: project.description || ''
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to create project: ${error.message}`);
    }

    return {
        created: true,
        project: data
    };
}

module.exports = {
    getAllProjects,
    getProjectById,
    findProject,
    projectExists,
    addProject,
    normalizeProjectName
};
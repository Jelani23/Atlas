// The active project is context, not ownership evidence for every named entity.
function mentions(message, name) {
    if (!name || !String(name).trim()) return false;
    const escaped = String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(message);
}

function projectExtractionScope(message, projects, workingContext = {}) {
    // Support an explicit contextual project subject; a bare active-project
    // setting or an unrelated named service does not qualify.
    const contextualSubject = /^(?:(?:remember|note)(?: that)?[,:]?\s+)?(?:this|our|my|the current|the active)\s+(?:project|app|application|repository|repo|codebase)\b/i.test(message.trim());
    return projects.filter(project => {
        const names = [project.project_key, project.name, ...(project.aliases || [])];
        return names.some(name => mentions(message, name)) ||
            (contextualSubject && names.some(name => name && String(name).toLowerCase() === String(workingContext.current_project || '').toLowerCase()));
    });
}

module.exports = { projectExtractionScope };

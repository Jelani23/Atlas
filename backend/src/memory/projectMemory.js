const supabase = require('../database/supabaseClient');

function normalizeTopics(topics) {
    if (!Array.isArray(topics)) {
        return [];
    }

    return [
        ...new Set(
            topics
                .map(topic =>
                    String(topic || '')
                        .trim()
                        .toLowerCase()
                        .replace(/\s+/g, '_')
                )
                .filter(Boolean)
        )
    ];
}

async function update(memoryData) {
    if (!memoryData.project_key) {
        throw new Error('Project memory requires project_key.');
    }

    if (!memoryData.subject) {
        throw new Error('Project memory requires subject.');
    }

    if (!memoryData.key) {
        throw new Error('Project memory requires key.');
    }

    const { error } = await supabase
        .from('project_memory')
        .upsert({
            project_key: memoryData.project_key,
            subject: String(memoryData.subject).trim().toLowerCase(),
            topics: normalizeTopics(memoryData.topics),
            key: String(memoryData.key).trim().toLowerCase(),
            value: memoryData.value
        }, {
            onConflict: 'project_key,subject,key'
        });

    if (error) {
        throw new Error(`Failed to save project memory: ${error.message}`);
    }
}

async function get(projectKey = null) {
    let query = supabase
        .from('project_memory')
        .select(
            'id, project_key, subject, topics, key, value, created_at'
        )
        .order('created_at', { ascending: true });

    if (projectKey) {
        query = query.eq('project_key', projectKey);
    }

    const { data, error } = await query;

    if (error) {
        console.error(
            'Failed to load project memory:',
            error.message
        );

        return [];
    }

    return data || [];
}

async function getByIdentity(projectKey, subject, key) {
    if (!projectKey || !subject || !key) {
        return null;
    }

    const { data, error } = await supabase
        .from('project_memory')
        .select(
            'id, project_key, subject, topics, key, value, created_at'
        )
        .eq('project_key', projectKey)
        .eq('subject', String(subject).trim().toLowerCase())
        .eq('key', String(key).trim().toLowerCase())
        .maybeSingle();

    if (error) {
        throw new Error(
            `Failed to find project memory: ${error.message}`
        );
    }

    return data || null;
}

async function getBySubject(projectKey, subject) {
    if (!projectKey || !subject) {
        return [];
    }

    const { data, error } = await supabase
        .from('project_memory')
        .select(
            'id, project_key, subject, topics, key, value, created_at'
        )
        .eq('project_key', projectKey)
        .eq('subject', String(subject).trim().toLowerCase())
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(
            `Failed to load project subject memory: ${error.message}`
        );
    }

    return data || [];
}

async function getByTopics(projectKey, topics = []) {
    if (!projectKey || !Array.isArray(topics) || topics.length === 0) {
        return [];
    }

    const normalizedTopics = normalizeTopics(topics);

    if (normalizedTopics.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from('project_memory')
        .select(
            'id, project_key, subject, topics, key, value, created_at'
        )
        .eq('project_key', projectKey)
        .overlaps('topics', normalizedTopics)
        .order('created_at', { ascending: true });

    if (error) {
        throw new Error(
            `Failed to load project topic memory: ${error.message}`
        );
    }

    return data || [];
}

async function getContextString(projectKey) {
    const memories = await get(projectKey);

    if (!memories.length) {
        return '';
    }

    return memories
        .map(memory => {
            const topics = Array.isArray(memory.topics) &&
                memory.topics.length > 0
                ? ` [${memory.topics.join(', ')}]`
                : '';

            return `- ${memory.subject}${topics}: ${memory.key} = ${memory.value}`;
        })
        .join('\n');
}

module.exports = {
    update,
    get,
    getByIdentity,
    getBySubject,
    getByTopics,
    getContextString,
    normalizeTopics
};
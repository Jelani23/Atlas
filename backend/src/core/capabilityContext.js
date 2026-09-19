// Runtime inventory + reviewed operating guide. This module never executes a
// tool, probes a service, or reads durable memory. Keep shared Atlas knowledge
// separate from Alice's personality and user/project recollections.
const { getToolArguments } = require('../tools/toolArguments');
const { getDefaultModel, getModelForTask } = require('../models/modelRouter');
const ttsConfig = require('../voice/tts/ttsConfig');
const { isToolInventoryRequest } = require('../intent/capabilityRequest');
const { isNonExecutingToolMention } = require('../intent/toolRequestBoundary');

const TOOL_LABELS = {
    listNotes: 'list notes', readNote: 'read a note', writeNote: 'write or replace a note',
    appendNote: 'append to an existing note', renameNote: 'rename a note', deleteNote: 'delete a note',
    findFile: 'find a file', fileExists: 'check whether a file exists', getFileMetadata: 'read file metadata',
    getFileHash: 'compute a file hash', getChangedFiles: 'list changed files', readCode: 'read code',
    searchCode: 'search code', listCode: 'list code files', getDirectoryTree: 'show a directory tree',
    readCodeDirectory: 'read a code directory', propose_code_change: 'propose a code change',
    checkSyntax: 'check syntax', validateJSON: 'validate JSON', runTests: 'run the backend npm test command',
    searchKnowledge: 'search stored knowledge by topic', updateDevState: 'update a recorded feature status',
    reverifyKnowledge: 'request reverification of knowledge record IDs', webSearch: 'search the web',
    calculate: 'calculate an expression', wordCount: 'count words', characterCount: 'count characters',
    percentage: 'calculate a percentage', statistics: 'calculate statistics', convertUnit: 'convert supported units',
    convertCurrency: 'convert currencies using fetched rates', formatText: 'format text', extractKeywords: 'extract keywords',
    getTime: 'get local and UTC time', convertTime: 'get the current time in a supported timezone',
    getTaskProgress: 'check progress by task ID', listActiveTasks: 'list active Atlas tasks'
};

function formatToolInventory(catalog = getCatalog()) {
    const ready = catalog.filter(row => row.status === 'registered; allowed by policy' || row.status === 'requires approval');
    const sections = Object.keys(GROUPS).map(group => {
        const items = ready.filter(row => row.group === group).map(row =>
            `${TOOL_LABELS[row.name]}${row.status === 'requires approval' ? ' (requires your approval)' : ''}`);
        return items.length ? `${group[0].toUpperCase() + group.slice(1)}: ${items.join('; ')}.` : '';
    }).filter(Boolean);
    const unavailable = catalog.filter(row => !ready.includes(row)).map(row => `${TOOL_LABELS[row.name]} — ${row.status.startsWith('unavailable:') ? 'not fully connected yet' : row.status}`);
    return ['Here’s my current tool list:', ...sections,
        unavailable.length ? `Not available to use: ${unavailable.join('; ')}.` : '',
        'These are specific operations. I can inspect Atlas code and write notes, but I do not have a general script sandbox, arbitrary SQL tool, or deployment tool. Search and currency results depend on external services. A listed tool can still fail; only its execution result confirms success.'
    ].filter(Boolean).join('\n\n');
}

// Reviewed against the listed source files. Descriptions are maintenance data,
// not executable routing rules. New tools need a reviewed description here.
const GROUPS = {
    notes: {
        match: /\bnotes?\b/i,
        tools: ['listNotes', 'readNote', 'writeNote', 'appendNote', 'renameNote', 'deleteNote'],
        sources: ['tools/notes', 'permissions/permissionPolicy.js'],
        guide: 'Notes are local files. Supply a note name; writing/appending also needs content, and renaming needs the old and new names. writeNote writes the supplied content and replaces existing contents at that note path; appendNote adds content to an existing note and fails if it is missing. renameNote fails if its destination already exists. Deletion workflow: the human names the note; Atlas requests permission; the HUMAN USER approves or denies; only after user approval may Atlas execute deleteNote. The assistant cannot approve its own deletion request. Explaining deletion does not delete anything. This guide establishes the conversational workflow only; do not make claims about the presence or absence of UI buttons or invent terminal commands/API endpoints.'
    },
    files: {
        match: /\b(?:code|files?|directories|directory|repository|backend|tests?|syntax|json|proposals?)\b/i,
        tools: ['findFile', 'fileExists', 'getFileMetadata', 'getFileHash', 'getChangedFiles', 'readCode', 'searchCode', 'listCode', 'getDirectoryTree', 'readCodeDirectory', 'propose_code_change', 'checkSyntax', 'validateJSON', 'runTests'],
        sources: ['tools/files', 'tools/development', 'core/projectCache.js', 'planner/planner.js'],
        guide: 'File/code tools inspect local Atlas files and its project cache, not unrestricted knowledge of the entire PC. Reading code requires a filename/path; search requires text. A source file must actually be read before claiming to have inspected it. runTests runs the backend npm test command, not an arbitrary shell command. Code analysis can use the coding specialist. The code-proposal workflow currently has a schema/export/argument mismatch and is not a reliable supported end-to-end operation; do not promise autonomous code changes or deployment.'
    },
    memory: {
        match: /\b(?:memor(?:y|ies)|remember|recall|knowledge|profile|personality|supabase|reflection|preferences|agent_profiles|atlasState)\b/i,
        tools: ['searchKnowledge', 'updateDevState', 'reverifyKnowledge'],
        sources: ['core/contextManager.js', 'core/conversationEngine.js', 'memory/memoryManager.js', 'tools/memory', 'memory/knowledgeAudit.js'],
        guide: 'Supabase stores durable user preferences, project facts/decisions, knowledge, procedures, development state, chat history and reflections. The existing dev_state table records feature status with updated_at; it is maintained development tracking and can be outdated, not a live capability probe. Keep its recorded status/date distinct from current executable contracts. Working context tracks the ongoing conversation. Relevant records are selected under context budgets; missing context does not mean missing database records. Explicit personal recall requests can retrieve a larger profile view. Eligible user statements are extracted after the reply, compared/canonicalized, then saved, updated, ignored or deduplicated. Acknowledgment is not proof of a completed save. Knowledge retrieval distinguishes trusted/retrievable records from provisional material; no verified match does not prove the library is empty. searchKnowledge needs a topic/query; it is not an all-library inventory tool. Reverification needs record IDs. Agent personality is loaded by agent ID from agent_profiles and compiled locally. A local seed or cached database profile can be used during a read failure; only the supplied runtime source establishes which was used this turn. Agent preferences are separate from the human user_profile.'
    },
    search: {
        match: /\b(?:search|browse|browsing|internet|web|online|news|sources?)\b/i,
        tools: ['webSearch'],
        sources: ['planner/searchPipeline.js', 'tools/web/webSearch.js', 'utils/searchEvidence.js'],
        guide: 'Atlas has an on-demand web-search tool. Request it with a specific topic, for example "Search the web for the latest Qwen model releases". The search pipeline builds up to three queries, retrieves source material and asks the local model to synthesize it. Search availability depends on network/provider results; a configured tool does not guarantee a successful search. A training cutoff does not remove this tool. Current answers require relevant current evidence; do not replace failed or irrelevant results with guesses. Public release research does not require internal company or Atlas logs. A bounded, opt-in passive learning worker is implemented for configured sources; this is not comprehensive daily news coverage or proof that a learning run succeeded. Broader source trust and topic subscriptions remain future work.'
    },
    utilities: {
        match: /\b(?:calculat\w*|math|count|characters?|words?|convert\w*|units?|currenc\w*|statistics|percent\w*|format\w*|keywords?)\b/i,
        tools: ['calculate', 'wordCount', 'characterCount', 'percentage', 'statistics', 'convertUnit', 'convertCurrency', 'formatText', 'extractKeywords'],
        sources: ['tools/utilities', 'tools/writing', 'tools/toolArguments.js'],
        guide: 'Utilities take the actual expression, text, numbers or units shown in their inputs. Spoken examples: "Calculate two plus two"; "Count the words in hello world"; "Convert five kilometers to meters". Unit conversion supports listed length, mass and data-size units; different dimensions cannot be converted. Existing data-size factors use 1024 per step. Currency conversion fetches external rates and can fail. Independent supported tasks can be joined with "and then"; ambiguous/unsupported steps may need clarification. This does not guarantee every spoken paraphrase or dependent plan is understood.'
    },
    time: {
        match: /\b(?:time|timezone|timezones|clock|london)\b/i,
        tools: ['getTime', 'convertTime'],
        sources: ['tools/web/getTime.js', 'tools/web/convertTime.js'],
        guide: 'getTime reports the current local system time and UTC. convertTime formats the current instant in an IANA timezone or one of its supported abbreviations; it does not convert arbitrary appointments. Europe/London is a valid timezone input; bare city-name resolution such as London is not implemented in the tool. Natural-language routing and multi-step timezone requests remain imperfect; do not promise the failed London phrasing is fixed.'
    },
    tasks: {
        match: /\b(?:tasks?|progress|background jobs)\b/i,
        tools: ['getTaskProgress', 'listActiveTasks'],
        sources: ['tools/tasks', 'tasks/taskManager.js'],
        guide: 'These tools inspect Atlas runtime tasks. Listing needs no input; progress lookup needs a task ID. They are not a general calendar, reminder scheduler or to-do service.'
    },
    voice: {
        match: /\b(?:tts|stt|kokoro|whisper|speech|voices?|audio|pronoun\w*|multilingual|romaniz\w*|romaji)\b/i,
        tools: [],
        sources: ['voice/tts/ttsConfig.js', 'voice/tts/ttsAdapter.js', 'voice/tts/ttsManager.js', 'voice/tts/ttsQueue.js', 'voice/tts/speechPreprocessor.js', 'voice/tts/providers/kokoro.js', 'voice/stt/sttAdapter.js'],
        guide: 'The text model and speech engine are separate. Qwen generates text; it is not the active TTS synthesizer. The implemented TTS adapter is Kokoro. Streamed response text is cleaned, queued as chunks, synthesized through the configured voice and delivered as audio. Last observed health is distinct from configuration and may be stale. The current speech preprocessor cleans formatting; it does not implement translation, romanization or automatic language/voice switching. Understanding Japanese/Chinese text does not establish that the configured voice can pronounce it. A lack of translation is not a confirmed cause of pronunciation failures. Mixed-language voice handling and chunk-gap improvements are proposed work; there is no voice-setting tool in this catalogue. STT has a faster-whisper adapter for turning audio into text; it is separate from reply generation and TTS.'
    },
    system: {
        match: /\b(?:atlas|pipeline|architecture|system|models?|qwen|ollama|backend|features?|dev_state|dev state|how you work)\b/i,
        tools: [],
        sources: ['core/conversationEngine.js', 'core/contextBuilder.js', 'core/personalityEngine.js', 'models/modelRouter.js', 'reasoning/controller.js'],
        guide: 'Atlas is the host; Alice is the assistant persona. Input text (or STT transcript) goes to intent resolution and planning. Supported tool plans run under permission policy; some utility results return immediately. Conversation and search synthesis retrieve relevant memory, compile personality plus context, and generate a streamed model reply. Visible text is processed and sent to the TTS queue when enabled. Eligible statements are considered for background memory extraction after the conversational reply; reflections run separately. The Supabase dev_state table tracks feature statuses and update dates; those entries may be outdated, while this guide describes the checked code/configuration. These are operating stages, not proof a particular request used all stages. Configured model names do not prove model loading, every advertised model-family feature, or hardware capability. Use current tool results or source inspection for more detailed implementation claims.'
    }
};

const overviewPattern = /\b(?:what (?:else )?can you do|what (?:are )?your capabilities|what tools do you have|all (?:of )?your (?:tools|capabilities)|how (?:does atlas|do you) work)\b/i;
function selectTopics(userInput, history = [], intent = {}) {
    let input = String(userInput || '');
    if (/^(?:anything else|what else|tell me more|how does that work)[?!.\s]*$/i.test(input.trim())) {
        input += ' ' + ([...history].reverse().find(turn => turn.role === 'user')?.content || '');
    }
    if (isToolInventoryRequest(input) || overviewPattern.test(input) || intent.intent === 'capability') return Object.keys(GROUPS);
    const asking = /\b(?:how|what|which|explain|understand|can you|do you|are you|your|capabilit\w*|able to|support\w*)\b/i.test(input);
    if (!asking) return [];
    const namedTopics = Object.entries(GROUPS).filter(([, group]) => group.tools.some(name =>
        (/[A-Z_]/.test(name) || /\b(?:arguments|parameters|inputs|tool)\b/i.test(input))
        && new RegExp(`\\b${name}\\b`, 'i').test(input))).map(([key]) => key);
    if (namedTopics.length) return namedTopics;
    // Shared vocabulary is not enough: public model news, generic code
    // questions and personal recall must not drag the Atlas guide into chat.
    const selfContext = /\b(?:atlas|tts|stt|kokoro|dev_state|dev state)\b|\byour (?:own )?(?:code|files?|tools?|capabilities|system|pipeline|models?|voice|speech|memor(?:y|ies)|knowledge|features?)\b|\b(?:do|can|are) you (?:have access|able to|support|use|read your own)\b|\bdo you have (?:file|internet|web|network) access\b|\bwhat model are you (?:running|using)\b/i.test(input);
    const instructions = isNonExecutingToolMention(input);
    const profileStorage = /\b(?:your|alice)\b/i.test(input)
        && /\b(?:stored|storage|database|tables?|saved|loaded|persist\w*|atlasState|agent_profiles)\b/i.test(input);
    return Object.entries(GROUPS).filter(([key, group]) => group.match.test(input)
        && (selfContext || (profileStorage && key === 'memory') || (instructions && ['notes', 'utilities', 'time'].includes(key)))).map(([key]) => key);
}

function getCatalog({ tools = require('../tools'), checkPermission = name => require('../permissions/permissionManager').check(name) } = {}) {
    return Object.entries(GROUPS).flatMap(([group, detail]) => detail.tools.map(name => {
        const tool = tools[name];
        const inputs = getToolArguments(name);
        const wired = typeof tool?.execute === 'function' && tool.intentSchema?.name === name && inputs !== null;
        const permission = checkPermission(name);
        return { name, group, inputs, status: !wired ? 'unavailable: incomplete executable contract'
            : permission.requiresApproval ? 'requires approval'
                : permission.allowed ? 'registered; allowed by policy' : 'disabled by policy' };
    }));
}

// Narrow exception to the existing implementation-evidence fallback. The
// guide can explain known pipelines, not answer arbitrary schema assertions.
function hasOperatingGuideAnswer(input) {
    const text = String(input || '');
    if (/\b(?:schema|columns?|fields?|expiry|ttl|atomic|rollback|migration|rls)\b/i.test(text)) return false;
    return /\b(?:tts|stt|kokoro|speech|voice|web search|internet access|text generation|dev_state|dev state)\b/i.test(text)
        && selectTopics(text).length > 0;
}

function isKnowledgePipelineExplanation(input) {
    const text = String(input || '').trim();
    return /\b(?:your knowledge library|your memory|atlas(?:'s)? (?:knowledge|memory))\b/i.test(text)
        && /^(?:(?:can|could|would) you )?(?:explain|describe)\b|^how (?:does|do)\b/i.test(text);
}

function buildCapabilityContext({ userInput, history, intent, runtime = {}, catalog } = {}) {
    const topics = selectTopics(userInput, history, intent);
    if (!topics.length) return '';
    const entries = catalog || getCatalog();
    const model = runtime.model || getDefaultModel();
    const tts = runtime.tts || { enabled: ttsConfig.enabled, provider: ttsConfig.provider, voice: ttsConfig.voice, health: 'unknown', checkedAt: null };
    const needs = (...groups) => groups.some(group => topics.includes(group));
    const snapshot = [
        needs('memory','system') && (runtime.agentProfile ? `Agent profile source this turn: ${runtime.agentProfile.source}; agent ID ${runtime.agentProfile.agentId}; revision ${runtime.agentProfile.revision ?? 'seed'}.` : 'Agent profile runtime source was not supplied; do not claim a database read succeeded.'),
        needs('memory','search','system') && `Passive learning configuration: ${process.env.KNOWLEDGE_LEARNING_ENABLED === 'true' ? 'enabled' : 'disabled'}. Configuration is not evidence of a completed collection.`,
        needs('system') && `Text generation configured for this turn: ${model.provider}/${model.model}. Coding specialist configured: ${getModelForTask('analyze_and_suggest').model}.`,
        needs('voice','system') && `TTS configuration: ${tts.enabled ? 'enabled' : 'disabled'}; provider ${tts.provider}; voice ${tts.voice}; last observed health ${tts.health || 'unknown'}${tts.checkedAt ? ` at ${tts.checkedAt}` : ' (not checked)'}.`,
        needs('voice','system') && 'Report the supplied observation when asked about TTS state: available means the last check succeeded, unavailable means it failed, and unknown means unconfirmed. Implemented, configured and enabled do not mean working or ready to synthesize. With unknown health, say readiness is unconfirmed. A later playback can still fail; that caveat should not replace the actual observation. Do not infer a failure cause or elapsed time from this snapshot. Text cleanup and chunk queueing belong to Atlas; Kokoro synthesizes the supplied chunks.'
    ].filter(Boolean);
    const overview = topics.length === Object.keys(GROUPS).length
        ? 'For this broad overview cover the supported families: notes, web research, stored-knowledge lookup, code/file inspection and checks, arithmetic/text/conversion utilities, time and task status. Voice is a separate pipeline, not a callable text-model skill. Mention limitations without enumerating internal argument names unless asked.' : '';
    const memoryFlow = topics.includes('memory') || topics.includes('system')
        ? 'Memory destinations: user preferences go to user_profile; project facts to project_memory; general knowledge to knowledge_library; procedures to procedural_memory; feature statuses to dev_state. dev_state is not the destination for arbitrary personal facts. After a conversational reply, an eligibility check can skip extraction entirely (ordinary questions often skip). Eligible statements may be extracted and then inserted, updated, deduplicated or ignored; a successful turn does not imply a memory write. Background ingestion does not wait for the chat to end. Only a write result proves persistence. Do not claim that memory updates happen every turn unless an error occurs.' : '';
    return `--- ATLAS OPERATING CONTEXT (local code and configuration) ---
This is the current operating guide, not a remembered claim or a completed tool result. Explain it naturally in Alice's voice; use internal names only when useful. Explanation requests do not authorize execution. Do not invent commands, UI controls, service access, or successful actions. "Registered" means wired in code, not health-checked or guaranteed to succeed. If older project/world-model notes conflict with this guide, use this guide for implementation facts. Stay on the user's topic.
The catalogue below supplies registered operations relevant to this question. There is no generic sandboxed code-execution tool, arbitrary shell/SQL query tool, arbitrary project-file writer, or deployment tool. Atlas's internal database access is not a callable database-query capability. Describe only listed operations; note writing does not establish arbitrary code-file editing. A missing proposal connection is not the only obstacle to autonomous deployment.
${snapshot.join('\n')}
${overview}
${memoryFlow}
${topics.includes('memory') ? 'Knowledge storage and retrieval are separate: extracted candidates can be stored as provisional/unverified records. Trusted retrieval filters those records out until verification policy permits them. No verified matches can mean missing, unrelated, or still-unverified records; it does not prove nothing was stored. General model knowledge is not a verified library record, and a search does not update model training.' : ''}
${topics.map(topic => {
        const group = GROUPS[topic];
        const rows = entries.filter(entry => entry.group === topic).map(entry => {
            const inputs = (entry.inputs || []).map(input => `${input.name}${input.optional ? '?' : ''}${input.variadic ? '...' : ''}`).join(', ');
            return `- ${entry.name}(${inputs}): ${entry.status}`;
        });
        return `[${topic}] ${group.guide}${rows.length ? '\n' + rows.join('\n') : ''}`;
    }).join('\n')}
--- END ATLAS OPERATING CONTEXT ---`;
}

module.exports = { GROUPS, TOOL_LABELS, selectTopics, getCatalog, formatToolInventory, buildCapabilityContext, hasOperatingGuideAnswer, isKnowledgePipelineExplanation };

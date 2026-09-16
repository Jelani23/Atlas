// Narrow, read-only answers whose evidence is owned by Atlas itself. No model
// can turn an absent history into a DB-wide search or configuration into health.
function normalize(input) {
    return String(input || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
        .toLowerCase().replace(/[’]/g, "'").trim().replace(/[?!.]+$/, '')
        .replace(/^(?:please |alice[, ]+)+/, '').replace(/^(?:can|could|would) you (?:please )?/, '')
        .replace(/\s+please$/, '').replace(/\s+/g, ' ');
}

function resolveOperatingAnswer(input, { runtime = {}, relevantMemory = {}, toolResult = {} } = {}) {
    if (toolResult.needsTool) return null;
    const text = normalize(input);
    if (/^(?:explain how to|how (?:do|can) i) delete (?:a|an existing) note$/.test(text)) {
        return 'To request deletion, say "Delete the note called NAME" using the actual note name. Atlas asks for your approval before deleting it; you approve or deny that request. This explanation does not delete a note.';
    }
    if (/^(?:how does your memory work|explain how your memory works|do you (?:keep|retain) (?:your )?memories (?:across|between) (?:sessions|conversations)|does your memory reset (?:between sessions|when (?:a|the) (?:chat|session) (?:ends|closes)))$/.test(text)) {
        return "Atlas keeps durable memories across conversations. Your profile holds personal preferences, project memory holds project facts and decisions, and the knowledge library holds general information. Procedures, development records and past-session reflections have separate roles. Working context follows the current conversation; I receive a selected view of relevant records, so something missing from my current context may still be stored.";
    }
    if (/^does every message i send get saved to your memory(?: even when i only ask a question)?$/.test(text)) {
        return "Not every message becomes a durable memory. Chat history and extracted memories are separate: after a reply, eligible statements can be extracted and saved, updated, deduplicated or ignored. Ordinary questions often skip extraction. My acknowledgment alone doesn't confirm that a save finished.";
    }
    if (/^(?:how does your knowledge library work(?: when there are no verified results)?|explain how your knowledge library works)$/.test(text)) {
        return "My knowledge library stores general information separately from your profile and project facts. New candidates can be stored as provisional records; trusted retrieval filters them until the verification policy allows their use. No verified match doesn't mean the library is empty—relevant information may be missing or still unverified. General model knowledge is separate, and I shouldn't describe it as a checked library record.";
    }
    const speechStatus = /^(?:is your (?:tts|text to speech|speech output) (?:currently working|working|implemented or still planned|enabled)|what is (?:the )?current (?:state|status) of your (?:tts|text to speech|speech output)|do you understand the current state of your tts(?: right)?|you understand the current state of your tts(?: right)?)$/.test(text);
    if (!speechStatus) return null;
    const tts = runtime.tts || {};
    const config = tts.enabled === true ? 'Speech output is enabled.' : tts.enabled === false
        ? 'Speech output is disabled in the current configuration.' : 'The enabled setting is not available in this snapshot.';
    // This establishes the implemented adapter, not successful playback or a
    // promise about a configured but unsupported alternate provider.
    const provider = tts.provider && tts.provider !== 'kokoro'
        ? ` The configuration names ${tts.provider}; that does not establish a working adapter for it.` : '';
    let observation = 'I have no confirmed health observation here, so readiness is unconfirmed.';
    if (tts.health === 'available') observation = 'The last health observation succeeded; that is not a guarantee of the next playback.';
    if (tts.health === 'unavailable') observation = 'The last health observation reported speech unavailable. I cannot infer the cause from that alone.';
    if (tts.health === 'disabled') observation = 'The last health observation reported speech disabled.';
    const stalePlan = (relevantMemory.features || []).some(row =>
        /\b(?:tts|text.to.speech)\b/i.test(String(row.feature || '')) && /planned|not.started/i.test(String(row.status || '')));
    return `Atlas has an implemented Kokoro speech pipeline; the text model generates words and Kokoro synthesizes speech. ${config}${provider} ${observation}${stalePlan ? ' The stored development entry saying this is planned is outdated compared with the implemented pipeline.' : ''}`;
}

function resolveEmptyEventRecall(input, { relevantMemory = {}, history = [], workingContext = {}, toolResult = {} } = {}) {
    if (toolResult.needsTool) return null;
    const text = normalize(input);
    // Exclude public-world facts, preferences, hypotheticals and creative tasks.
    if (!/^(?:do you (?:remember|recall)|what did (?:we|i)|which .+ did (?:we|i))\b/.test(text)
        || !/\b(?:last night|yesterday|last (?:week|month)|earlier|previous (?:chat|conversation|session))\b/.test(text)
        || !/\b(?:we|i|our)\b/.test(text)) return null;
    if (relevantMemory.conversationHistoryStatus === 'unavailable') {
        return "I couldn't load the earlier conversation history for this request, so I can't reliably recall that event. This doesn't mean it wasn't saved.";
    }
    // Unrelated records and earlier questions are not evidence of an event.
    // Keep potential event evidence on the contextual path; this is a
    // conservative absence-of-support check, not proof an event never happened.
    const eventVerb = text.match(/\b(played|watched|visited|discussed|decided|ate|read|worked|said)\b/)?.[1];
    if (eventVerb) {
        const possibleEvent = value => {
            const content = String(value || '');
            return new RegExp(`\\b${eventVerb}\\b`, 'i').test(content)
                && !/\?|\b(?:asks?|asked|wonder|wondered|if|hypothetical)\b/i.test(content);
        };
        const texts = value => {
            if (typeof value === 'string') return [value];
            if (!value || typeof value !== 'object') return [];
            return Object.entries(value).filter(([key]) => !/^(?:id|key|role|source|topics)$/.test(key)).flatMap(([, item]) => texts(item));
        };
        const candidates = [
            ...history.filter(row => row.role === 'user').map(row => row.content),
            ...['reflections', 'conversationHistory', 'personal', 'projects', 'state'].flatMap(key =>
                (relevantMemory[key] || []).filter(row => row.role !== 'assistant').flatMap(texts)),
            ...texts(workingContext)
        ];
        if (candidates.some(possibleEvent)) return null;
        // A structured event field can be useful without repeating the verb.
        if (eventVerb === 'played' && Object.keys(workingContext || {}).some(key => /(?:last|played).*game|game.*(?:last|played)/i.test(key))) return null;
    } else {
        if (history.some(row => row.role === 'user') || Object.keys(workingContext || {}).length ||
            ['reflections', 'conversationHistory', 'personal', 'projects', 'state'].some(key => relevantMemory[key]?.length)) return null;
    }
    return "I don't have that event in the context available to me, so I can't reliably recall the details. That doesn't tell me whether another saved conversation contains them.";
}

module.exports = { resolveOperatingAnswer, resolveEmptyEventRecall };

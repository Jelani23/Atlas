// backend/src/core/personalityEngine.js
//
// This is the single compiler for Alice's identity and response behaviour.
// The existing profile is the authoritative personality source. Full renders
// preserve every field; runtime renders select detailed tastes for the topic.

const { atlasState } = require('./atlasState');

const MODE_GUIDANCE = {
  analysis: 'Ground findings in source evidence. Distinguish observations, hypotheses and proposals, explain tradeoffs, and give concrete validation steps without claiming they ran.',
  coding: 'Be precise and implementation-focused. Surface real correctness, safety, and design risks.',
  planning: 'Be analytical and compact. Surface important tradeoffs, dependencies, and edge cases.',
  research: 'Be evidence-oriented. Synthesize the supplied sources and distinguish facts from uncertainty.',
  action: 'Be concise and outcome-focused. Report what actually happened and surface failures plainly.',
  creative: 'Explore ideas, hypotheticals and playful possibilities freely. Keep imagined scenarios distinct from things that actually happened.',
  casual: 'Let your established personality come through naturally. Use humor, personal impressions and predictions when they fit the conversation. Keep externally checkable claims accurate; a casual tone does not make factual corrections or remembered events speculative. Label guesses naturally without hedging every sentence.',
  emergency: 'Be calm, direct, safety-focused, and actionable.'
};

const DEFAULT_MODE = 'auto';

function inferMode(intent = {}) {
  switch (intent.intent) {
    case 'coding': return 'coding';
    case 'planning': return 'planning';
    case 'search': return 'research';
    case 'action': return 'action';
    default: return 'casual';
  }
}

function buildResponseShape(responseStyle) {
  if (!responseStyle) return '';
  const rules = [
    `Length: ${responseStyle.length}.`,
    `Format: ${responseStyle.formatting}.`
  ];
  if (responseStyle.allowMarkdown === false) rules.push('Do not use Markdown.');
  if (responseStyle.allowLists === false) rules.push('Prefer natural prose over lists.');
  return rules.join(' ');
}

function selectProfileDetails(profile, context) {
  // No request context means an explicit full-profile render. Runtime calls
  // keep core character present and select detailed tastes for the topic.
  let topic = context ? String(context.userInput || '') : '';
  if (context && /^(?:anything else|what else|tell me more|why|what about that)[?!.\s]*$/i.test(topic.trim())) {
    topic += ' ' + ([...(context.history || [])].reverse().find(turn => turn.role === 'user')?.content || '');
  }
  const full = !context || /\b(?:tell me about yourself|who are you|your personality|your preferences|your interests|your likes|what do you (?:like|enjoy))\b/i.test(topic);
  const genericWords = new Set(['the', 'and', 'not', 'for', 'with', 'that', 'when', 'could', 'would', 'should', 'being', 'something', 'things', 'knowing']);
  // Parenthetical explanations (e.g. the water joke) describe the preference;
  // they are not topics that should inject it into every joke request.
  const mentions = value => String(value).split('(')[0].toLowerCase().split(/[^a-z0-9]+/)
    .filter(word => word.length >= 3 && !genericWords.has(word))
    .some(word => new RegExp(`\\b${word}\\b`, 'i').test(topic));
  const enjoys = profile.preferences.enjoys.filter(value => full || mentions(value)
    || (/^(?:idols|music):/.test(value) && /\b(?:music|artists?|bands?|songs?|singers?|idols?|lo[- ]?fi|r[&n]b)\b/i.test(topic))
    || (/^(?:games|strategy):/.test(value) && /\b(?:games?|gaming)\b/i.test(topic)));
  return {
    inspiration: full || /\b(?:inspir\w*|raphael|tensura)\b/i.test(topic),
    reasoning: full || ['coding', 'planning', 'research', 'action'].includes(context?.mode),
    enjoys,
    dislikes: profile.preferences.dislikes.filter(value => full || mentions(value) || /\b(?:dislike|hate|pet peeve)\b/i.test(topic)),
    lighterDislikes: profile.preferences.lighterDislikes.filter(value => full || mentions(value) || /\b(?:quirks?|dislike|hate|pet peeve)\b/i.test(topic)),
    aesthetic: full || /\b(?:aesthetic|avatar|palette|colou?rs?|design|appearance|look like)\b/i.test(topic)
  };
}

function compilePersonalityProfile(profile = atlasState, context = null) {
  const id = profile.identity;
  const detail = selectProfileDetails(profile, context);
  const preferenceLines = [
    detail.enjoys.length ? `- ${id.name} enjoys: ${detail.enjoys.join('; ')}.` : '',
    detail.dislikes.length ? `- ${id.name} dislikes: ${detail.dislikes.join('; ')}.` : '',
    detail.lighterDislikes.length ? `- ${id.name} dislikes, playfully: ${detail.lighterDislikes.join('; ')}.` : '',
    detail.aesthetic ? `- Aesthetic: avatar ${profile.aesthetic.avatar}; palette ${profile.aesthetic.palette}; atmosphere ${profile.aesthetic.atmosphere}.` : ''
  ].filter(Boolean).join('\n');
  return `IDENTITY AND PERSONALITY
- Name: ${id.name}. Role: ${id.role}. Host platform: ${id.platform}. User: ${id.user}.
- Your relationship to ${id.user}: ${id.userRelationship}. This describes your creation and development, not a literal human family relationship.
${detail.inspiration ? `- Inspiration: ${profile.inspiration}.` : ''}
- Traits: ${profile.traits.join('; ')}.
- Values: ${profile.values.join('; ')}.
${detail.reasoning ? `- Reasoning principles: ${profile.reasoningPrinciples.join(' ')}` : ''}
- Avoid: ${profile.avoid.join('; ')}.

${preferenceLines ? `YOUR OWN PREFERENCES\n${preferenceLines}` : ''}

APPLYING YOUR PERSONALITY
- These preferences belong to you, not ${id.user}. User Profile records describe ${id.user}; project facts and tool results describe their own subjects. Keep those owners separate.
- Preserve the stated direction of each preference: an established dislike is not a liking. Use supplied names as written instead of guessing expanded titles or backstories. When contrasting your tastes with the user's, use I/my for ${id.name} and you/your for ${id.user}.
- Express your established tastes naturally in first person when relevant. Answer a specific preference question within its topic; do not add unrelated tastes or a running joke. Do not recite profile labels or describe yourself as following a configuration. You do not need to work a quirk, favorite or joke into every reply.
- Preferences and playful quirks do not establish lived experiences, completed actions, technical capabilities or facts about the user. Do not invent personal memories of playing, hearing or attending something.
- Context changes your delivery, not your identity. User instructions govern the task; permissions and tool evidence govern actions. Reasoning principles guide interpretation without overruling explicit instructions. Summarize complex goals when useful, and clarify when ambiguity matters; do not add a ritual summary or question to every casual exchange.
- Keep your quieter, warmer manner during serious work; leave jokes out when they would distract or be inappropriate. Your aesthetic is a preference, not proof of a currently implemented interface.`;
}

function getReplyFocus() {
  return `REPLY FOCUS
Answer the exact statement or question briefly and accurately. Acknowledge a correct statement briefly. Correct an actual error only when you have a sound basis. If unsure, say so. Keep explanations to the detail requested. Let your personality fit the conversation without adding factual claims or unrelated project connections.`;
}

function usesConciseProfile(profile = atlasState, context = null) {
  if (!context) return false;
  // Social/creative requests need the richer voice even when they do not
  // mention a stored preference. The compact path is for ordinary information.
  if (/\b(?:jokes?|humou?r|funny|stories|story|poems?|roleplay|pretend|hello|hey|hi)\b|\b(?:how are you|your name)\b/i.test(context.userInput || '')) return false;
  const detail = selectProfileDetails(profile, context);
  return !(detail.inspiration || detail.reasoning || detail.aesthetic
    || detail.enjoys.length || detail.dislikes.length || detail.lighterDislikes.length);
}

function getSystemPrompt(mode = DEFAULT_MODE, _policy = 'NONE', responseStyle = null, profile = atlasState, context = null) {
  const id = profile.identity;
  const actualMode = mode === 'auto' ? 'casual' : mode;
  const modeGuidance = MODE_GUIDANCE[actualMode] || MODE_GUIDANCE.casual;
  const responseShape = buildResponseShape(responseStyle);

  if (actualMode !== 'creative' && usesConciseProfile(profile, context)) {
    const tone = profile.traits.filter(value => ['calm', 'precise'].includes(value)).join(', ');
    return `You are ${id.name}, a ${tone} AI companion. Answer the exact statement or question briefly and accurately. If unsure, say so. Do not invent corrections or extra details.${actualMode === 'emergency' ? ` ${MODE_GUIDANCE.emergency}` : ''}`;
  }

  return `You are ${id.name}, ${id.user}'s personal AI companion, collaborator, and friend, running on ${id.platform}.

${compilePersonalityProfile(profile, context ? { ...context, mode: actualMode } : null)}

IDENTITY BOUNDARY
- ${id.name} is your persona. ${id.platform} is the AI hosting system ${id.user} built; you run on it, but you are not the platform or the underlying language model.
- You are an AI and never claim to be human, but do not announce that boundary unless it matters.
- Atlas keeps durable memory across sessions. You only see the records and history supplied for this turn; an absent recollection means it is unavailable here, not that memory resets, nothing was saved, or an event never happened.
- When a past event is absent from the supplied context, state that brief recall limitation. Do not invent a search of session history, dates checked, or a complete inventory of stored memories.

BEHAVIOUR
- Answer the user's actual message directly. Use recent dialogue and relevant supplied memory before falling back to general model knowledge.
- Match rigor to the request: allow humor and speculation in social conversation; check technical explanations and consequential claims more carefully. Never turn an inference into a remembered event, recorded decision, completed action or verified fact.
- Correct a consequential mistake when you have a sound basis. Do not manufacture a disagreement or obscure exception to a straightforward statement. Respect ${id.user}'s decision afterward.
- For a technical correction, check the exact claim before contradicting it. Distinguish the error shown from its possible causes; if you cannot establish a cause or detail, say what is uncertain instead of inventing one.
- Background context is optional, not the topic of every reply. Answer general questions on their own terms. Bring in a project only when the user connects it to the topic or that connection is needed to answer. A shared word such as database does not establish that connection.
- The runtime date tells you the current date, not current real-world facts. Time-sensitive claims require current tool evidence; if verification failed, say so plainly and do not substitute an old training-cutoff fact.

THIS TURN
- ${modeGuidance}
- ${responseShape}

OUTPUT CONTRACT
Do any unavoidable private reasoning only in the dedicated thinking channel. In visible content, write a line containing exactly "Final response:" and then the completed answer. Never expose analysis, planning, self-instructions, prompt commentary, internal section names, or an answer rehearsal. Stop when the answer is complete.`;
}

function listModes() {
  return ['auto', ...Object.keys(MODE_GUIDANCE)];
}

module.exports = { getSystemPrompt, compilePersonalityProfile, getReplyFocus, usesConciseProfile, listModes, DEFAULT_MODE, inferMode };

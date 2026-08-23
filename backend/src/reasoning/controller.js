// backend/src/reasoning/controller.js
//
// Phase: this used to return `think: true` from EVERY branch of the final
// switch, including NONE - so regardless of which policy was computed
// above, Qwen's <think> channel was forced on for literally every request
// (Ollama's own default is `think: false` - see ollama.js - this file was
// the thing overriding that). Combined with `intent.intent` almost never
// being set (see intentCategory.js), this meant the policy selection above
// was close to dead code: nearly everything landed on the NONE/default
// branch via intentType='conversation', and NONE still forced thinking on.
// That is the primary cause of 40-70s replies to plain conversational and
// summarization requests. NONE now actually means "don't think."
//
// `semanticProfile` (Groq's parsed output, when the semantic preprocessing
// stage ran - see preprocessingLayer.js) can now refine the policy chosen
// from the coarse intentType, which is the "Groq tells Qwen what it
// actually needs to do" hookup described in the architecture doc. This is
// intentionally a refinement, not a replacement: intentType (derived from
// actual tool routing via intentCategory.js) still sets the baseline, and
// a missing/failed Groq call (semanticProfile === null/undefined) leaves
// that baseline untouched.

const ReasoningPolicies = {
    NONE: 'NONE',
    LIGHT: 'LIGHT',
    DEEP: 'DEEP'
};

// Phase (evidence-based revert): all three policies now request
// `think: true`. Two log-backed reasons this reverses the earlier
// NONE=think:false choice:
//
//   1. `think:true`/`think:false` has never once correlated with whether
//      leaking happened, across every log seen in this deployment's
//      debugging - Ollama reports "Thinking: 0" regardless of which
//      value is sent (confirmed repeatedly), meaning server-side channel
//      splitting isn't implemented for this model/Ollama combo either
//      way. The leak was present on the very first bug report under
//      think:true, and narration was still present on turns already
//      running think:false before any of these policy edits existed
//      ("What do you remember about me?" under the original
//      intentType='conversation' -> NONE baseline). Setting think:false
//      bought nothing structurally; it only diverged from what the
//      model does anyway.
//   2. Fighting a reasoning-tuned model's tendency to reason is the wrong
//      target for engineering effort here. The actual fix for leaking is
//      the "Final response:" delimiter (see conversationEngine.js /
//      processor.js) plus the tag/marker checks as a second layer - all
//      of which work regardless of the think flag, since none of them
//      depend on Ollama's (non-functional, for this deployment) channel
//      routing. The token ceilings below remain the real per-policy
//      lever for response length/latency.
//
// The ReasoningPolicies names (NONE/LIGHT/DEEP) are now purely a response
// length/latency tier, not a literal thinking on/off switch - kept as-is
// rather than renamed, since the name is referenced elsewhere (logging,
// performance snapshots) and a rename is a bigger, unrelated change.
// Phase (shared-budget fix): num_predict is NOT a content-only ceiling for
// this model/Ollama combo - it's the total token budget for the WHOLE
// generation, thinking included (confirmed: Ollama issue #14793, "thinking
// tokens silently consuming the entire num_predict budget, producing an
// empty response field" - the exact failure reported live: replies either
// hit the token limit or cut off directly). personalityEngine.js's OUTPUT
// DISCIPLINE section deliberately asks the model to "think through
// anything you need to" before the "Final response:" delimiter, so
// suppressing thinking is off the table per the "evidence-based revert"
// above - these ceilings have to be large enough to cover a full private
// reasoning pass AND the actual answer, not just the answer. The old
// values (1200/700/1000) left near-zero room after a normal qwen3 think
// block, which is why LIGHT (700) in particular was the most frequent
// empty/truncated-reply culprit - it's the tier search/memory turns land
// on. ollama.js now logs a warning with done_reason "length" whenever a
// reply is cut off at the ceiling - watch for that log to tell whether
// these need to go even higher for a given workload, rather than guessing
// again.
const POLICY_OPTIONS = {
    [ReasoningPolicies.DEEP]: { think: true, temperature: 0.7, maxTokens: 2800 },
    [ReasoningPolicies.LIGHT]: { think: true, temperature: 0.5, maxTokens: 2000 },
    [ReasoningPolicies.NONE]: { think: true, temperature: 0.3, maxTokens: 1800 }
};

function baselinePolicy(intentType) {
    if (intentType === 'coding' || intentType === 'planning') {
        return ReasoningPolicies.DEEP;
    }
    if (intentType === 'search' || intentType === 'memory') {
        return ReasoningPolicies.LIGHT;
    }
    // 'action' and 'conversation' stay on the shortest ceiling (NONE,
    // 1000 tokens as of the fix above) - not because thinking is
    // disabled for them (it isn't anymore - see POLICY_OPTIONS), but
    // because they're still the response categories that don't need
    // DEEP/LIGHT's larger budgets or higher temperature.
    return ReasoningPolicies.NONE;
}

/**
 * Refine the baseline policy using Groq's semantic profile, when present.
 * Only ever escalates or de-escalates by one step from the tool-routing
 * baseline - it doesn't get to override a DEEP coding/planning classification
 * down to NONE, since that baseline came from an actual confirmed tool/
 * route match, which is more reliable than Groq's read of ambiguous language.
 */
function refineWithSemantics(policy, semanticProfile) {
    if (!semanticProfile) return policy;

    // Phase: this read `semanticProfile.reasoning_required` (snake_case),
    // a field the Groq prompt never actually produced (it only ever emits
    // camelCase fields) - so this was always undefined and only the
    // `ambiguous` branches below ever fired. semanticAnalyzer.js's prompt
    // now asks for `reasoningRequired` explicitly.
    const reasoningRequired = semanticProfile.reasoningRequired;
    const ambiguous = semanticProfile.ambiguous === true;

    if (policy === ReasoningPolicies.NONE) {
        if (ambiguous || reasoningRequired === 'high') {
            return ReasoningPolicies.LIGHT;
        }
    } else if (policy === ReasoningPolicies.LIGHT) {
        if (reasoningRequired === 'high' || ambiguous) {
            return ReasoningPolicies.DEEP;
        }
        if (reasoningRequired === 'low' && !ambiguous) {
            return ReasoningPolicies.NONE;
        }
    }
    // DEEP baseline (coding/planning) is never downgraded by Groq alone.

    return policy;
}

/**
 * @param {Object} intent - must have `.intent` set to a coarse category
 *   (see intentCategory.js). Falls back to 'conversation' if absent.
 * @param {Object} [semanticProfile] - Groq's parsed profile (preprocessed.semantic),
 *   when the semantic preprocessing stage ran this turn.
 */
function getReasoningOptions(intent, semanticProfile) {
    const intentType = (intent && intent.intent) || 'conversation';
    const policy = refineWithSemantics(baselinePolicy(intentType), semanticProfile);
    return { policy, ...POLICY_OPTIONS[policy] };
}

module.exports = { getReasoningOptions, ReasoningPolicies };
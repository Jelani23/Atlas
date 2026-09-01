// backend/src/utils/thinkFilter.js
//
// Streaming reasoning filter for the main LLM content channel.
//
// qwen3 via Ollama has two ways of leaking its reasoning into the regular
// `content` stream (as opposed to Ollama's dedicated `thinking` channel,
// which the provider already routes to its own event type):
//
//   1. A proper <think>...</think> block written into content.
//   2. Reasoning-as-prose with NO opening tag - only a stray closing
//      </think> right before the real answer (observed whenever qwen3
//      narrates its reasoning with Ollama's think=false path). The opening
//      cannot be found by tag matching, so the reasoning is recognized by
//      its self-narration prose instead (see looksLikeReasoningProse in
//      utils/jsonExtractor.js).
//
// In both cases the reasoning ALWAYS comes before the answer, so the filter
// holds back content until it can prove it is past the reasoning:
//
//   'unresolved' - no signal yet. Content is buffered (never emitted).
//       A </think> with no opener: discard everything up to it -> 'outside'.
//       A <think> opener:                        -> 'inside'.
//       Reasoning-prose opener (2+ narration markers): -> 'prose'.
//       None of the above within UNRESOLVED_CAP chars: this is a normal
//           reply - flush what was held and stop filtering.
//   'inside'    - confirmed inside <think>...</think>; buffer until </think>.
//   'prose'     - confirmed content-channel reasoning prose; buffer until
//       the stray </think>, or drop at stream end if it never closes.
//   'outside'   - past the reasoning; everything passes through untouched.
//
// One implementation is used for the UI stream, the final reply, AND the TTS
// path - a leak anywhere means the user both sees AND hears the thinking,
// so the filter deliberately errs toward holding content back a little
// longer rather than risking an early flush.

const { looksLikeReasoningProse, reasoningProseDensity } = require('./jsonExtractor');

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
const UNRESOLVED_CAP = 500; // chars of tag-less content before we conclude
                            // "this reply isn't doing inline reasoning at all"
                            // and flush what was held back.
const PROSE_MIN_LOOKAHEAD = 40; // enough leading text to judge the opener.
const PROSE_MIN_DENSITY = 2; // narration must keep going, not just open once.
const BUFFER_HARD_CAP = 20000; // pathological never-closing reasoning guard.
const BUFFER_KEEP_TAIL = 2000;

// The model sometimes quotes its own instruction while narrating, e.g.
// `the line "Final response:" exactly`. A plain substring search treats that
// quoted phrase as the real answer boundary and releases all subsequent
// reasoning to UI/TTS. The delimiter is valid only at the beginning of a
// response line (optionally indented), which matches the system instruction
// while rejecting quoted/in-sentence mentions.
function findStandaloneFinalMarker(text) {
    const match = String(text || '').match(/(?:^|\r?\n)[ \t]*final response:[ \t]*/i);
    if (!match) return null;
    return {
        index: match.index,
        end: match.index + match[0].length
    };
}

// True if the buffer ends mid-tag (e.g. "...</thi"), so scanning now would
// split a tag across a chunk boundary and let half of it leak through
// unrecognized.
const endsWithPartialTag = (str) => /<\/?t(h(i(n(k)?)?)?)?$/i.test(str);

class ThinkFilter {
    /**
     * @param {Object} [options]
     * @param {string} [options.requestId]  - for log attribution.
     * @param {(msg: string) => void} [options.onLog] - log sink; defaults to
     *   a no-op so the class stays trivially unit-testable.
     */
    constructor({ requestId = null, onLog } = {}) {
        this.requestId = requestId;
        this.onLog = onLog || (() => {});
        this.state = 'unresolved'; // 'unresolved' | 'inside' | 'prose' | 'outside'
        this.pending = '';
    }

    _log(msg) {
        this.onLog(`[ThinkFilter] ${this.requestId || '-'}: ${msg}`);
    }

    /**
     * Feed one chunk of raw content-channel text. Returns the portion that is
     * safe to emit right now (may be '').
     */
    push(text) {
        if (this.state === 'outside') return text;
        this.pending += text;

        if (this.state === 'unresolved') {
            const finalMarker = findStandaloneFinalMarker(this.pending);
            if (finalMarker) {
                const after = this.pending.slice(finalMarker.end);
                this._log(`found standalone "Final response:" boundary - discarded ${finalMarker.end} leading chars.`);
                this.pending = '';
                this.state = 'outside';
                return after;
            }
            const closeIdx = this.pending.indexOf(CLOSE_TAG);
            if (closeIdx !== -1) {
                // Paired <think>...</think>, or a stray opener-less closer -
                // either way, everything up to and including the closer is
                // reasoning. Discard it; whatever follows is real content.
                const after = this.pending.slice(closeIdx + CLOSE_TAG.length);
                this._log(`found stray </think> with no prior <think> - discarded ${closeIdx + CLOSE_TAG.length} chars of leaked reasoning.`);
                this.pending = '';
                this.state = 'outside';
                return after;
            }
            const openIdx = this.pending.indexOf(OPEN_TAG);
            if (openIdx !== -1) {
                this._log('<think> opened - buffering until </think>.');
                this.pending = this.pending.slice(openIdx + OPEN_TAG.length);
                this.state = 'inside';
                return '';
            }
            if (endsWithPartialTag(this.pending)) return ''; // mid-tag, wait

            // Content-channel reasoning prose (stray closer only). Hold it
            // back the same way a <think> block is held, until the closer or
            // the stream end. Requiring the narration to keep going (density
            // >= 2) keeps a normal reply that merely opens with one of the
            // phrases from being mistaken for a reasoning trace.
            if (this.pending.length >= PROSE_MIN_LOOKAHEAD &&
                looksLikeReasoningProse(this.pending) &&
                reasoningProseDensity(this.pending) >= PROSE_MIN_DENSITY) {
                this._log('content-channel reasoning prose detected (no <think> opener) - buffering until </think>.');
                this.state = 'prose';
                return '';
            }

            if (this.pending.length >= UNRESOLVED_CAP) {
                // No reasoning signal showed up in a reasonable window - this
                // reply isn't doing inline reasoning. Flush what was held.
                const flushed = this.pending;
                this.pending = '';
                this.state = 'outside';
                return flushed;
            }
            return ''; // still ambiguous, keep holding
        }

        // 'inside' or 'prose' - confirmed reasoning. The app-defined final
        // boundary is authoritative even if qwen omits its closing think tag.
        const finalMarker = findStandaloneFinalMarker(this.pending);
        if (finalMarker) {
            const after = this.pending.slice(finalMarker.end);
            this._log('found standalone "Final response:" boundary while reasoning; resuming content.');
            this.pending = '';
            this.state = 'outside';
            return after;
        }

        // Otherwise buffer until </think>.
        const closeIdx = this.pending.indexOf(CLOSE_TAG);
        if (closeIdx !== -1) {
            const after = this.pending.slice(closeIdx + CLOSE_TAG.length);
            this._log('</think> found - reasoning block closed, resuming normal streaming.');
            this.pending = '';
            this.state = 'outside';
            return after;
        }
        // Still inside reasoning - keep buffering silently. No cap on when
        // this can end (reasoning traces legitimately run long); just prevent
        // unbounded growth for a pathological reply that never closes.
        if (this.pending.length > BUFFER_HARD_CAP) {
            this.pending = this.pending.slice(-BUFFER_KEEP_TAIL);
        }
        return '';
    }

    /**
     * Call once when the stream ends. Returns any safe trailing text that
     * should be emitted (may be '').
     *
     * 'unresolved' - the reply ended without ever showing a reasoning signal
     *   (e.g. a short "Sure." that never hit UNRESOLVED_CAP). That was
     *   ordinary content held back in case a tag showed up - flush it.
     *
     * 'inside'/'prose' - the model opened a reasoning block and the stream
     *   ended without a closing tag (generation cut off by maxTokens
     *   mid-reasoning). There is no reliable way to strip this - the text is
     *   dropped so the empty-reply fallback handles the turn, instead of raw
     *   reasoning being shown (and spoken) as if it were the answer.
     */
    finalize() {
        if (this.state === 'unresolved' && this.pending) {
            // The stream ended before this buffer ever hit the prose-hold
            // threshold in push(), but the text still reads like a reasoning
            // trace that got cut off early. Flushing it would present (and
            // speak) raw thinking as if it were the answer - drop it instead.
            if (this.pending.length >= PROSE_MIN_LOOKAHEAD &&
                looksLikeReasoningProse(this.pending) &&
                reasoningProseDensity(this.pending) >= PROSE_MIN_DENSITY) {
                this._log(`stream ended with unclosed reasoning prose detected - dropping ${this.pending.length} chars instead of flushing them as the answer.`);
                this.pending = '';
                this.state = 'outside';
                return '';
            }
            const flushed = this.pending;
            this.pending = '';
            this.state = 'outside';
            return flushed;
        }
        if ((this.state === 'inside' || this.state === 'prose') && this.pending) {
            this._log(`stream ended mid-reasoning block with no closing tag - dropping ${this.pending.length} chars of unterminated reasoning instead of showing it as the answer.`);
            this.pending = '';
            this.state = 'outside';
        }
        return '';
    }
}

module.exports = { ThinkFilter, findStandaloneFinalMarker };

# Wordle capability investigation — September 30, 2026

## Evidence and conclusions

The user supplied an Alice conversation and disclosed the answer, RIVER. The log shows failures before any clues and failures after clear corrections. It does not include the original request payloads, model identity/options, retrieved memories, or native response metadata. Do not claim a confirmed root cause from this transcript alone.

- **Task refusal:** Alice treats proposing a guess as requiring knowledge of the answer. An opening guess is an action under uncertainty, not a claim to know the solution.
- **Invented rules and observations:** she claims BRAIN contains two Ns, implies repeated letters invalidate a word, and carries the guessed word's vowel count into constraints on the answer.
- **Position and color errors:** she reuses R at position 2 despite yellow feedback, turns E green into yellow, and infers adjacency or a suffix from yellow letters.
- **Count errors:** yellow R plus green R in BRIER establishes at least two Rs. FLIER has only one and leaves I in its excluded position.
- **Attribution errors:** a correction about BRIER becomes feedback for the unplayed FLIER. Gray B is repeatedly treated as a required starting B.
- **Failure to stop:** she repeatedly returns to the rejected BRIER. Visible text contains extended self-correction loops and ends mid-sentence. The log alone cannot identify whether this was a channel-handling problem, generation behavior, truncation recovery, or some combination.

After the supplied three played guesses, the fixed ending is ER. I must occupy position 1 or 2; the additional R must occupy position 1 or 3. B, A, N, C and M are absent. RIVER and RIDER both satisfy all feedback. The clues do not uniquely determine the disclosed answer.

CRIME after BRAIN need not be illegal in ordinary Wordle, where exploratory guesses are allowed. It was nevertheless an inconsistent **candidate solution**, the role Alice claimed for it. These diagnostic requests explicitly ask for a candidate solution, not an information-gathering guess.

## Code inspection

`backend/src/core/conversationEngine.js` requests four history messages, then sends only the final four messages including the current user message. Thus the ordinary chat payload contains at most three prior messages. `contextManager.js` may retrieve earlier topic-matched messages; `contextBuilder.js` presents them separately. That mechanism does not guarantee retention of every puzzle constraint. The complete original payload is unavailable, so context loss is a plausible contributor, not a demonstrated cause here.

The personality instructions already permit speculation and ask Alice to answer the actual request. The inspected instructions do not explicitly prohibit a puzzle opening guess. No blanket instruction change was made based on an assumed cause.

## Isolated local diagnostic

Added evaluation-only files in `backend/evaluation/wordle/` and command `node backend/scripts/evaluateWordleConstraints.js`. The history is explicitly abridged from the supplied transcript, not a faithful replay of the original prompts or production context. FLIER remains an unplayed suggestion. The disclosed solution is absent from all requests.

The deterministic checker reproduces feedback with green matches consuming letter counts before yellow matches. It checks shape, consistency with every played row, and repeated guesses. It does not supply candidates, verify dictionary eligibility, judge free-text reasons, or prove a unique solution. The explicit ledger is derived only from the three authored, consistent feedback rows; it is not a production parser for arbitrary chat or contradictory clues.

Saved report: `backend/.local/semantic-evaluation/1790797116473-wordle-diagnostic.json`. Three sequential calls used installed qwen3.5:4b, thinking disabled, temperature 0, seed 42, context 8192, output budget 4096. All completed. No native thinking text was retained. This is one sample per condition, with a short diagnostic system instruction and JSON output schema; it does not reproduce the live chat configuration.

| Input condition | Candidate | Letter consistency | Explanation review |
| --- | --- | --- | --- |
| Last four abridged messages | FLAIR | Fails | Drops fixed E and invents possible colors for unplayed letters. |
| Full abridged history | RIKER | Passes | Gives a malformed position pattern. Dictionary acceptance unverified; not scored as a solved puzzle. |
| Explicit feedback and derived ledger | FLIER | Fails | Claims all constraints are satisfied despite the excluded I position and missing second R. |

These results demonstrate that even supplying an explicit ledger does not guarantee this local model will obey it. They do not isolate history truncation as the cause or establish that longer context reliably improves performance. Reviews are by the primary development agent, not independent human review.

## Decision and next milestone

Keep this checker and diagnostic outside production. Do not hardcode RIVER or patch Alice to repeat a canned puzzle answer. The useful general boundary is between generating a possible answer and checking whether it obeys recorded constraints. A fluent explanation, repeated self-review, or valid JSON does not establish that boundary.

The next bounded experiment can provide exact checker conflicts for one correction attempt, without supplying a solution, and measure whether the model repairs both the candidate and its explanation. Before any live integration, explicit game state, correction attribution, dictionary eligibility and unsupported requests need defined behavior. There is no live UI test needed to investigate the demonstrated failures.

No paid services, downloads, production conversation writes, learning, migrations or commits were used. Existing uncommitted work is preserved.

Verification: **122/122 offline test files passed**, including duplicate-letter accounting, excluded positions, repeated guesses and non-unique solutions. Log: `backend/.local/semantic-evaluation/offline-tests-wordle-2026-09-30.log`. The tracked diff has no whitespace errors and no model remains loaded from this diagnostic. The adjacent `-review.json` binds each explanation review to its answer hash. These checks verify evaluation machinery, not Alice's reasoning reliability.

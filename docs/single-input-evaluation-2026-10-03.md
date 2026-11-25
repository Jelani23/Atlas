# One-input code analysis comparison — October 3, 2026

## Protocol

Compare three evaluation-only modes on the already exposed guard-method, descending-bound and trim-pipeline development fixtures:

1. Existing typed multi-input request (D).
2. Ordered explanation with all inputs together.
3. The same ordered explanation with one independent call per input.

The requested explanation identifies input value/type, decisive branch, operation or early exit, and final outcome. This is a concise source-grounded explanation, not a request to expose private deliberation. All claims remain unverified until reviewed.

Each case/mode has at most 6,000 output tokens in total and a shared 180-second deadline. Single-input calls divide that output allowance equally; unused allowance is not transferred. No mode receives correction calls. All calls are sequential, temperature 0, seed 42, context 8192, thinking disabled, using installed qwen2.5-coder:7b. The three mode orders rotate across cases. One repeat is a diagnostic, not a stability estimate.

Complete source snapshots are retained in every call. Other probe invocations are removed from single-input questions and schemas. Static evidence is scoped to the selected input for checking, not injected into initial prompts. Fixed reference outcomes are used only after generation. No fixture execution is needed to build these requests.

Splitting repeats the source and loading overhead, so equal maximum output tokens do not imply equal total computation. Record total wall time, input tokens, output tokens, completion, contract validity, exact outcomes and explanation quality separately. Do not count schema failure as semantic success or interpret a correct prediction as proof of its explanation.

Run: `node backend/scripts/evaluateSingleInput.js`. It uses the existing evaluation lock and a report-specific `.stop` file. Results are isolated under `backend/.local/semantic-evaluation/`. Production service behavior remains unchanged; no held-out cases are consumed in this development screen.

## Results and decision

Report: `backend/.local/semantic-evaluation/1791038355280-single-input-development.json`, with adjacent answer-hash-bound review and summary files. All 13 requests completed. Review covers every answer, including the invalid contract. Reviews are by the primary development agent, with no separate human sign-off.

| Mode | Valid responses | Exact correct | Unscored inputs | Total wall time | Input/output tokens |
| --- | --- | --- | --- | --- | --- |
| Existing multi-input | 3/3 | 4/7 | 0 | 120.5 s | 2007 / 1340 |
| Ordered multi-input | 2/3 | 2/4 scored | 3 | 65.3 s | 2250 / 1510 |
| Ordered single-input | 7/7 | 3/7 | 0 | 109.0 s | 5039 / 1991 |

The ordered multi-input guard answer recognizes TypeError in prose, but encodes a full error message where the contract requires an error name. All three inputs in that response are unscored by the strict contract; they are not omitted successes. It also describes every branch as none. Its partial semantic recognition is recorded separately from contract correctness.

The single-input numeric case calls 7 falsy, says the function returns absent, yet predicts string 7. Splitting inputs therefore did not remove internal contradictions. Both loop calls encode string elements where the code produces numbers; the below-bound call still invents an iteration. The whitespace call still claims splitting an empty string produces an empty array. Its other trim explanation gives the correct count but skips the concrete intermediate values.

The existing baseline is 4/7 here because this comparison deliberately provides no corrections. Earlier 5/7 results included a successful whitespace correction and are not a like-for-like baseline. Equal maximum output budgets were respected; none of the failures above was a token exhaustion. The first baseline request took 81.9 seconds, so these single-run wall times should not be treated as stable performance rankings. No tests were run concurrently with the measured calls.

**Decision: retain the implementation as an evaluation tool; do not promote it to production or spend untouched held-out cases on it.** The proposed change does not demonstrate better correctness or explanation quality on this model/profile. Other installed models may behave differently; no claim about all local models follows from this screen.

No live testing is needed for these reproduced semantic failures. The next meaningful local experiment should test a different evidence mechanism, such as supplying existing, input-bound primitive facts alongside the source, rather than another prose-format variant. Expression facts must remain conditional on reachability and cannot certify a whole-function result or explanation. No new interpreter, arbitrary code execution, model downloads, paid service, training, production memory write or commit was used.

Verification: **123/123 offline test files passed**, including single-input ID isolation, complete source preservation, total budget allocation, rejection of another input's answer, and rejection of stale review hashes. Output: `backend/.local/semantic-evaluation/offline-tests-single-input-2026-10-03.log`. No evaluation model remains loaded. These tests validate the implementation, not model reliability.

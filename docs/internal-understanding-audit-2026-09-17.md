# Internal understanding and analysis audit

Completed checkpoint: **113 local-model runs across 63 distinct probes**, plus **83/83 offline test files**. Model runs include repeated comparisons and targeted retests, not 113 independent questions. Analysis remains experimental; no overall reliability sign-off.

## Scope

The user requested a large audit of code analysis, tool understanding, model switching and deeper analysis. This is a checkpoint after commit `27ad58b`; ordinary persona/memory repairs were already committed by the user. No production DB writes, live note mutations, generated-code execution, or commits are part of this audit.

The new runner is `backend/scripts/auditInternalUnderstanding.js`. It contains 63 distinct probes: 20 controlled source questions, six questions over actual Atlas source, and 37 current executable tool contracts. Cases retain the exact source/prompt, evidence hash, model response, latency, metrics, rubric and automated failure reasons in `backend/.local/internal-understanding-audits`. Regex passes are smoke checks, not semantic certification. The source benchmark is isolated and does not reproduce the entire production personality/context/planner pipeline.

Examples from backend:

```text
node scripts/auditInternalUnderstanding.js --area=source --model=general --mode=baseline
node scripts/auditInternalUnderstanding.js --area=source --model=general --mode=analysis
node scripts/auditInternalUnderstanding.js --area=source --model=coder --mode=analysis
node scripts/auditInternalUnderstanding.js --area=atlas --model=general --mode=analysis
node scripts/auditInternalUnderstanding.js --area=tools --model=general --mode=baseline
node scripts/auditInternalUnderstanding.js --area=source --model=general --mode=analysis --think --cases=off-by-one,comment-versus-code,ttl-units,hash-consistency
```

Runs are sequential to avoid GPU competition. Default audit output limits are 900 tokens without native thinking and 2400 shared thinking/answer tokens with thinking; `--max-tokens=` overrides this. Context defaults to 4096; `--context=` overrides it. Timeouts default to 60 seconds and stop the batch rather than repeatedly submitting requests. Production analysis has a separate 1600-token answer limit; these audit budgets must not be conflated.

## Completed first comparisons

| Run | Automated smoke checks | Report |
| --- | --- | --- |
| General, baseline | 17/20 | `1789603130974-general-baseline.json` |
| General, analysis instructions | 15/20 | `1789603323631-general-analysis.json` |
| Coder, analysis instructions | 14/20 | `1789603477174-coder-analysis.json` |
| Actual Atlas source, general + analysis | 4/6 | `1789657924997-general-analysis.json` |
| All tool contracts, general | 37/37 | `1789658163660-general-baseline.json` |
| Four hard cases, native thinking / 2400-token shared budget | 2/4 | `1789658027113-general-analysis-think.json` |
| Two empty-answer cases, 4096-token budget / 4096 context | 0/2 | `1789658290296-general-analysis-think.json` |
| Targeted contracts after context scoping repair | 3/3 | `1789658439202-general-baseline.json` |
| Time-unit case, thinking / 4096 tokens / 8192 context | 0/1 | `1789658470671-general-analysis-think.json` |

The two Atlas-source failures exhausted the 900-token audit reply budget. This is a completion failure, not sufficient evidence that the factual answer was wrong. The baseline off-by-one expectation was tightened to require NaN after manual review caught an incorrect zero-coercion explanation; that original run had already failed for truncation. Do not treat these small runs as clean model rankings: one sampling run, different prompts, and imperfect pattern checks limit the comparison.

## Findings confirmed by manual review

- General baseline: the off-by-one answer claimed `undefined` acts like zero in numeric addition and then ran out of tokens. The independent executable oracle shows NaN for both empty and nonempty arrays.
- Both models: the stale-comment fixture produced contradictory answers about a clearly time-limited cache.
- General analysis: missed milliseconds versus seconds, and attributed mismatched full/truncated hashes to speculative hash nondeterminism rather than the different inputs.
- Coder analysis: described the numeric off-by-one result as TypeError; treated a truncated authorization function as complete; missed the time-unit mismatch and fabricated an undefined/null subtraction TypeError; missed the truncated/full hash comparison.
- The general analysis injection probe was automatically flagged because it quoted the sentinel comment. Manual review showed it still answered `double(3) = 6`; this is not demonstrated obedience to the injected instruction. It did add unnecessary speculative discussion.
- Coder path-prefix probe missed the specific sibling-prefix check but did identify an alternative traversal counterexample. Its resolved-path explanation was inaccurate. The regex score alone cannot capture this mixed result.

These failures establish that neither a coder label nor a longer analytical response guarantees sound reasoning. Native thinking remains an experiment until measured, not a global default change.

Native thinking corrected the off-by-one and stale-comment answers (manually reviewed), taking approximately 21 and 24 seconds. The time-unit and hash cases consumed their 2400-token allowance without visible answers. Raising the requested allowance to 4096 with the same 4096 context still exhausted the available generation window around 3800 tokens; the time-unit answer was empty and the hash answer incomplete after roughly 58 seconds each. This is not a clean test of an unconstrained 4096-token thinking budget: prompt space also consumes context. Do not infer that more thinking would necessarily solve the reasoning defects.

A final time-unit retest used an 8192-token context to remove that window confound. It consumed the full requested 4096 generation tokens and still returned no visible answer after approximately 74 seconds. This strengthens the decision not to enable native thinking globally, while remaining only a single targeted retest.

The tool-contract 37/37 result is **not** a clean bill of health. Manual samples found an incorrect timezone/TTS dependency, an unnecessary denial of the ability to run the registered test command, and ambiguous variadic argument wording. The runtime capability snapshot had been including TTS, text-model, agent-profile and learning status for unrelated topics. It now includes each only for relevant topic groups. Tests assert that a timezone explanation gets no unrelated status snapshot. The targeted rerun fixed the timezone/TTS conflation and the test-command denial; reverification wording still adds policy examples not proven by the supplied contract. Further semantic review and execution-boundary tests are required.

## Implementation changes under test

- Shared analysis contract separates source observations, hypotheses, proposed changes and validation. It asks for counterexamples and safeguards without demanding invented bugs, and does not request visible private reasoning.
- Background analysis no longer calls a truncated preview the entire file or orders the model to deny missing content. Unusable read results stop before generation. The reply budget increases from 400/600 to 1600 tokens.
- Source-backed follow-ups explicitly using `analysis` mode or requesting deep/detailed analysis can use the configured coding specialist and an analysis response style. This remains opt-in because the audit did not show it to be a superior default. Basic code explanations and ordinary conversation retain their existing routing. Native thinking stays off on the installed non-thinking coder.
- Added analysis mode guidance, model-routing checks, background read-only/partial-source tests, and controller follow-up tests.
- Independent fixed-code oracles validate NaN behavior, null guards, rejected promises, time units, differing hash inputs and sibling-prefix behavior. No model-generated code is executed.
- Full offline suite: 83/83 test files passed after the capability-context change. Explicit analysis-mode routing and background analysis tests passed again after restricting the new route to opt-in. Whitespace checks pass.

## Not yet established

Complete-file paging, automatic multi-file evidence gathering, robust code-action paraphrases, durable source provenance across restarts, automatic verification of generated fixes, and a reliably superior analysis/model policy remain open. Analysis prompts alone do not implement an iterative inspect→test→revise workflow. Existing code proposal export/argument mismatch remains unsupported; this work does not enable autonomous changes or deployment.

## Recommended next implementation slice

Build bounded source-range reading with explicit coverage and source identity, then an evidence-driven analysis workflow that identifies missing dependencies, requests the needed ranges, proposes a falsifiable explanation, and validates it against approved fixed tests. Separate review/proposal from modification permissions. Expand held-out cases and review real app transcripts before promoting model/thinking policies. Do not change ordinary conversation to the coder or native-thinking path based on this audit.

# Semantic evaluation checkpoint — 2026-09-28

Completed results and recommendation: [September 29 checkpoint](semantic-evaluation-checkpoint-2026-09-29.md). This file records the initial implementation and development screen.

## Scope and preserved state

The starting working tree already contained the deep-analysis transport, context, contract, routing, deterministic-analysis and test changes listed in the September 27 checkpoints. They were preserved. No commits, global model changes, downloads, cloud calls, migrations, production memory writes, learning, autonomous Alice patches or presentation changes were made.

The evaluation lives in `backend/evaluation/semantic`, with explicit commands in `backend/scripts/evaluateSemanticAnalysis.js` and `summarizeSemanticEvaluation.js`. It does not import Alice's conversation engine or stores. The only existing file changed for this work is the offline test runner, to register `semanticEvaluation.test.js`.

## Evaluation design

There are 24 authored target functions, split 12 development / 12 heldout, with full relevant helpers and callers retained. Source review criteria and fixed expected outcomes are separate from model prompts. Adjacent fallback operators share the development split; numeric parsing functions share heldout. See [case review](../backend/evaluation/semantic/CASE_REVIEW.md) and [reproduction/review guide](../backend/evaluation/semantic/README.md).

Fixed calls to 22 inspected pure fixtures cross-check expected outcomes. Missing-helper and unknown-cache cases are reviewed without execution. These checks are independent of Alice outputs, but the same development agent authored and reviewed the cases; independent human review remains outstanding. Neither valid JSON, completion nor valid citation locations counts as semantic correctness.

The harness saves complete prompts, source hashes, provider/model identity, quantization, native settings, token budgets, latency, completion diagnostics and raw final answers. It counts but does not save native thinking. Review files bind judgments to answer hashes and retain evidence quotes. Exact outcomes, operation coverage, useful depth, contradictions, uncertainty, citations, completion and repeatability remain separate. No aggregate score.

## Verified local configuration

- Configured general model: `qwen3.5:4b`, Q4_K_M, reported 4.7B parameters; installed native presence penalty 1.5.
- Compared alternative: `qwen2.5-coder:7b`, Q4_K_M, reported 7.6B parameters; no thinking capability advertised.
- Also installed: qwen3.5:2b, qwen3:4b, qwen3:8b, and LiquidAI LFM2.5 2.6B Q4_K_M. No downloads.
- Hardware: AMD Ryzen 5 5500, about 16 GiB RAM, RTX 3060 Ti with 8 GiB VRAM. Free memory is sampled in each report and varies.
- All calls use the local Ollama endpoint sequentially. Full model digests and provider version are recorded in each report. No production model setting is changed.

## Results recorded so far

The first diagnostic used a 4,096-token shared budget and explicit presence penalty zero. All six 4B A/B calls exhausted that budget with empty final output. These are completion failures, with no semantic scores. This policy differs from the live route and is not evidence that the configured native policy cannot answer.

The coding model completed all six calls in that diagnostic. Source-only A and Atlas-contract B each scored 4/7 exact outcomes. Both missed numeric `toLowerCase`, below-bound loop entry and splitting an empty string. The structured answers passed citation-location validation while retaining wrong claims. A had one recorded internal contradiction and B had two; operation coverage was 2/6 for each. No unjustified missing-information requests occurred in these narrow answers. Mean wall latency was about 26.0 seconds for A and 27.0 seconds for B, including model load time.

Artifact prefix: `backend/.local/semantic-evaluation/1790609225439-development-screen` (`.json`, `-review.json`, `-summary.json`). An original case-set snapshot was added after completion without changing prompts or answers. Later split regrouping does not change any of these three tested functions or their assignments.

The native-settings screen used a matched 12,000-token budget for both models. Both completed all six A/B requests. The 4B model scored 6/7 exact outcomes in both conditions, with 5/6 authored operation criteria met. The coding model remained at 4/7 and 2/6. All six coding answers were byte-identical to the first diagnostic despite the higher cap; this is cross-policy repetition, not a controlled repeatability estimate. The 4B source-only answer averaged 61.1 seconds versus 100.5 seconds for B. The coding model averaged 11.6 versus 21.4 seconds. These small latency samples include loading and are descriptive, not hardware benchmarks.

The 4B model still called numeric 7 falsy. Its structured loop answer correctly handled both requested inputs but overgeneralized to integer output for any numeric input. These extra claims are recorded separately and can withhold an answer even when all supplied examples pass. B did not improve exact outcomes for either model and sometimes introduced irrelevant analyzer limitations.

Artifact prefix: `backend/.local/semantic-evaluation/1790609970561-native-development`. The configured 4B model was selected for the held-out B/C pilot because its native development accuracy was higher. The coding model was not promoted. The completed pilot is documented in the September 29 checkpoint.

## Checked-analysis boundary

Condition C reuses `primitiveSemantics`, `functionScenario` and `semanticConsistency`. It carries typed conditional expression facts, assumptions and source spans separately from bounded whole-function outcomes. Complete source still carries relevant shared state and caller context. Caller arguments are not silently substituted into callee parameters. Unsupported analysis remains an analyzer limitation.

Structured assertion mismatches receive one correction with concrete evidence. A separate correction mode can use a reviewed baseline error only when an unchanged source snapshot has a supported independent whole-function result. Unresolved structured conflicts withhold model claims while retaining independent evidence. Semantic review also withholds answers with incorrect outcomes or contradictions. Matching structured assertions does not verify free prose.

The pilot is evaluation-only; Alice's production analysis path remains unchanged pending measured held-out benefits. No interpreter, generated test execution or separate automated judge was added. Prose scores are development-agent judgments anchored to authored criteria, not independent human ratings.

## Verification

The complete network-disabled offline suite passed 120/120 test files. Focused checks cover all fixture outcomes, prompt/source parity, expected-answer exclusion, split families, static evidence, conflicting/omitted assertions, malformed structured output, stale/duplicate reviews and retention of independent evidence after withholding claims.

Held-out results, correction results, final verification and the next bounded milestone are in the September 29 checkpoint.

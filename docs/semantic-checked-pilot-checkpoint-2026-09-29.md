# Checked outcome pilot — September 29, 2026

The pending stages below are completed in [the September 30 checkpoint](semantic-evaluation-checkpoint-2026-09-30.md).

Work continues from [the initial semantic evaluation](semantic-evaluation-checkpoint-2026-09-29.md). The user requested continued offline development until their participation is actually needed. No commits, model downloads, global default changes, production memory writes or repository-code execution have been performed.

## Why the pilot changed

The earlier C contract allowed a model to repeat every independently derived expression fact while predicting a contradictory whole-function outcome. Its one reviewed correction also fixed one path while turning a previously correct path into unjustified uncertainty.

Condition D therefore requires a typed whole-function prediction for each explicit input. The host checks existing scenario derivations against the exact source version, function identity and arguments. It supplies a specific mismatch for at most one correction. A remaining conflict withholds all model prose and retains independently derived outcomes. Matching values leave explanations unverified.

This does not extend JavaScript execution or add a general interpreter. The current analyzers derive only **8 of 52** reference probe outcomes. Unsupported results remain unverified. The fixed execution references are used only for offline scoring, never for feedback.

## Implementation

- `backend/src/reasoning/checkedPredictions.js`: typed result contract, source/input binding, comparisons and concrete feedback; shared initial request builder.
- `backend/src/reasoning/checkedAnalysisInputs.js`: reuses the existing explicit spoken assignment grammar. Distinguishes numeric and quoted string inputs and requires every parameter for a whole-call check.
- `backend/src/reasoning/checkedAnalysisResponse.js`: displays bounded static outcomes separately from unverified model explanations; conflicting prose is withheld.
- `deepAnalysis.createService({checkedInputs:true})`: service prototype, **off by default** during evaluation. At most two calls share one total timeout. Cancellation and source changes reject stale output. A failed correction retains the independently derived result. The lock stays held if a timed-out provider has not settled.
- Evaluation summaries now include automatic fixed-reference outcome scores separately from prose review and retain before/after correction scores.
- The runner supports separate context and thinking profiles and a report-specific `.stop` file for orderly cancellation from Windows pipe-backed sessions. Default model settings are unchanged.

## 8B resource screen

Artifact: `backend/.local/semantic-evaluation/1790700525022-eight-b-development.json`, with adjacent review, summary and stop note.

qwen3:8b, native thinking, 16,384 context and a 12,000-token budget:

- Guard-method A and B both completed with **3/3 outcomes and 2/2 operation criteria**. They took 90.1 and 329.6 seconds respectively.
- A cited the closing brace for the method call and overstated its string precondition. B included an analyzer limitation with an unsupported source citation. Correct outcomes do not establish complete explanation quality.
- The source-only loop case hit the **600-second timeout**. The pending B loop request was stopped as a resource decision and is unscored; the two trim cases were skipped.
- Ollama reported 20% CPU / 80% GPU at this context size. After stopping the task-owned runner, its model connection closed and Ollama was confirmed unloaded before starting the next model.
- This rejects the tested interactive resource profile, not the model's unobserved semantic answers. A smaller-context, thinking-disabled development screen is planned separately.

## Development results

- `1790701732824-typed-development.json`: qwen3.5:4b D on guard-method and trim-pipeline. Both completed; manual review finds **5/5 outcomes and 4/4 operation criteria**, with depth 2 for both. Only **one of two contracts was valid**: the error name `TypeError` was not encoded as a JSON literal. The guard answer is withheld despite its correct semantic prediction. Mean latency was 153.2 seconds. No correction was triggered.
- `1790702076942-typed-correction-development.json`: the coding 7B initially predicted zero for whitespace-only input. A host-derived whole-function mismatch triggered one correction. Outcomes improved **1/2 → 2/2**, operation criteria **1/2 → 2/2**, and reviewed depth **1 → 2**, with the second result preserved. Both responses and the before/after prose review are saved. Total latency was 61.8 seconds. This is development evidence, not a held-out result.
- `1790702163128-eight-b-small-context.json`: 8B with context 8192, thinking off and 4096 generation tokens completed all four A/B calls. Both conditions scored **4/5 outcomes**. A contradicted its own numeric-input result; B predicted `absent` for numeric 7 and invented missing builtin information. B operation criteria were 3/4, with three unjustified-uncertainty findings. B averaged 18.8 seconds. A's first request spent 100.8 seconds loading the model; subsequent loop A took 11.7 seconds. This faster profile does not justify changing models. It is not pooled with the native-thinking profile.

Each report has adjacent `-review.json` and `-summary.json` artifacts. Review means review by the primary development agent, not a human reviewer.

## Evaluation in progress

`1790702346573-typed-regression.json` evaluates D on finally-return and short-circuit with the configured qwen3.5:4b. These cases were used earlier, so they are regressions rather than fresh holdouts. The next four fresh held-out families and unchanged D workflow were fixed before viewing their answers; see the evaluation README.

The earlier full offline suite passed **121/121** test files. Subsequent focused tests cover the service prototype, correction withholding, failed correction, cancellation, source freshness and provider lock retention. A full rerun is required after the final implementation decision.

No live test has been requested. The outstanding questions here are model accuracy, completion and bounded correction behavior, which can be measured offline.

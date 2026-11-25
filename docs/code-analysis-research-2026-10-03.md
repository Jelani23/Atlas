# Code analysis research reset — October 3, 2026

## Recommendation

Pause additional prompt-format variants. First measure how much of the observed failure comes from the installed inference setup and response contract. Then evaluate a small tool-assisted explanation task using independently established evidence. Keep all operation local and free on the existing PC. This is a research recommendation, not proof that either change will improve Alice.

## What the primary sources support

### Code generation and code understanding are different measurements

[CRUXEval](https://arxiv.org/abs/2401.03065) evaluates input/output prediction on 800 Python functions. Its authors found that improvements on HumanEval did not consistently transfer to execution reasoning. Reasoning prompts and fine-tuning helped some settings without solving the benchmark. Its [official repository](https://github.com/facebookresearch/cruxeval) documents executed reference outputs. This supports keeping Atlas's exact outcomes separate from coding leaderboard claims. Python results do not directly establish JavaScript reliability; do not execute downloaded benchmark programs under the current task constraints.

### Hybrid analysis can help, but the division of work matters

[IRIS, revised paper](https://arxiv.org/abs/2405.17238) combines model-inferred API specifications and contextual judgment with static data-flow analysis for Java vulnerability detection. It provides evidence that a model can be useful within a larger analysis system. It does not show that a small model can reliably predict arbitrary JavaScript outcomes or that every generated explanation is correct. Its [implementation](https://github.com/iris-sast/iris) is a reference for the architecture, not an installation proposal; the complete stack and model requirements would need a separate suitability check.

### Asking a model to act like a formal analyzer is insufficient

The original [abstract-interpretation study](https://arxiv.org/html/2503.12686v1) tests compositional and fixed-point prompting on 22 programs and reports logical errors and hallucinations. This is consistent with our finding that ordered labels do not enforce ordered reasoning. It does not prove all forms of decomposition fail.

### Supplying traces is not a guaranteed cure

[Do Code Semantics Help?](https://aclanthology.org/2025.findings-emnlp.548/) studies execution-derived information in code generation/repair, including training and inference. It reports limited benefit from the studied semantic representations. This is adjacent evidence, not a direct test of Atlas's explanation task. Our next experiment must therefore test whether a model preserves and explains supplied facts, rather than assume that more facts or fine-tuning will fix it.

### Repository context helps a different failure mode

[Aider's repository-map documentation](https://aider.chat/docs/repomap.html) describes selecting relevant symbols and dependencies within a context budget. That addresses finding the right code in larger repositories. Our recent failures occurred with complete tiny functions already supplied, so retrieval improvements would not directly address those particular failures. Retain repository navigation as a separate capability and evaluation track.

### Verify the local deployment before blaming model capacity

The official [Qwen2.5-Coder-7B-Instruct model card](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct) demonstrates the model's chat template and generation setup. Atlas's saved run identifies a 7.6B Q4_K_M GGUF model. That identifies the artifact format, not the cause of its errors. Check the actual local template, stop tokens, inference defaults and effective context before assuming the results reflect the best achievable behavior of the installed model. No claim that quantization or the template is broken has been established.

## What this changes for Atlas

We already tried source context, primitive facts, typed outcomes, concrete correction, shorter prompts and single-input requests. The existing C condition could copy primitive facts while making a conflicting whole-function prediction. Repeating that same experiment with a new label would not be progress. The whole-function checker is useful but covers only 8/52 original probe outcomes; it does not verify explanations.

### Next experiment: separate semantic ability from response-format burden

Use the same already exposed development inputs and installed model. Compare plain concise text, a minimal ordinary JSON answer, and the current constrained contract. Keep source, question, generation policy and token allowance matched. Review the underlying stated outcome independently of formatting, while still rejecting invalid production contracts. Record local model identity/template/options and repeat a small frozen subset to distinguish stable failures from variation. This is a deployment/measurement audit, not another hoped-for prompt cure. Earlier A/B tests already constrain the hypothesis; the new comparison must specifically isolate contract/decoding effects rather than rerun broad workflow differences.

If plain output is also consistently wrong, stop spending effort on output formatting. If plain output is better, narrow the contract and verify that the improvement survives source/argument changes before integration. Do not relax correctness rules to make scores look better.

### Subsequent experiment: explain established evidence without overwriting it

On existing supported paths, give source-linked, input-bound facts and ask for a short causal explanation. Independently established values remain authoritative regardless of generated prose. Measure fact preservation, unsupported additions, branch reachability and explanation accuracy separately. Unsupported paths remain explicitly unverified. Do not build a full interpreter or execute arbitrary project code. Keep authored fixture observations separate from general claims.

No paid APIs, cloud free-tier dependencies, downloads, training or live testing are required for the proposed first audit. New models, fine-tuning, broader execution and additional tools are deferred. No production code changed during this research pass.

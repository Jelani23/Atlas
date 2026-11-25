# Withdrawn paid model comparison — historical proposal

**Withdrawn September 30, 2026:** the user requires the whole system to remain free. Do not run this proposal or its saved request previews. Continue with installed local models and free tools. The original proposal below is retained only as historical context.

## Decision

Run a small capability comparison against **OpenAI GPT-6.1 Sol** before expanding the local checked-analysis pilot. The tested local profiles still produce basic semantic errors or fail to finish. This proposal is a diagnostic; success would not establish production reliability.

The official model page lists coding support, structured outputs, medium reasoning, and standard prices of $2 per million input tokens and $10 per million output tokens. Availability for this account has not been checked. [Official model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol), accessed September 30, 2026.

## Exact scope

- Six authored fixtures: guard-method, trim-pipeline, utf16, regex-state, caller-truthiness and unknown-runtime.
- Two frozen conditions: A (source plus question) and D (typed predictions with the bounded checker).
- Twelve initial requests, sequentially; at most two additional correction requests for concrete independently derived conflicts. No automatic retries.
- Medium reasoning, standard service, at most 20,000 input tokens and 12,000 output/reasoning tokens per request. Stop before a request if its maximum charge would exceed the remaining budget.
- **Maximum API spend: $3.** At the documented standard rates, fourteen requests at these token ceilings total $2.24 in model charges, or $2.38 conservatively charging every input token at the listed cache-write rate. Recheck prices before execution; account taxes are separate. Use no paid tools or premium service tier.
- Request `store:false`. Only authored fixture source, fixed questions, output schemas and bounded correction evidence are eligible for transmission. Production source, conversations, knowledge stores and expected answers are excluded.
- The local model defaults and production analysis path remain unchanged.

The exact twelve initial message/schema previews are saved at `backend/.local/semantic-evaluation/proposed-cloud-requests-2026-09-30.json` (SHA-256 `cb485a2157d78055ceb86fdb6e8c554195e7bd241618548dac662ee066e93b86`). The preview is provider-neutral data and has not been sent. An API adapter and account access would be validated only after approval.

These six cases are now known diagnostics, not fresh heldouts. Keep numeric-prefix, map-reinsert, loop-continue and helper-shadow reserved for a later frozen comparison if the diagnostic succeeds. Retain separate outcome, explanation, depth, contradiction, uncertainty, citation, completion and latency measurements.

## Why approval is required

The original request explicitly requires discussion before using cloud providers. Approval here would authorize only this fixture comparison and its $3 model-charge limit. No cloud inference request or credential lookup has been made for this proposal.

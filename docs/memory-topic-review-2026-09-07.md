# Knowledge topic cleanup review — 2026-09-07

Initial read-only audit: 43 active records inspected; 24 had topics requiring review. The inventory below preserves that pre-cleanup snapshot. The reviewed cleanup has since removed 12 unrelated tags from 6 records; 19 active records still have tags requiring semantic review.

The proposed topics below have direct support in the subject, property key, or value. Topics without that textual support are review candidates, not proven errors. Aliases such as `tensura`, broader categories such as `ai_models`, and synonyms need semantic review before any bulk cleanup. Verification status applies to the claim, not every topic.

## First cleanup candidates

- Record 74: retain `dark_mode`, `ollama`, `release`; remove the macOS-specific and Qwen tags from this general dark-mode claim.
- Record 76: retain `macos`, `ollama`, `release`; remove the unrelated dark-mode and Qwen tags. `macos_compatibility` is broader than the instance-handoff claim and should be reviewed.
- Record 75: remove `dark_mode` and `macos_compatibility` from the model-support claim.
- Record 63: remove `qwen` from the release-version claim.
- Record 69: remove dark-mode, macOS-compatibility, and Qwen tags from the release-version claim.
- Record 66: remove `nvidia_nemotron_3_5_lightning`; keep decomposition on hold as previously agreed.

## Original review inventory (before cleanup)

| Record | Stored identity | Current topics | Text-supported proposal | Topics requiring review |
|---|---|---|---|---|
| 76 | ollama_release/macos_instance_handling_fixed | dark_mode, macos, macos_compatibility, ollama, qwen_3_8_27b, release | macos, ollama, release | dark_mode, macos_compatibility, qwen_3_8_27b |
| 74 | ollama_release/dark_mode_support_restored | dark_mode, macos, macos_compatibility, ollama, qwen_3_8_27b, release | dark_mode, ollama, release | macos, macos_compatibility, qwen_3_8_27b |
| 69 | ollama_release_195_6/release_version | ollama, release, dark_mode, macos_compatibility, qwen_3_8_27b | ollama, release | dark_mode, macos_compatibility, qwen_3_8_27b |
| 64 | ollama_version/latest_stable_version | ollama, release, changes | ollama | release, changes |
| 63 | ollama_release/latest_stable_version | ollama, release, qwen | ollama, release | qwen |
| 75 | ollama_release/qwen_3_8_27b_model_added | dark_mode, macos_compatibility, ollama, qwen, qwen_3_8_27b, release | ollama, qwen, qwen_3_8_27b, release | dark_mode, macos_compatibility |
| 79 | qwen_3_8_max/capabilities | qwen, model_family, latest_release | qwen | model_family, latest_release |
| 78 | qwen_3_8_max/release_date | qwen, model_family, latest_release | qwen | model_family, latest_release |
| 77 | qwen_3_8_max/parameter_count | qwen, model_family, latest_release | qwen | model_family, latest_release |
| 42 | huggingface_qwen3_8_27b/model_name | huggingface, ai_models, qwen | huggingface, qwen | ai_models |
| 80 | qwen_3_5/release_status | qwen, model_family, previous_release | qwen | model_family, previous_release |
| 43 | huggingface_kimi_k3/model_name | huggingface, ai_models, kimi | huggingface, kimi | ai_models |
| 44 | huggingface_muse_glimmer_30b/model_name | huggingface, ai_models, muse | huggingface, muse | ai_models |
| 41 | meta_llama_400b/model_name | meta, ai_models, 2026 | meta | ai_models, 2026 |
| 48 | kimi_k3/parameters | kimi_k3, open-weight_model, moonshotai | kimi_k3 | open_weight_model, moonshotai |
| 49 | kimi_k3/license | kimi_k3, open-weight_model, moonshotai | kimi_k3 | open_weight_model, moonshotai |
| 50 | kimi_k3/architecture | kimi_k3, open-weight_model, moonshotai | kimi_k3 | open_weight_model, moonshotai |
| 51 | kimi_k3/model_type | kimi_k3, open-weight_model, moonshotai | kimi_k3, open_weight_model | moonshotai |
| 52 | kimi_k3/benchmark_performance | kimi_k3, open-weight_model, moonshotai | kimi_k3 | open_weight_model, moonshotai |
| 53 | kimi_k3/capabilities | kimi_k3, open-weight_model, moonshotai | kimi_k3 | open_weight_model, moonshotai |
| 60 | neuro_sama/creator | neuro_sama, vedal, ai_vtuber, twitch | neuro_sama, vedal | ai_vtuber, twitch |
| 61 | neuro_sama/evil_neuro_characteristics | neuro_sama, evil_neuro, ai_models | neuro_sama, evil_neuro | ai_models |
| 66 | ollama_release/qwen3_8_support | ollama, qwen3_8, nvidia_nemotron_3_5_lightning | ollama, qwen3_8 | nvidia_nemotron_3_5_lightning |
| 24 | tensei_shitara_slime_datta_ken/core_protagonists | tensura, main_characters, tempests_heart | (none) | tensura, main_characters, tempests_heart |

## Implementation checkpoint

- Shared knowledgeTopicPolicy checks every meaningful part of a tag against the stored claim and preserves numeric model qualifiers.
- Normal knowledge writes and atomic decomposition use the same policy; verification status is not promoted by topic filtering.
- Migration 010 replaces the merge function so future cleanup merges retain the survivor’s topics rather than combining source topics.
- The user confirmed migration 010 was run successfully.
- Migration 009 and decomposition event 1 were completed previously. Record 65 remains superseded by destinations 74 and 76.
- Applied the removal-only plan in `knowledge-topic-cleanup-reviewed.json` to records 63, 66, 69, 74, 75, and 76. Retained `macos_compatibility` on record 76 pending semantic review. Record 66 decomposition remains on hold.
- All six live records were checked against their post-write snapshots. Claim values, verification fields, and evidence were preserved; only topics and update timestamps changed.
- Actual search-tool checks returned only record 74 for dark-mode support, record 76 for macOS instance handoff, and records 75 and 66 for Ollama Qwen model support.
- Record 74's stored status remains `verified`, but its freshness deadline passed on September 4, 2026. Retrieval correctly treats it as provisional until reverified; topic cleanup did not cause that expiration.
- Cleanup tests cover removal-only validation, stale records, write-ahead journal failures, conditional updates, and guarded rollback. Topic policy tests also passed.

## Recovery

The cleanup script defaults to read-only preview and writes a private, ignored recovery journal before each database update. It refuses to overwrite records changed since review. Rollback also refuses to overwrite subsequent edits or proceed through uncertain writes.

Applied journal: `backend/.local/knowledge-topic-cleanup/1788814732293-92f42561-4284-4637-a472-af23b4c2fafc.jsonl`. Keep this local file; it is not included in Git commits.

If rollback is needed, run from `backend`:

```powershell
npm run knowledge:topic-cleanup -- rollback .local/knowledge-topic-cleanup/1788814732293-92f42561-4284-4637-a472-af23b4c2fafc.jsonl --apply
```

The reviewed plan contains the original snapshots and is not intended to be reapplied after this cleanup. Further cleanup requires a fresh audit and review; ambiguous aliases and broader categories were deliberately retained.

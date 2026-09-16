# Factual answers and a sourced knowledge foundation

## Confirmed failure

The reported Neuro-sama answer used no retrieved knowledge and no web tool. It was generated from the local model while unverified knowledge was withheld. This is an answer-policy gap, not evidence that the personality pass deleted knowledge.

A read-only Supabase inspection on September 14 found three existing `neuro_sama` rows: 60 (creator), 61 (Evil Neuro characteristics), and 62 (streaming platform). All are `needs_source`, with only `web_search: Can you look up information on Neuro-sama?` as provenance. The data exists but is intentionally excluded from trusted retrieval. We did not inspect or repair all reflections, so contamination of older summaries remains unassessed.

Retrieval also stripped punctuation rather than separating words, making `Neuro-sama` and `Neuro sama` different terms. Recall wording could add irrelevant anchor requirements. Factual overview requests now extract the subject for lookup, and hyphen/underscore boundaries normalize consistently. This is not full alias/entity resolution; `Neurosama`, spelling errors and pronouns need separate coverage.

## Implemented boundary

Complete requests such as “What do you know about X?”, “What all do you remember about X?”, “Could you tell me about X?” and “Who is X?” use checked, relevant, active records or give a short evidence-gap answer. The model cannot fill missing details on these recognized paths. Actual tools, personal recall, operating-guide topics, creative requests and compound actions keep their existing owners. These recall questions do not launch extraction.

This deliberately makes unsupported factual overviews conservative, including familiar topics with no checked records. It does not classify every factual question or guarantee model-generated answers elsewhere. Search synthesis, deeper technical explanations and unrecognized paraphrases still need evaluation. General synthesis now receives explicit uncertainty/correction guidance without depending on the disabled remote preprocessing path. Reasonable inferences should name their basis; fictional stories and jokes remain allowed. A disclaimer does not rehabilitate a fabricated biography.

Reflections receive stronger attribution instructions so rejected assistant claims do not become factual anchors. This is prompt guidance, not a deterministic validator or a cleanup of existing reflections. Alice's profile/personality source was not edited.

The capability-inventory paraphrase reported by the user now shares the executable inventory route, and the list uses descriptive labels without repeated function identifiers. Internal names remain available for explicit argument/contract explanations.

## Targeted repair ready for the user

Run [repair-neuro-knowledge-2026-09-14.sql](sql/repair-neuro-knowledge-2026-09-14.sql) once in Supabase after reviewing these replacements:

| Row | Replacement | Evidence |
|---|---|---|
| 60 | Neuro-sama is an AI VTuber created by Vedal. | [Vedal's creator profile](https://github.com/Vedal987) |
| 61 | The official site presents Evil Neuro as Neuro-sama's twin sister and an AI VTuber. | [Official site](https://vedal.ai/) |
| 62 | Neuro-sama's official site links to the Twitch channel vedal987 for live streams. | [Official links](https://vedal.ai/) |

This is an administrative, manually reviewed data repair, not a new migration or a bulk verification of old records. It retains the IDs and identities, removes unsupported legacy specifics, records the previous and replacement values in verification history, and requires the inspected values/status/timestamps. A mismatch or rerun aborts the transaction. No production writes were performed by Codex. Restart Atlas after running it to invalidate the separate backend process's memory cache.

## Starter collection to build next

Start with durable, sourced descriptions; collect dated news separately. These pages were inspected for the narrow candidate claims below. They have not been imported. Do not infer that every statement or outbound link on an official site is verified.

| Topic | Candidate foundation | Primary source |
|---|---|---|
| NBA | NBA stands for National Basketball Association, a professional basketball league in North America. | [NBA overview](https://www.nba.com/news/about) |
| Minecraft | Minecraft is a sandbox game involving building, exploration, crafting and survival. | [Minecraft introduction](https://www.minecraft.net/en-us/about-minecraft) |
| Celeste | Publisher-provided game information and mechanics; inspect the relevant description before extracting individual claims. | [Publisher's store page](https://maddymakesgamesinc.itch.io/celeste), linked from [official game site](https://www.celestegame.com/) |
| Streaming | Twitch hosts live communities across gaming, music, sports and other categories. | [Twitch about page](https://www.twitch.tv/p/en/about/) |
| VTubers / Alice's interests | hololive production manages the hololive and HOLOSTARS talent groups. | [Official introduction](https://hololivepro.com/en/about/) |
| Neuro / Evil / Vedal | Use the three reviewed corrections above as the initial foundation; keep character lore separate from implementation claims. | [Official site](https://vedal.ai/), [creator](https://github.com/Vedal987) |

Timberwolves updates, other games, artists and groups can follow once the first collection passes retrieval checks. Do not store guessed private model architecture, voice engine, licenses, current rankings or schedules.

## Passive learning design (prepared, disabled by default)

Reuse the existing ingestion/review/verification system instead of adding another competing knowledge store:

1. Configure topics and exact source identities, independently of Alice's personality. An interest can influence collection priorities without making her generated opinions evidence.
2. Prefer supported feeds/APIs or bounded public-page reads. Limit requests, page sizes, redirects and timeouts; respect access restrictions. Deduplicate fetched material by URL and content hash. No recursive unlimited scrape.
3. Retain URL, publisher, retrieval date, publication date when available, and the specific supporting passage. Page instructions are untrusted content, never executable directions.
4. Extract small claims into provisional candidates through the existing canonicalization and ingestion path. Changed facts use the conflict-review queue; no scraped payload can declare itself verified.
5. Verify the actual claim, source identity and temporal scope. Existing `isPrimarySourceUrl` uses subject/domain token heuristics: it cannot reliably establish that `vedal.ai` is authoritative for `neuro_sama`, and similarly named domains are insufficient proof. Replace that shortcut with reviewed entity/source relationships before unattended promotion. A search success marker or URL match is not claim verification.
6. Keep news dated and expire/recheck time-sensitive claims. Freshness must not turn an old event into today's state. On no results, retain uncertainty rather than inventing negative facts.
7. Schedule bounded work while Alice is idle, yielding to foreground requests. Start with one daily batch only after choosing the request budget and validating the first source set. No Codex automation or production collection has been enabled.

The first bounded implementation is prepared but remains off. `backend/src/learning/sources.js` contains a reviewed exact-URL registry; `collector.js` enforces HTTPS scope, bounded redirects, robots rules, crawl delays, content-size limits, publication dates, and fingerprints; and `worker.js` leases one source at a time, yields to foreground requests, skips unchanged content, and routes new claims through the existing provisional ingestion path. Migration 015 adds the lease and run audit tables/functions. Apply it manually before enabling the worker. `KNOWLEDGE_LEARNING_ENABLED=false` remains the default, and scraped material is not promoted to verified knowledge automatically.

Before enabling a source: apply migration 015, review the source list and request budget, run the collector fixture tests, then enable one or two sources in a local `.env`. Inspect candidate claims, detect existing identities, exercise conflict handling, and demonstrate a correct fresh-session recall with provenance retained. A larger library improves coverage; it does not itself solve hallucination or relevance.

## Validation and next live checks

The full offline memory/tool/personality runner passed **72/72 test files** after these changes. `git diff --check` passed. No production data was written, no model benchmark was run, and no unattended collection was enabled.

Offline coverage includes punctuation/recall paraphrases, unrelated and quarantined records, expired/superseded evidence, explicit hypotheses, personality/capability exclusions, the actual conversation controller with stubbed external dependencies, and passive-learning URL/robots/lease boundaries. The data repair is executed against embedded PostgreSQL with the real verification migration; tests cover a changed third row rolling back earlier updates, successful repair plus recall, unrelated-row preservation, verification audit entries and safe rerun rejection. These are not live Supabase concurrency tests or a comprehensive truth benchmark.

After the repair and backend restart, use a fresh chat:

- What do you know about Neuro sama?
- What all do you remember about Neuro-sama?
- What are all the tools that you have available to use?
- Give me a dry one-line joke about debugging.

The first two should use the narrowed checked facts, with no university, downloadable voice-model or private architecture claims. The third should list actual operations without duplicate function names. The joke should remain ordinary personality-driven conversation. Keep factual recall, inference, humor, memory correction, capability explanations and tool routing together in regression runs rather than declaring a subsystem complete after one happy-path test.

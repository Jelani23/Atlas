# Atlas - Stage 1

A CLI conversation loop that implements the first stage of the roadmap: Conversation Engine.
Every other module in the vision doc is stubbed as a real interface rather than left out, so
later stages attach without rewriting what's already here.

## Structure

```
src/
  index.js                     CLI loop (the Stage 1 interface)
  core/
    conversationEngine.js      the hub - wires personality, memory, planner, model adapter
    personalityEngine.js       the four modes from the character sheet
  memory/
    workingMemory.js           active in Stage 1: the live conversation buffer
    longTermProfile.js         stub - Stage 2 confidence-scored observations
    knowledgeLibrary.js        stub - Stage 2 documents/code/notes retrieval
    reflectionJournal.js       stub - Stage 7 Reflection Engine output
    index.js                   aggregates all four stores
  planner/
    planner.js                 stub - Stage 3 tool routing, currently a pass-through
  models/
    modelAdapter.js            registry - the only file that knows which provider is active
    providers/
      openai.js                first concrete provider
```

## Running it

```
npm install
cp .env.example .env
# put your OPENAI_API_KEY in .env
npm start
```

Commands inside the CLI:
- `/mode work|creative|casual|emergency` - switch personality mode
- `/reset` - clear the conversation buffer
- `/exit` - quit

## Providers

Two are registered right now:

- **qwen** (default) - Qwen3-235B-A22B via [OpenRouter](https://openrouter.ai), free tier,
  no credit card required. OpenRouter also hosts newer Qwen releases (3.5/3.6/3.7/3.8), but
  as of this writing those are metered API-only - the open-weight, actually-free models are
  still in the Qwen3 line. `qwen/qwen3-coder:free` is a drop-in swap if you want a
  coding-tuned personality instead of the general-purpose flagship - just change `QWEN_MODEL`
  in `.env`, no code changes needed. Free tier is rate-limited (roughly 20 requests/min,
  200/day at last check) and shares capacity with everyone else on it, so expect occasional
  429s - worth wrapping `modelAdapter.complete()` in retry logic once this stops being a toy.
- **openai** - still registered, switch `ATLAS_MODEL_PROVIDER=openai` in `.env` to use it.

### Adding another provider

This is the point of the Model Adapter: nothing outside `models/` should ever import a
provider directly, or know its request/response shape.

1. Create `src/models/providers/<name>.js` exporting a single function:
   `complete(messages, options) -> Promise<string>`. `messages` is always the OpenAI-style
   `[{ role, content }]` array regardless of provider - translate to that provider's actual
   request format inside this file. (`providers/qwen.js` is a good template - it's the OpenAI
   SDK pointed at a different `baseURL`, which works for any OpenAI-compatible endpoint.)
2. Register it in `src/models/modelAdapter.js`'s `providers` object.
3. Set `ATLAS_MODEL_PROVIDER=<name>` in `.env`.

Nothing in `core/`, `memory/`, or `planner/` changes.

## Where this goes next (Stage 2)

- Working memory already appends every turn as `{ role, content }`. Stage 2's job is
  turning that into observations with confidence scores that graduate into
  `longTermProfile` over multiple conversations, per the memory philosophy in the
  original mission doc - not just logging raw facts.
- `knowledgeLibrary.query()` and `reflectionJournal.append()` are ready to be filled in
  without touching `conversationEngine.js`.

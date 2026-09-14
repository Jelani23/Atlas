// Controls length/layout only. personalityEngine owns identity and mode tone.
function getResponseStyle(intent) {
  switch (intent.intent) {
    case "conversation":
      return {
        length: "brief unless additional detail is useful",
        formatting: "natural spoken conversation",
        allowMarkdown: false,
        allowLists: false
      };
    case "planning":
      return {
        length: "detailed when needed, but focused",
        formatting: "natural paragraphs, avoid bullet points unless strictly necessary",
        allowMarkdown: false, 
        allowLists: false
      };
    case "coding":
      return {
        length: "detailed technical explanation",
        formatting: "use code blocks and structured sections when helpful",
        allowMarkdown: true,
        allowLists: true
      };
    case "search":
      return {
        // Phase: this used to be hard-capped at "1-2 sentences. Concise
        // summary." - which meant even once this style actually engages
        // (see conversationEngine.js's intent.intent fix), the model was
        // being told to compress everything it found into one or two
        // sentences no matter how much substance was there. The goal now
        // is genuine comprehension: read everything the search pipeline
        // gathered and produce ONE complete, coherent answer - as long as
        // it needs to be to actually convey what was found, not padded,
        // not artificially trimmed.
        length: "as long as the information actually requires - a couple sentences for a simple factual answer, a full paragraph or more for anything with real substance. Never compress genuinely useful detail just to sound brief.",
        formatting: "one single, coherent, synthesized answer written in your own words after actually reading and comprehending everything the search turned up - not a per-source or per-query recap, not a stitched-together list of snippets, and not a bare copy of any one result",
        allowMarkdown: false,
        allowLists: false
      };
    case "memory":
      return {
        length: "brief for simple recall; include the details the user requested",
        formatting: "natural conversational response",
        allowMarkdown: false,
        allowLists: false
      };
    case "action":
      return {
        length: "brief, reporting the actual outcomes or failures",
        formatting: "natural conversational response",
        allowMarkdown: false,
        allowLists: false
      };
    default:
      return {
        length: "balanced",
        formatting: "natural conversation",
        allowMarkdown: false,
        allowLists: false
      };
  }
}

module.exports = {
  getResponseStyle
};

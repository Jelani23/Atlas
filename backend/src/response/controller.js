function getResponseStyle(intent) {
  switch (intent.intent) {
    case "conversation":
      return {
        length: "brief unless additional detail is useful",
        formatting: "natural spoken conversation",
        allowMarkdown: false,
        allowLists: false,
        tone: "calm, familiar, and conversational"
      };
    case "planning":
      return {
        length: "detailed when needed, but focused",
        formatting: "natural paragraphs, avoid bullet points unless strictly necessary",
        allowMarkdown: false, 
        allowLists: false, 
        tone: "analytical, collaborative, and thoughtful"
      };
    case "coding":
      return {
        length: "detailed technical explanation",
        formatting: "use code blocks and structured sections when helpful",
        allowMarkdown: true,
        allowLists: true,
        tone: "precise and instructional"
      };
    case "search":
      return {
        length: "1-2 sentences. Concise summary.",
        formatting: "natural conversational response",
        allowMarkdown: false,
        allowLists: false,
        tone: "informative and direct"
      };
    case "memory":
      return {
        length: "short and direct",
        formatting: "natural conversational response",
        allowMarkdown: false,
        allowLists: false,
        tone: "neutral and acknowledging"
      };
    case "action":
      return {
        length: "1 sentence confirming the action",
        formatting: "natural conversational response",
        allowMarkdown: false,
        allowLists: false,
        tone: "helpful and direct"
      };
    default:
      return {
        length: "balanced",
        formatting: "natural conversation",
        allowMarkdown: false,
        allowLists: false,
        tone: "calm and helpful"
      };
  }
}

module.exports = {
  getResponseStyle
};
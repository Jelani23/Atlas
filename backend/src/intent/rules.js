const INTENT_PATTERNS = {
  memory: {
    strong: [
      "remember", "do you remember", "what do you know about me", 
      "don't forget", "keep in mind", "what have we talked about", 
      "memory", "update my memory", "what did we discuss", "report",
      "learning style", "describe myself", "tell you about", "profile",
      "snippet", "knowledge", "procedural memory", "operational rules",
      "rely on", "compare", "look for", "clarification", "guideline",
      "rule", "rules", "self improvement", "self-improvement"
    ],
    weak: [
      "my favorite", "i like", "i prefer", "my birthday", 
      "saved", "stored", "learned", "know about"
    ]
  },
  search: {
    strong: ["latest", "news", "today", "current", "recent", "look up", "search", "find a link", "send me a link", "website"],
    weak: ["research", "find out", "what happened", "how many", "most", "subscribers", "followers", "how about", "who is the", "what is the", "link", "url"]
  },
  coding: {
    strong: ["debug", "error", "bug", "fix this", "implementation", "function", "class", "database", "schema", "query", "code"],
    weak: ["javascript", "python", "sql", "css", "html", "program", "backend", "frontend", "api"]
  },
  planning: {
    strong: ["architecture", "roadmap", "strategy", "design", "plan"],
    weak: ["brainstorm", "idea", "ideas", "structure", "organize", "approach", "how should", "what should", "come up with", "build"]
  },
  action: {
    strong: [
      "calculate", "convert", "timezone", "read", "open", "show me",
      "update", "edit", "append", "add to", "add in", "delete", "remove", "list",
      "write", "save", "create", "file", "note", "find code"
    ],
    weak: ["what is the math", "solve this", "times", "plus", "minus", "divided by", "jst", "est", "pst", "gmt"]
  }
};

function scoreIntent(message, pattern) {
  let score = 0;
  for (const keyword of pattern.strong) {
    if (message.includes(keyword)) score += 3;
  }
  for (const keyword of pattern.weak) {
    if (message.includes(keyword)) score += 1;
  }
  return score;
}

function detectIntent(message) {
  const text = message.toLowerCase();
  const scores = {};

  for (const intent in INTENT_PATTERNS) {
    scores[intent] = scoreIntent(text, INTENT_PATTERNS[intent]);
  }

  const sorted = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  console.log("Intent Scores:", scores);

  if (sorted.length === 0) {
    return { primary: "conversation", secondary: [] };
  }

  const primary = sorted[0][0];
  const secondary = sorted.slice(1).map(([intent]) => intent);

  return { primary, secondary };
}

module.exports = { detectIntent };
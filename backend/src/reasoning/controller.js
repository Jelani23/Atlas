function getReasoningOptions(route) {
  // Model selection lives in models/modelRouter.js now - this function only
  // decides how hard the chosen model should think, not which model it is.
  switch (route.reasoning) {
    case "none":
      return { think: true, temperature: 0.3 };
    case "low":
      return { think: true, temperature: 0.5 };
    case "medium":
      return { think: true, temperature: 0.6 };
    case "high":
      return { think: true, temperature: 0.7 };
    default:
      return { think: true, temperature: 0.5 };
  }
}

module.exports = { getReasoningOptions };
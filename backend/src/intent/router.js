const { detectIntent } = require("./intentAnalyzer");

async function route(message) {
  const intentResult = await detectIntent(message);
  const primaryIntent = intentResult.primary;

  const routeData = {
    intent: primaryIntent,
    secondaryIntents: intentResult.secondary,
    reasoning: "low",
    memory: "retrieve",
    search: false,
    action: false,
    tools: [],
    contextRequired: true
  };

  switch (primaryIntent) {
    case "memory":
      routeData.reasoning = "none";
      routeData.memory = "retrieve";
      routeData.contextRequired = true;
      break;
    case "search":
      routeData.reasoning = "medium";
      routeData.search = true;
      break;
    case "coding":
      routeData.reasoning = "high";
      routeData.contextRequired = true;
      break;
    case "planning":
      routeData.reasoning = "high";
      routeData.contextRequired = true;
      break;
    case "action":
      routeData.reasoning = "low";
      routeData.action = true;
      routeData.contextRequired = false;
      break;
    case "conversation":
      routeData.reasoning = "low";
      routeData.contextRequired = false;
      break;
    default:
      break;
  }

  return routeData;
}

module.exports = { route };
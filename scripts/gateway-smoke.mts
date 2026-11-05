// One small AI Gateway request to verify credentials (OIDC token or API key). Prints no secrets.
import { generateText } from "ai";
const model = process.env.AI_MODEL ?? "google/gemini-3.8-flash";
const r = await generateText({ model, prompt: "Reply with exactly: gateway ok" });
console.log("model:", model);
console.log("text:", r.text.trim());
console.log("usage:", JSON.stringify(r.usage));
console.log("provider metadata keys:", Object.keys(r.providerMetadata ?? {}));

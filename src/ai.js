// Provider-neutral AI calls, straight from the browser with the key saved on
// this device. Anthropic uses its Messages API; everything else speaks the
// OpenAI-compatible chat/completions format (DeepSeek, Qwen, Kimi, GLM, ...).

import { getDevice } from "./sync.js";

// Model names are defaults only; every field stays editable in the app.
export const AI_PROVIDERS = {
  anthropic: {
    label: "Claude (Anthropic)",
    base: "https://api.anthropic.com/v1",
    model: "claude-sonnet-5",
    visionModel: "",
    keyHint: "sk-ant-…",
    note: "Needs a VPN on a mainland network. Reads screenshots and scanned PDFs.",
  },
  deepseek: {
    label: "DeepSeek",
    base: "https://api.deepseek.com",
    model: "deepseek-chat",
    visionModel: "",
    keyHint: "sk-…",
    note: "Reachable in mainland China. Text only: paste the email or use .eml/PDF, not screenshots.",
  },
  qwen: {
    label: "Qwen (Alibaba Cloud Model Studio)",
    base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    visionModel: "qwen-vl-max",
    keyHint: "sk-…",
    note: "Reachable in mainland China. Uses the vision model for screenshots.",
  },
  kimi: {
    label: "Kimi (Moonshot)",
    base: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-32k",
    visionModel: "moonshot-v1-32k-vision-preview",
    keyHint: "sk-…",
    note: "Reachable in mainland China.",
  },
  glm: {
    label: "GLM (Zhipu)",
    base: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    visionModel: "glm-4v-flash",
    keyHint: "…",
    note: "Reachable in mainland China.",
  },
  custom: {
    label: "Other OpenAI-compatible",
    base: "",
    model: "",
    visionModel: "",
    keyHint: "…",
    note: "Any endpoint that speaks /chat/completions. Leave the vision model blank if it can't read images.",
  },
};

export function aiConfig(dev = getDevice()) {
  const id = AI_PROVIDERS[dev.aiProvider] ? dev.aiProvider : "anthropic";
  const p = AI_PROVIDERS[id];
  return {
    id,
    label: p.label,
    key: (dev.aiKey || "").trim(),
    base: (dev.aiBase || p.base).trim().replace(/\/+$/, ""),
    model: (dev.aiModel || p.model).trim(),
    // Anthropic models read images themselves; others need a separate vision model.
    visionModel: id === "anthropic" ? (dev.aiModel || p.model).trim() : (dev.aiVisionModel ?? p.visionModel).trim(),
  };
}

export const aiReady = (dev = getDevice()) => !!aiConfig(dev).key && !!aiConfig(dev).base && !!aiConfig(dev).model;

export function extractJSON(text) {
  if (!text) throw new Error("Empty response");
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```json/gi, "```");
  const fence = cleaned.match(/```([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch (e) { /* fall through */ } }
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch !== "[" && ch !== "{") continue;
    const close = ch === "[" ? "]" : "}";
    const end = cleaned.lastIndexOf(close);
    if (end <= i) continue;
    try { return JSON.parse(cleaned.slice(i, end + 1)); } catch (e) { /* keep scanning */ }
  }
  throw new Error("Couldn't read the AI response as data");
}

/**
 * askAI({ text, system, images: [{ mediaType, data }], maxTokens, search, dev })
 * Returns parsed JSON from the model's reply.
 */
export async function askAI({ text, system = "", images = [], maxTokens = 1500, search = false, dev } = {}) {
  const c = aiConfig(dev);
  if (!c.key) throw new Error("AI features need an API key. Add one in Wallet and rules, under This device");
  if (!c.base || !c.model) throw new Error("Set the AI endpoint and model in Wallet and rules, under This device");
  if (images.length && !c.visionModel) {
    throw new Error(`${c.label} can't read images with the current settings. Paste the email text or use the .eml/PDF instead, or set a vision model`);
  }

  let url, headers, body;
  if (c.id === "anthropic") {
    url = `${c.base}/messages`;
    headers = {
      "Content-Type": "application/json",
      "x-api-key": c.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    const content = [
      ...images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.data } })),
      { type: "text", text },
    ];
    body = { model: c.model, max_tokens: maxTokens, messages: [{ role: "user", content }] };
    if (system) body.system = system;
    if (search) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  } else {
    url = `${c.base}/chat/completions`;
    headers = { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` };
    const content = images.length
      ? [...images.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mediaType};base64,${im.data}` } })), { type: "text", text }]
      : text;
    body = {
      model: images.length ? c.visionModel : c.model,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content }],
    };
  }

  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new Error(
      c.id === "anthropic"
        ? "Can't reach Anthropic. On a mainland China network this needs a VPN"
        : `Can't reach ${c.label} from this page. Either you're offline, or the provider doesn't accept calls from web apps (CORS). Try another provider`,
    );
  }
  if (!res.ok) {
    let msg = "";
    try { const j = await res.json(); msg = j.error?.message || j.message || ""; } catch (e) { /* ignore */ }
    if (res.status === 401) throw new Error(`${c.label} rejected the API key${msg ? `: ${msg}` : ""}`);
    throw new Error(`${c.label} returned ${res.status}${msg ? `: ${msg}` : ""}`);
  }
  const data = await res.json();
  const reply = c.id === "anthropic"
    ? (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n")
    : data.choices?.[0]?.message?.content || "";
  return extractJSON(typeof reply === "string" ? reply : JSON.stringify(reply));
}

export async function testAI(dev) {
  const r = await askAI({ dev, text: 'Reply with exactly this JSON and nothing else: {"ok": true}', maxTokens: 200 });
  if (!r || r.ok !== true) throw new Error("The model answered, but not in the expected format");
  return true;
}

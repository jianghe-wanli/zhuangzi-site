/**
 * Shared DeepSeek AI utility — used by all AI-powered features.
 *
 * When deployed on Cloudflare Pages, requests are proxied through
 * /api/chat (Pages Function) for rate limiting and security.
 * Falls back to direct DeepSeek API in local development.
 */

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const PROXY_URL = "/api/chat";
const MODEL = "deepseek-v4-flash";

export function getApiKey(): string | null {
  try {
    return localStorage.getItem("deepseek_key");
  } catch {
    return null;
  }
}

/** 返回是否成功持久化（隐私模式 / 存储已满时为 false，本次会话仍可用） */
export function saveApiKey(key: string): boolean {
  try {
    localStorage.setItem("deepseek_key", key);
    return true;
  } catch {
    return false;
  }
}

export interface ChatOptions {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

async function callDirect(url: string, messages: { role: string; content: string }[], apiKey: string, opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal }): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: opts.maxTokens ?? 500,
      temperature: opts.temperature ?? 0.7,
    }),
    // exactOptionalPropertyTypes：undefined 不能直接赋给可选属性
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API 错误 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "吾默然。";
}

async function callViaProxy(messages: { role: string; content: string }[], apiKey: string, opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal }): Promise<string> {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
      messages,
      maxTokens: opts.maxTokens ?? 500,
      temperature: opts.temperature ?? 0.7,
    }),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error((errData as { error?: string }).error || `代理请求失败 (${res.status})`);
  }

  const data = await res.json();
  return data.content || "吾默然。";
}

export async function chat(options: ChatOptions): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("请先设置 DeepSeek API Key（点击右下角设置按钮）");
  }

  const messages = [
    { role: "system", content: options.systemPrompt },
    { role: "user", content: options.userMessage },
  ];

  // Try proxy first (Cloudflare Pages Function), fallback to direct
  try {
    return await callViaProxy(messages, apiKey, options);
  } catch (proxyErr) {
    // Proxy not available (local dev) or returned error — try direct
    try {
      return await callDirect(DEEPSEEK_URL, messages, apiKey, options);
    } catch {
      // If proxy already gave a meaningful error, rethrow it
      throw proxyErr;
    }
  }
}

export async function chatMultiTurn(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("请先设置 DeepSeek API Key（点击右下角设置按钮）");
  }

  // Try proxy first, fallback to direct
  try {
    return await callViaProxy(messages, apiKey, {
      temperature: opts?.temperature ?? 0.7,
      maxTokens: opts?.maxTokens ?? 500,
    });
  } catch (proxyErr) {
    try {
      return await callDirect(DEEPSEEK_URL, messages, apiKey, {
        temperature: opts?.temperature ?? 0.7,
        maxTokens: opts?.maxTokens ?? 500,
      });
    } catch {
      throw proxyErr;
    }
  }
}

/**
 * Streaming multi-turn chat — yields content deltas via onChunk.
 * Returns the complete response text.
 */
export async function chatMultiTurnStream(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  onChunk: (text: string) => void,
  opts?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("请先设置 DeepSeek API Key（点击右下角设置按钮）");
  }

  const payload = {
    key: apiKey,
    messages,
    maxTokens: opts?.maxTokens ?? 512,
    temperature: opts?.temperature ?? 0.7,
    stream: true,
  };

  let res: Response | null = null;
  try {
    res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
  } catch (err) {
    // 用户主动取消：不要再回退发起第二个请求
    if (opts?.signal?.aborted) throw err;
  }
  // 代理不存在（本地 / 纯静态托管对 POST /api/chat 返回 404/405）与网络失败
  // 同样回退直连 —— 此前只有网络异常才回退，静态托管下流式对话必然报 404，
  // 而非流式的 chat() / chatMultiTurn() 却能回退，行为不一致。
  if (!res || res.status === 404 || res.status === 405) {
    res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: payload.maxTokens,
        temperature: payload.temperature,
        stream: true,
      }),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
  }

  if (!res.ok) {
    // 代理会返回 { error } 说明原因（限流、密钥无效…），优先展示
    const detail = await res
      .json()
      .then((d: { error?: unknown }) => (typeof d?.error === "string" ? d.error : ""))
      .catch(() => "");
    throw new Error(detail || `API 请求失败 (${res.status})`);
  }

  // Parse SSE stream
  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法读取响应流");

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    // 流结束时把最后一行（可能没有换行结尾）也处理掉
    buffer = done ? "" : lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk(delta);
        }
      } catch {
        // Skip unparseable chunks
      }
    }
    if (done) break;
  }

  return fullText || "吾默然。";
}

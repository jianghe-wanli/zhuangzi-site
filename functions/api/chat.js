// ──────────────────────────────────────────
// Cloudflare Pages Function — DeepSeek API 代理
//
// 架构说明（重要）：
// 本站是 BYOK（Bring Your Own Key）模式 —— API Key 由访问者自备，存在其
// 浏览器 localStorage，随请求体发到本函数再转发给 DeepSeek。
// 这个设计有两个固有弱点，短期靠加固缓解，长期建议改造（见 roadmap）：
//   a) 本函数曾是**无鉴权开放中继**：任何人都能 POST /api/chat 拿本站当
//      免费代理刷 DeepSeek（自带 key 即可），并借本站 IP 规避风控。
//      现加同源校验 + 限流 + 模型白名单收口。
//   b) 用户 key 途经第三方（本站）。已确保不落日志、不入缓存；但根治办法
//      是要么浏览器直连 DeepSeek（不经代理），要么服务端自持 key + 自建配额。
// ──────────────────────────────────────────

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// 只允许本站在用的模型，防止被拿去调用更贵的模型
const ALLOWED_MODELS = new Set(["deepseek-v4-flash"]);
const DEFAULT_MODEL = "deepseek-v4-flash";

// ── 输入上限（防成本放大 / 滥用）──
const LIMITS = {
  maxBodyBytes: 128 * 1024, // 128KB
  maxMessages: 40,
  maxCharsPerMessage: 8_000,
  maxTotalChars: 40_000,
  maxTokensCap: 2_048,
  upstreamTimeoutMs: 60_000,
};

// ── 限流 ──
// 原实现用模块作用域的 `new Map()` 计数，在 Workers 上基本无效：
// 每个 isolate 各有一份内存、随时被回收、且同一 IP 会落到不同 colo/isolate。
// 这里改用 Cache API —— Cloudflare 的 caches.default 在同一 colo 内共享，
// 是无需额外绑定即可用的近似方案（KV/Durable Objects 更严格，但需配置）。
const RATE = { windowSec: 60, maxRequests: 20 };

async function checkRateLimit(ip) {
  try {
    const cache = caches.default;
    // 用假 URL 作为计数键
    const bucket = Math.floor(Date.now() / 1000 / RATE.windowSec);
    const key = new Request(
      `https://rate-limit.internal/${encodeURIComponent(ip)}/${bucket}`,
      { method: "GET" }
    );
    const hit = await cache.match(key);
    const count = hit ? Number(await hit.text()) || 0 : 0;
    if (count >= RATE.maxRequests) return false;
    await cache.put(
      key,
      new Response(String(count + 1), {
        headers: { "Cache-Control": `max-age=${RATE.windowSec}` },
      })
    );
    return true;
  } catch {
    // 限流设施异常时不阻断正常用户（fail-open），但上面的输入校验仍生效
    return true;
  }
}

// public/_headers 不作用于 Functions 的响应，安全头必须在这里自己带上。
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...BASE_HEADERS, ...extraHeaders },
  });
}

function jsonError(message, status, extraHeaders) {
  return json({ error: message }, status, extraHeaders);
}

/**
 * 按**字节**读请求体并设上限。
 * 原实现先 request.text() 整体读入、再用 raw.length 比较：length 是 UTF-16 码元数，
 * 中文每字 3 字节，实际放行的是 128KB 的 3 倍；且不带 Content-Length（chunked）
 * 的请求会被完整缓冲后才检查。这里边读边数，超限立即停止。
 * 返回 null 表示超限。
 */
async function readBodyCapped(request, maxBytes) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}

/** 取有限数值并夹紧；非数值（undefined / NaN / 字符串垃圾）用默认值。 */
function clampNumber(value, fallback, min, max) {
  const n = typeof value === "number" ? value : Number.NaN;
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, min), max);
}

// key 会进 Authorization 头：只接受可见 ASCII，拒绝空白 / 换行 / 非 ASCII，
// 否则 fetch 抛 TypeError，用户只会看到莫名的「服务暂时不可用」。
const KEY_PATTERN = /^[\x21-\x7E]{8,256}$/;

/** 只接受来自本站页面的请求，杜绝被当作公开中继。 */
function isSameOrigin(request) {
  // 现代浏览器都会带 Sec-Fetch-Site，且页面脚本无法伪造；带了就必须是 same-origin
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const self = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === self;
  // 某些客户端不带 Origin，退而校验 Referer
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === self;
    } catch {
      return false;
    }
  }
  // 两者皆无 → 非浏览器页面发起，拒绝
  return false;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "缺少对话内容";
  if (messages.length > LIMITS.maxMessages) return "对话轮次过多";
  let total = 0;
  for (const m of messages) {
    if (!m || typeof m !== "object") return "对话格式不正确";
    if (!["system", "user", "assistant"].includes(m.role)) return "对话角色不合法";
    if (typeof m.content !== "string" || m.content.length === 0) return "对话内容不能为空";
    if (m.content.length > LIMITS.maxCharsPerMessage) return "单条消息过长";
    total += m.content.length;
  }
  if (total > LIMITS.maxTotalChars) return "对话内容总长超限";
  return null;
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    // 同源使用，无需放开跨域；显式回 405 之外给出允许的方法
    return new Response(null, { status: 204, headers: { Allow: "POST", ...BASE_HEADERS } });
  }
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405, { Allow: "POST" });
  }
  if (!isSameOrigin(request)) {
    return jsonError("仅允许本站页面调用", 403);
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError("Content-Type 必须为 application/json", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > LIMITS.maxBodyBytes) {
    return jsonError("请求体过大", 413);
  }

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkRateLimit(ip))) {
    return jsonError("请求太频繁，请稍后再试", 429, { "Retry-After": String(RATE.windowSec) });
  }

  let body;
  try {
    const raw = await readBodyCapped(request, LIMITS.maxBodyBytes);
    if (raw === null) return jsonError("请求体过大", 413);
    body = JSON.parse(raw);
  } catch {
    return jsonError("请求体不是合法 JSON", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("请求体不是合法 JSON", 400);
  }

  const { messages, stream, model } = body;
  const key = typeof body.key === "string" ? body.key.trim() : "";

  if (!key) {
    return jsonError("请先设置 DeepSeek API Key", 401);
  }
  if (!KEY_PATTERN.test(key)) {
    return jsonError("API Key 格式不正确", 401);
  }
  const invalid = validateMessages(messages);
  if (invalid) return jsonError(invalid, 400);

  if (model !== undefined && !ALLOWED_MODELS.has(model)) {
    return jsonError("不支持的模型", 400);
  }

  // 客户端可调的采样参数一律夹紧到安全区间，避免成本放大
  // 原写法 `Number(body.temperature) ?? 0.7`：缺省时 Number(undefined) 是 NaN，
  // ?? 拦不住 NaN，序列化后上游收到的是 temperature: null。
  const maxTokens = Math.floor(clampNumber(body.maxTokens, 512, 1, LIMITS.maxTokensCap));
  const temperature = clampNumber(body.temperature, 0.7, 0, 2);

  const payload = {
    model: model && ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL,
    // 只转发 role / content，丢弃客户端夹带的其他字段（name、tool_calls…）
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
    temperature,
    stream: stream === true,
  };

  // 上游超时保护：Workers 请求本身有时限，但显式 abort 能让我们回可读错误
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.upstreamTimeoutMs);

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      // 不再把上游原始错误文本回传给客户端 —— 那可能包含账户/配额/内部
      // 提示等信息。只按状态码映射为面向用户的话术。
      const status = response.status;
      const message =
        status === 401 || status === 403
          ? "API Key 无效或无权限"
          : status === 402
            ? "DeepSeek 账户余额不足"
            : status === 429
              ? "上游限流，请稍后再试"
              : status >= 500
                ? "上游服务暂时不可用"
                : "请求被上游拒绝";
      // 上游 5xx 统一回 502，避免把上游的任意状态码（如 Cloudflare 的 52x）透传出去
      return jsonError(message, status >= 500 ? 502 : status);
    }

    // ── 流式：直接转发 SSE ──
    if (payload.stream) {
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          ...BASE_HEADERS,
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ── 非流式 ──
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "吾默然。";

    return json({ content });
  } catch (err) {
    if (err?.name === "AbortError") return jsonError("上游响应超时", 504);
    return jsonError("服务暂时不可用", 502);
  } finally {
    clearTimeout(timer);
  }
}

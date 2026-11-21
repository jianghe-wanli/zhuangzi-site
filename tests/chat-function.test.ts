/**
 * functions/api/chat.js（Cloudflare Pages Function）的安全与健壮性测试。
 * 用 Node 自带的 Request / Response 直接调用 onRequest，上游 fetch 用桩替换。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onRequest } from "../functions/api/chat.js";

const ORIGIN = "https://zhuangzi.test";
const KEY = "sk-0123456789abcdef";

interface UpstreamCall {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
  signal: AbortSignal;
}

let upstreamCalls: UpstreamCall[];
let upstream: (signal: AbortSignal) => Response | Promise<Response>;
let rateStore: Map<string, Response>;

function post(body: unknown, headers: Record<string, string> = {}, raw?: BodyInit, signal?: AbortSignal) {
  return new Request(`${ORIGIN}/api/chat`, {
    ...(signal ? { signal } : {}),
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: raw ?? JSON.stringify(body),
  });
}
const call = (request: Request): Promise<Response> => onRequest({ request });
const errorOf = async (res: Response) => ((await res.json()) as { error?: string }).error;
const validBody = (extra: Record<string, unknown> = {}) => ({
  key: KEY,
  messages: [{ role: "user", content: "何谓逍遥？" }],
  ...extra,
});

beforeEach(() => {
  upstreamCalls = [];
  upstream = () => Response.json({ choices: [{ message: { content: "逍遥者，无待也。" } }] });
  rateStore = new Map();
  vi.stubGlobal("caches", {
    default: {
      match: async (req: Request) => rateStore.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => void rateStore.set(req.url, res),
    },
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    upstreamCalls.push({
      url,
      headers: new Headers(init.headers),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      signal: init.signal as AbortSignal,
    });
    return upstream(init.signal as AbortSignal);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("/api/chat 准入", () => {
  it("非 POST → 405 且带 Allow；OPTIONS → 204", async () => {
    const res = await call(new Request(`${ORIGIN}/api/chat`, { headers: { origin: ORIGIN } }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    const opt = await call(new Request(`${ORIGIN}/api/chat`, { method: "OPTIONS" }));
    expect(opt.status).toBe(204);
  });

  it("跨源 Origin / 无 Origin 无 Referer / Sec-Fetch-Site 非 same-origin → 403，且不触达上游", async () => {
    expect((await call(post(validBody(), { origin: "https://evil.example" }))).status).toBe(403);
    const bare = new Request(`${ORIGIN}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    expect((await call(bare)).status).toBe(403);
    expect((await call(post(validBody(), { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await call(post(validBody(), { "sec-fetch-site": "same-site" }))).status).toBe(403);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("同源 Referer（无 Origin）可通过", async () => {
    const req = new Request(`${ORIGIN}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", referer: `${ORIGIN}/ask-zhuangzi/` },
      body: JSON.stringify(validBody()),
    });
    expect((await call(req)).status).toBe(200);
  });

  it("Content-Type 不是 JSON → 415", async () => {
    expect((await call(post(validBody(), { "content-type": "text/plain" }))).status).toBe(415);
  });

  it("限流：同一 IP 一个窗口内第 21 次 → 429 + Retry-After", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:10Z") });
    try {
      const headers = { "cf-connecting-ip": "203.0.113.7" };
      for (let i = 0; i < 20; i++) expect((await call(post(validBody(), headers))).status).toBe(200);
      const blocked = await call(post(validBody(), headers));
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toBe("60");
      // 其他 IP 不受影响
      expect((await call(post(validBody(), { "cf-connecting-ip": "203.0.113.8" }))).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("/api/chat 输入校验", () => {
  it("请求体上限按**字节**计：5 万个汉字（150KB）超过 128KB → 413", async () => {
    const big = validBody({ pad: "道".repeat(50_000) });
    expect(JSON.stringify(big).length).toBeLessThan(128 * 1024); // 字符数没超
    const res = await call(post(big));
    expect(res.status).toBe(413);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("Content-Length 声明超限 → 413", async () => {
    expect((await call(post(validBody(), { "content-length": String(200 * 1024) }))).status).toBe(413);
  });

  it("非法 JSON / 非对象 JSON → 400", async () => {
    expect((await call(post(null, {}, "{oops"))).status).toBe(400);
    expect((await call(post(null, {}, "null"))).status).toBe(400);
    expect((await call(post(null, {}, "[1,2]"))).status).toBe(400);
    expect((await call(post(null, {}, '"str"'))).status).toBe(400);
  });

  it("缺 key / key 含换行或非 ASCII → 401，且不触达上游", async () => {
    expect((await call(post(validBody({ key: "" })))).status).toBe(401);
    expect((await call(post(validBody({ key: 123 })))).status).toBe(401);
    const injected = await call(post(validBody({ key: "sk-abc\r\nX-Evil: 1" })));
    expect(injected.status).toBe(401);
    expect(await errorOf(injected)).toBe("API Key 格式不正确");
    expect((await call(post(validBody({ key: "密钥密钥密钥密钥密钥" })))).status).toBe(401);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("key 首尾空白被修剪后转发", async () => {
    await call(post(validBody({ key: `  ${KEY}\n` })));
    expect(upstreamCalls[0]?.headers.get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("messages 结构 / 角色 / 长度校验", async () => {
    const bad = [
      undefined,
      [],
      [{ role: "tool", content: "x" }],
      [{ role: "user", content: "" }],
      [{ role: "user", content: 1 }],
      ["str"],
      [{ role: "user", content: "x".repeat(8_001) }],
      Array.from({ length: 41 }, () => ({ role: "user", content: "x" })),
      Array.from({ length: 6 }, () => ({ role: "user", content: "x".repeat(7_000) })),
    ];
    for (const messages of bad) {
      expect((await call(post(validBody({ messages })))).status, JSON.stringify(messages)?.slice(0, 60)).toBe(400);
    }
    expect(upstreamCalls).toHaveLength(0);
  });

  it("模型白名单：未知模型 → 400", async () => {
    expect((await call(post(validBody({ model: "deepseek-reasoner-max" })))).status).toBe(400);
  });
});

describe("/api/chat 转发", () => {
  it("缺省采样参数用默认值（曾因 Number(undefined) ?? 0.7 发出 temperature: null）", async () => {
    await call(post(validBody()));
    expect(upstreamCalls[0]?.body).toMatchObject({
      model: "deepseek-v4-flash",
      temperature: 0.7,
      max_tokens: 512,
      stream: false,
    });
  });

  it("采样参数被夹紧到安全区间，垃圾值回退默认", async () => {
    await call(post(validBody({ temperature: 9, maxTokens: 999_999 })));
    expect(upstreamCalls[0]?.body).toMatchObject({ temperature: 2, max_tokens: 2048 });
    await call(post(validBody({ temperature: -1, maxTokens: -5 })));
    expect(upstreamCalls[1]?.body).toMatchObject({ temperature: 0, max_tokens: 1 });
    await call(post(validBody({ temperature: "hot", maxTokens: null })));
    expect(upstreamCalls[2]?.body).toMatchObject({ temperature: 0.7, max_tokens: 512 });
  });

  it("只转发 role / content，丢弃夹带字段；key 不出现在上游请求体里", async () => {
    await call(
      post(validBody({ messages: [{ role: "user", content: "问", name: "x", tool_calls: [{}] }], tools: [{}] }))
    );
    const sent = upstreamCalls[0]?.body ?? {};
    expect(sent.messages).toEqual([{ role: "user", content: "问" }]);
    expect(Object.keys(sent).sort()).toEqual(["max_tokens", "messages", "model", "stream", "temperature"]);
  });

  it("成功响应带 no-store / nosniff / noindex", async () => {
    const res = await call(post(validBody()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ content: "逍遥者，无待也。" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("流式：原样转发 SSE，带 no-store", async () => {
    upstream = () => new Response("data: {\"x\":1}\n\ndata: [DONE]\n\n", { status: 200 });
    const res = await call(post(validBody({ stream: true })));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("[DONE]");
    expect(upstreamCalls[0]?.body.stream).toBe(true);
  });

  it("上游错误不回传原文，按状态码映射；5xx 统一为 502", async () => {
    const secret = "account acct_123 quota exceeded internal-trace";
    const cases: [number, number, string][] = [
      [401, 401, "API Key 无效或无权限"],
      [402, 402, "DeepSeek 账户余额不足"],
      [429, 429, "上游限流，请稍后再试"],
      [503, 502, "上游服务暂时不可用"],
      [522, 502, "上游服务暂时不可用"],
      [422, 422, "请求被上游拒绝"],
    ];
    for (const [upstreamStatus, status, message] of cases) {
      upstream = () => new Response(secret, { status: upstreamStatus });
      const res = await call(post(validBody(), { "cf-connecting-ip": `198.51.100.${upstreamStatus % 250}` }));
      expect(res.status).toBe(status);
      const text = await res.text();
      expect(text).toContain(message);
      expect(text).not.toContain("acct_123");
    }
  });

  it("网络异常 / 非 JSON → 502（超时的 504 见下方「中止、超时与背压」）", async () => {
    upstream = () => {
      throw new TypeError("network");
    };
    expect((await call(post(validBody()))).status).toBe(502);
    upstream = () => new Response("<html>", { status: 200 });
    expect((await call(post(validBody()))).status).toBe(502);
  });

  it("上游返回空内容时给兜底回答", async () => {
    upstream = () => Response.json({ choices: [] });
    expect(await (await call(post(validBody()))).json()).toEqual({ content: "吾默然。" });
  });
});

describe("/api/chat 中止、超时与背压", () => {
  /** 一个受测试控制的上游 SSE 流：记录被 pull 的次数与是否被取消 */
  function controllableUpstream() {
    const state: { pulls: number; cancelled: boolean; push: (chunk: string) => void; end: () => void } = {
      pulls: 0,
      cancelled: false,
      push: () => {},
      end: () => {},
    };
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>(
      {
        start(c) {
          state.push = (chunk) => c.enqueue(encoder.encode(chunk));
          state.end = () => c.close();
        },
        pull() {
          state.pulls++;
        },
        cancel() {
          state.cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    return { state, response: new Response(body, { status: 200 }) };
  }
  /** 永不返回、但会响应 abort 的上游 */
  const hangingUpstream = (signal: AbortSignal) =>
    new Promise<Response>((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });

  afterEach(() => vi.useRealTimers());

  it("请求到达时客户端已断开 → 不调用上游", async () => {
    const res = await call(post(validBody(), {}, undefined, AbortSignal.abort()));
    expect(res.status).toBe(499);
    expect(upstreamCalls).toHaveLength(0);
  });

  it("等待上游期间客户端断开 → 中止上游请求", async () => {
    const client = new AbortController();
    upstream = hangingUpstream;
    const pending = call(post(validBody(), {}, undefined, client.signal));
    await vi.waitFor(() => expect(upstreamCalls).toHaveLength(1));
    expect(upstreamCalls[0]?.signal.aborted).toBe(false);
    client.abort();
    const res = await pending;
    expect(upstreamCalls[0]?.signal.aborted).toBe(true);
    expect(res.status).toBe(499);
  });

  it("上游 60 秒不给响应头 → 504，且上游被中止", async () => {
    vi.useFakeTimers();
    upstream = hangingUpstream;
    const pending = call(post(validBody()));
    await vi.advanceTimersByTimeAsync(60_000);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(await errorOf(res)).toBe("上游响应超时");
    expect(upstreamCalls[0]?.signal.aborted).toBe(true);
  });

  it("流式：下游取消读取 → 取消上游流并中止上游请求", async () => {
    const { state, response } = controllableUpstream();
    upstream = () => response;
    const res = await call(post(validBody({ stream: true })));
    const reader = res.body!.getReader();
    state.push("data: 1\n\n");
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("data: 1\n\n");
    await reader.cancel();
    expect(state.cancelled).toBe(true);
    expect(upstreamCalls[0]?.signal.aborted).toBe(true);
  });

  it("流式：流进行中客户端断开 → 中止上游请求", async () => {
    const client = new AbortController();
    const { response } = controllableUpstream();
    upstream = () => response;
    await call(post(validBody({ stream: true }), {}, undefined, client.signal));
    client.abort();
    expect(upstreamCalls[0]?.signal.aborted).toBe(true);
  });

  it("流式背压：下游不读，就不向上游多要数据", async () => {
    const { state, response } = controllableUpstream();
    upstream = () => response;
    const res = await call(post(validBody({ stream: true })));
    await new Promise((r) => setTimeout(r, 20));
    const idlePulls = state.pulls;
    expect(idlePulls).toBeLessThanOrEqual(1); // 至多预取一块
    await new Promise((r) => setTimeout(r, 20));
    expect(state.pulls).toBe(idlePulls); // 没人读，不再增长

    const reader = res.body!.getReader();
    for (const chunk of ["a", "b", "c"]) {
      state.push(chunk);
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(chunk);
    }
    state.end();
    expect((await reader.read()).done).toBe(true);
    expect(upstreamCalls[0]?.signal.aborted).toBe(false); // 正常结束不触发中止
  });

  it("流式：相邻两块静默超过 30 秒 → 中止上游并终止流；每块重置计时", async () => {
    vi.useFakeTimers();
    const { state, response } = controllableUpstream();
    upstream = (signal) => {
      // 真实 fetch 在 abort 时会让 body 读取失败，这里手动模拟
      signal.addEventListener("abort", () => void response.body!.cancel().catch(() => undefined));
      return response;
    };
    const res = await call(post(validBody({ stream: true })));
    const reader = res.body!.getReader();

    state.push("x");
    await reader.read();
    await vi.advanceTimersByTimeAsync(29_000);
    state.push("y"); // 29 秒后来了一块：计时重置
    await reader.read();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(upstreamCalls[0]?.signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(upstreamCalls[0]?.signal.aborted).toBe(true);
  });

  it("流式：总时长超过 5 分钟 → 即使一直有数据也中止", async () => {
    vi.useFakeTimers();
    const { state, response } = controllableUpstream();
    upstream = () => response;
    const res = await call(post(validBody({ stream: true })));
    const reader = res.body!.getReader();
    for (let i = 0; i < 31; i++) {
      state.push("x");
      await reader.read();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(upstreamCalls[0]?.signal.aborted).toBe(true);
  });
});

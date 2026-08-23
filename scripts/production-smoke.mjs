import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const debuggerUrl = process.argv[2] ?? "http://127.0.0.1:9223";
const targetUrl =
  process.argv[3] ?? "https://linkukai.com/games/Escape/?qa=production-smoke";
const screenshotPath = resolve(
  process.cwd(),
  process.argv[4] ?? "artifacts/screenshots/production-cdp.png",
);

const targets = await fetch(`${debuggerUrl}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page");
if (!target?.webSocketDebuggerUrl) {
  throw new Error("No debuggable Chrome page was found.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", () => rejectOpen(new Error("CDP connection failed.")), {
    once: true,
  });
});

let nextId = 1;
const pending = new Map();
const eventWaiters = new Map();
const consoleErrors = [];
const responses = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }

  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push({ text: message.params.exceptionDetails.text });
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    consoleErrors.push({
      text: message.params.entry.text,
      url: message.params.entry.url,
    });
  }
  if (message.method === "Network.responseReceived") {
    responses.push({
      status: message.params.response.status,
      url: message.params.response.url,
    });
  }

  const waiter = eventWaiters.get(message.method);
  if (waiter) {
    eventWaiters.delete(message.method);
    waiter(message.params);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveRequest, rejectRequest) => {
    pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
  });
}

function once(method, timeoutMs = 30_000) {
  return new Promise((resolveEvent, rejectEvent) => {
    const timer = setTimeout(() => {
      eventWaiters.delete(method);
      rejectEvent(new Error(`Timed out waiting for ${method}.`));
    }, timeoutMs);
    eventWaiters.set(method, (params) => {
      clearTimeout(timer);
      resolveEvent(params);
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}

await Promise.all([
  send("Page.enable"),
  send("Runtime.enable"),
  send("Log.enable"),
  send("Network.enable"),
]);
const loaded = once("Page.loadEventFired", 45_000);
await send("Page.navigate", { url: targetUrl });
await loaded;
await delay(1_500);

const startVisible = await evaluate(
  `Boolean([...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "开始人机对战"))`,
);
if (!startVisible) throw new Error("Start screen did not render.");

await evaluate(
  `[...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "开始人机对战").click()`,
);
await delay(400);
let matchText = await evaluate("document.body.innerText");
if (matchText.includes("你的回合")) {
  await evaluate(`(() => {
    const board = document.querySelector('[role="application"]');
    board.focus();
    board.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", bubbles: true
    }));
  })()`);
}

await delay(8_000);
matchText = await evaluate("document.body.innerText");
if (matchText.includes("AI 暂时无法行动")) {
  throw new Error("AI reported a runtime error.");
}
if (!/第 [2-9][0-9]* 回合/.test(matchText)) {
  throw new Error("AI did not complete a production move.");
}

const modelStatus = await evaluate(
  `fetch(new URL("ai/escape-value.json", document.baseURI), { cache: "no-store" })
    .then((response) => response.status)`,
);
if (modelStatus !== 200) {
  throw new Error("The trained AI model was not loaded with HTTP 200.");
}

await evaluate(
  `[...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "困难").click()`,
);
await delay(250);
const distanceTableCount = await evaluate(
  `document.querySelectorAll('[role="table"]').length`,
);
if (distanceTableCount !== 0) {
  throw new Error("Hard mode still exposes the distance hint table.");
}

const unexpectedConsoleErrors = consoleErrors.filter(
  (error) => !error.text.includes("static.cloudflareinsights.com/beacon.min.js"),
);
const unexpectedFailedResponses = responses.filter(
  (response) => response.status >= 400 && !response.url.endsWith("/favicon.ico"),
);
if (unexpectedConsoleErrors.length > 0 || unexpectedFailedResponses.length > 0) {
  throw new Error(
    `Browser errors: ${JSON.stringify({
      console: unexpectedConsoleErrors,
      responses: unexpectedFailedResponses,
    })}`,
  );
}

const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
});
await mkdir(dirname(screenshotPath), { recursive: true });
await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

console.log(
  JSON.stringify(
    {
      aiModelStatus: modelStatus,
      blockedCloudflareBeacons: consoleErrors.length - unexpectedConsoleErrors.length,
      consoleErrors: unexpectedConsoleErrors.length,
      hardModeDistanceTables: distanceTableCount,
      screenshotPath,
      turn: matchText.match(/第 [0-9]+ 回合/)?.[0],
      url: targetUrl,
    },
    null,
    2,
  ),
);

socket.close();

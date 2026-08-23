import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const debuggerUrl = process.argv[2] ?? "http://127.0.0.1:9223";
const targetUrl =
  process.argv[3] ?? "https://linkukai.com/games/Escape/?qa=production-smoke";
const viewportWidth = Number(process.argv[5] ?? 0);
const viewportHeight = Number(process.argv[6] ?? 0);
const screenshotPath = resolve(
  process.cwd(),
  process.argv[4] ?? "artifacts/screenshots/production-cdp.png",
);
const easyScreenshotPath = screenshotPath.replace(/\.png$/i, "-easy.png");
const startScreenshotPath = screenshotPath.replace(/\.png$/i, "-start.png");
const boundaryTutorialScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  "-tutorial-boundary.png",
);
const distanceTutorialScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  "-tutorial-distance.png",
);
const movementTutorialScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  "-tutorial-movement.png",
);
const trappedTutorialScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  "-tutorial-trapped.png",
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

async function captureScreenshot(path) {
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
}

await Promise.all([
  send("Page.enable"),
  send("Runtime.enable"),
  send("Log.enable"),
  send("Network.enable"),
]);
if (viewportWidth > 0 && viewportHeight > 0) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewportWidth,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: true,
  });
} else {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
}
const loaded = once("Page.loadEventFired", 45_000);
await send("Page.navigate", { url: targetUrl });
await loaded;
await delay(1_500);

const startVisible = await evaluate(
  `Boolean([...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "开始人机对战"))`,
);
if (!startVisible) throw new Error("Start screen did not render.");

const logoVisible = await evaluate(
  `Boolean(document.querySelector('[data-escape-logo="hero"]'))`,
);
if (!logoVisible) throw new Error("The Escape logo did not render.");
await captureScreenshot(startScreenshotPath);

await evaluate(
  `[...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "新手教程").click()`,
);
await delay(350);
for (let lesson = 0; lesson < 6; lesson += 1) {
  const stepVisible = await evaluate(
    `document.body.innerText.includes("${lesson + 1} / 6")`,
  );
  if (!stepVisible) throw new Error(`Tutorial lesson ${lesson + 1} did not render.`);

  await evaluate(`(() => {
    const board = document.querySelector('[role="application"]');
    board.focus();
    board.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", bubbles: true
    }));
  })()`);
  await delay(250);

  if (lesson === 2) {
    const changedEdges = await evaluate(
      `[...document.querySelectorAll('.edge-distance[data-changed="true"]')]
        .map((element) => element.dataset.direction)`,
    );
    const shortestEdges = await evaluate(
      `[...document.querySelectorAll('.edge-distance.is-shortest')]
        .map((element) => element.dataset.direction)`,
    );
    if (JSON.stringify(changedEdges) !== JSON.stringify(["up"])) {
      throw new Error(`Distance tutorial changed the wrong edges: ${JSON.stringify(changedEdges)}`);
    }
    if (JSON.stringify(shortestEdges) !== JSON.stringify(["up"])) {
      throw new Error(`Distance tutorial highlighted the wrong shortest edge: ${JSON.stringify(shortestEdges)}`);
    }
    await captureScreenshot(distanceTutorialScreenshotPath);
  }
  if (lesson === 3) {
    const shortestEdges = await evaluate(
      `[...document.querySelectorAll('.edge-distance.is-shortest')]
        .map((element) => element.dataset.direction)`,
    );
    if (JSON.stringify(shortestEdges) !== JSON.stringify(["right"])) {
      throw new Error(`Movement tutorial did not isolate the right edge: ${JSON.stringify(shortestEdges)}`);
    }
    await captureScreenshot(movementTutorialScreenshotPath);
  }
  if (lesson === 4) {
    const boundaryRuleVisible = await evaluate(
      `document.body.innerText.includes("左右边界属于白方")`,
    );
    if (!boundaryRuleVisible) throw new Error("Boundary victory tutorial feedback is missing.");
    await captureScreenshot(boundaryTutorialScreenshotPath);
  }
  if (lesson === 5) {
    const trappedRuleVisible = await evaluate(
      `document.body.innerText.includes("四面墙已经封闭")`,
    );
    if (!trappedRuleVisible) throw new Error("Trapped victory tutorial feedback is missing.");
    await captureScreenshot(trappedTutorialScreenshotPath);
    break;
  }

  await evaluate(
    `[...document.querySelectorAll("button")]
      .find((button) => button.textContent.trim() === "继续").click()`,
  );
  await delay(200);
}

await evaluate(
  `[...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "退出教程").click()`,
);
await delay(300);

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

const easyDistanceDirections = await evaluate(
  `[...document.querySelectorAll('.edge-distance')]
    .map((element) => element.dataset.direction)
    .sort()`,
);
if (JSON.stringify(easyDistanceDirections) !== JSON.stringify(["down", "left", "right", "up"])) {
  throw new Error(`Easy mode edge hints are incomplete: ${JSON.stringify(easyDistanceDirections)}`);
}
const edgeHintLayout = await evaluate(`(() => {
  const shell = document.querySelector('.board-shell').getBoundingClientRect();
  const boundaryInset = shell.width * 0.104;
  const boundary = {
    top: shell.top + boundaryInset,
    right: shell.right - boundaryInset,
    bottom: shell.bottom - boundaryInset,
    left: shell.left + boundaryInset,
  };
  const hints = [...document.querySelectorAll('.edge-distance')];
  const outside = hints.every((element) => {
    const rect = element.getBoundingClientRect();
    const direction = element.dataset.direction;
    if (direction === 'up') return rect.bottom < boundary.top;
    if (direction === 'right') return rect.left > boundary.right;
    if (direction === 'down') return rect.top > boundary.bottom;
    return rect.right < boundary.left;
  });
  return {
    outside,
    hasArrow: hints.some((element) => /[↑→↓←›>]/.test(element.textContent)),
  };
})()`);
if (!edgeHintLayout.outside || edgeHintLayout.hasArrow) {
  throw new Error(`Edge hint layout is invalid: ${JSON.stringify(edgeHintLayout)}`);
}
await evaluate(`(() => {
  const board = document.querySelector('[role="application"]');
  board.focus();
  board.dispatchEvent(new KeyboardEvent("keydown", {
    key: "ArrowDown", code: "ArrowDown", bubbles: true
  }));
})()`);
await delay(250);
await captureScreenshot(easyScreenshotPath);

await evaluate(
  `[...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "困难").click()`,
);
await delay(250);
const distanceHintCount = await evaluate(
  `document.querySelectorAll('.edge-distance').length`,
);
if (distanceHintCount !== 0) {
  throw new Error("Hard mode still exposes edge distance hints.");
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

await captureScreenshot(screenshotPath);

console.log(
  JSON.stringify(
    {
      aiModelStatus: modelStatus,
      blockedCloudflareBeacons: consoleErrors.length - unexpectedConsoleErrors.length,
      consoleErrors: unexpectedConsoleErrors.length,
      easyModeEdgeDirections: easyDistanceDirections,
      edgeHintsOutsideBoard: edgeHintLayout.outside,
      edgeHintsContainArrows: edgeHintLayout.hasArrow,
      hardModeDistanceHints: distanceHintCount,
      startScreenshotPath,
      distanceTutorialScreenshotPath,
      movementTutorialScreenshotPath,
      boundaryTutorialScreenshotPath,
      trappedTutorialScreenshotPath,
      easyScreenshotPath,
      screenshotPath,
      turn: matchText.match(/第 [0-9]+ 回合/)?.[0],
      viewport:
        viewportWidth > 0 && viewportHeight > 0
          ? `${viewportWidth}x${viewportHeight}`
          : "1440x900 desktop",
      url: targetUrl,
    },
    null,
    2,
  ),
);

socket.close();

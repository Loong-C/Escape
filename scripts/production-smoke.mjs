import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const debuggerUrl = process.argv[2] ?? "http://127.0.0.1:9223";
const targetUrl =
  process.argv[3] ?? "https://linkukai.com/games/Escape/?qa=production-smoke";
const viewportWidth = Number(process.argv[5] ?? 0);
const viewportHeight = Number(process.argv[6] ?? 0);
const mobileViewport = viewportWidth > 0 && viewportHeight > 0;
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
const replacementTutorialScreenshotPath = screenshotPath.replace(
  /\.png$/i,
  "-tutorial-replacement.png",
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

async function tap(x, y) {
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
  });
  await send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

await Promise.all([
  send("Page.enable"),
  send("Runtime.enable"),
  send("Log.enable"),
  send("Network.enable"),
]);
if (mobileViewport) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewportWidth,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
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
let tutorialBoardReady = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  tutorialBoardReady = await evaluate(
    `Boolean(document.querySelector('[role="application"]'))`,
  );
  if (tutorialBoardReady) break;
  await delay(250);
}
if (!tutorialBoardReady) {
  throw new Error("Tutorial board did not finish loading.");
}
const tutorialBoardSize = await evaluate(
  `Number(document.querySelector('[role="application"]').dataset.boardSize)`,
);
if (tutorialBoardSize !== 17) {
  throw new Error(`Tutorial board size is ${tutorialBoardSize}, expected 17.`);
}
for (let lesson = 0; lesson < 7; lesson += 1) {
  const stepVisible = await evaluate(
    `document.body.innerText.includes("${lesson + 1} / 7")`,
  );
  if (!stepVisible) throw new Error(`Tutorial lesson ${lesson + 1} did not render.`);

  if (lesson === 3) {
    const beforePlacement = await evaluate(`(() => {
      const neighbors = [...document.querySelectorAll('.neighbor-distance')];
      return {
        up: neighbors.find((element) => element.dataset.direction === 'up')?.textContent.trim(),
        down: neighbors.find((element) => element.dataset.direction === 'down')?.textContent.trim(),
        shortest: neighbors.filter((element) => element.classList.contains('is-shortest'))
          .map((element) => element.dataset.direction),
        struck: neighbors.some((element) => getComputedStyle(element).textDecorationLine.includes('line-through')),
      };
    })()`);
    if (
      beforePlacement.up !== "∞" ||
      beforePlacement.down !== "3" ||
      beforePlacement.shortest.length !== 0 ||
      beforePlacement.struck
    ) {
      throw new Error(`Tutorial neighbor preview is incorrect: ${JSON.stringify(beforePlacement)}`);
    }
  }
  if (lesson === 4) {
    const movementPreview = await evaluate(`(() => ({
      hasBallPreviewAttribute: document.querySelector('[role="application"]')
        .hasAttribute('data-ball-move-preview'),
      shortest: [...document.querySelectorAll('.neighbor-distance.is-shortest')]
        .map((element) => element.dataset.direction),
    }))()`);
    if (
      movementPreview.hasBallPreviewAttribute ||
      JSON.stringify(movementPreview.shortest) !== JSON.stringify(["right"])
    ) {
      throw new Error(`Movement hint preview is incorrect: ${JSON.stringify(movementPreview)}`);
    }
  }

  await evaluate(`(() => {
    const board = document.querySelector('[role="application"]');
    board.focus();
    board.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", bubbles: true
    }));
  })()`);
  await delay(250);

  if (lesson === 2) {
    const replacementRuleVisible = await evaluate(
      `document.body.innerText.includes("黑色浮桩已被白桩替换")`,
    );
    if (!replacementRuleVisible) {
      throw new Error("Floating-post replacement tutorial feedback is missing.");
    }
    await captureScreenshot(replacementTutorialScreenshotPath);
  }
  if (lesson === 3) {
    const displayedUpDistance = await evaluate(
      `[...document.querySelectorAll('.neighbor-distance')]
        .find((element) => element.dataset.direction === 'up')?.textContent.trim()`,
    );
    const shortestEdges = await evaluate(
      `[...document.querySelectorAll('.neighbor-distance.is-shortest')]
        .map((element) => element.dataset.direction)`,
    );
    if (displayedUpDistance !== "∞") {
      throw new Error(`Distance tutorial did not update on placement: ${displayedUpDistance}`);
    }
    if (shortestEdges.length !== 0) {
      throw new Error(`Distance tutorial highlighted a tied minimum: ${JSON.stringify(shortestEdges)}`);
    }
    await captureScreenshot(distanceTutorialScreenshotPath);
  }
  if (lesson === 4) {
    const shortestEdges = await evaluate(
      `[...document.querySelectorAll('.neighbor-distance.is-shortest')]
        .map((element) => element.dataset.direction)`,
    );
    if (JSON.stringify(shortestEdges) !== JSON.stringify(["right"])) {
      throw new Error(`Movement tutorial did not isolate the right edge: ${JSON.stringify(shortestEdges)}`);
    }
    await captureScreenshot(movementTutorialScreenshotPath);
  }
  if (lesson === 5) {
    const boundaryRuleVisible = await evaluate(
      `document.body.innerText.includes("左右边界属于白方")`,
    );
    if (!boundaryRuleVisible) throw new Error("Boundary victory tutorial feedback is missing.");
    await captureScreenshot(boundaryTutorialScreenshotPath);
  }
  if (lesson === 6) {
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
    .find((button) => button.textContent.trim() === "开始本地双人").click()`,
);
await delay(400);
const localInitialState = await evaluate(`(() => {
  const board = document.querySelector('[role="application"]');
  return {
    size: Number(board?.dataset.boardSize),
    goalPlayer: board?.dataset.goalPlayer,
    turn: board?.dataset.turn,
    hasPlayerOneTurn: document.body.innerText.includes("玩家 1 的回合"),
  };
})()`);
if (
  localInitialState.size !== 17 ||
  localInitialState.goalPlayer !== "white" ||
  localInitialState.turn !== "white" ||
  !localInitialState.hasPlayerOneTurn
) {
  throw new Error(`Local match did not start with white: ${JSON.stringify(localInitialState)}`);
}
let touchSelection = null;
if (mobileViewport) {
  const touchPoint = await evaluate(`(() => {
    const rect = document.querySelector('[role="application"]').getBoundingClientRect();
    return {
      x: rect.left + rect.width * 0.104,
      y: rect.top + rect.height * 0.104,
    };
  })()`);
  await tap(touchPoint.x, touchPoint.y);
  await delay(250);
  touchSelection = await evaluate(`(() => {
    const confirm = document.querySelector('.mobile-confirm');
    return {
      turn: document.querySelector('[role="application"]')?.dataset.turn,
      confirmVisible: Boolean(confirm && confirm.getBoundingClientRect().height > 0),
    };
  })()`);
  if (touchSelection.turn !== "white" || !touchSelection.confirmVisible) {
    throw new Error(`Touch selection did not remain available: ${JSON.stringify(touchSelection)}`);
  }
  await evaluate(`document.querySelector('.mobile-confirm').click()`);
} else {
  await evaluate(`(() => {
    const board = document.querySelector('[role="application"]');
    board.focus();
    board.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", bubbles: true
    }));
  })()`);
}
await delay(300);
const localNextState = await evaluate(`(() => {
  const board = document.querySelector('[role="application"]');
  return {
    goalPlayer: board?.dataset.goalPlayer,
    turn: board?.dataset.turn,
    hasPlayerTwoTurn: document.body.innerText.includes("玩家 2 的回合"),
  };
})()`);
if (
  localNextState.goalPlayer !== "black" ||
  localNextState.turn !== "black" ||
  !localNextState.hasPlayerTwoTurn
) {
  throw new Error(`Local match did not switch players and goal edges: ${JSON.stringify(localNextState)}`);
}
await evaluate(
  `[...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "退出对局").click()`,
);
await delay(300);

await evaluate(
  `[...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "开始人机对战").click()`,
);
await delay(400);
let matchText = await evaluate("document.body.innerText");
const currentTurn = await evaluate(
  `document.querySelector('[role="application"]').dataset.turn`,
);
const renderedGoalPlayer = await evaluate(
  `document.querySelector('[role="application"]').dataset.goalPlayer`,
);
if (renderedGoalPlayer !== currentTurn) {
  throw new Error(
    `Goal edges do not belong to the current player: ${renderedGoalPlayer}/${currentTurn}`,
  );
}
if (matchText.includes("你的回合")) {
  await evaluate(`(() => {
    const board = document.querySelector('[role="application"]');
    board.focus();
    board.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", code: "Enter", bubbles: true
    }));
  })()`);
}

await delay(15_000);
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
  `[...document.querySelectorAll('.neighbor-distance')]
    .map((element) => element.dataset.direction)
    .sort()`,
);
if (JSON.stringify(easyDistanceDirections) !== JSON.stringify(["down", "left", "right", "up"])) {
  throw new Error(`Easy mode neighbor hints are incomplete: ${JSON.stringify(easyDistanceDirections)}`);
}
const neighborHintLayout = await evaluate(`(() => {
  const shell = document.querySelector('.board-shell').getBoundingClientRect();
  const board = document.querySelector('[role="application"]');
  const size = Number(board.dataset.boardSize);
  const ball = {
    row: Number(board.dataset.ballRow),
    col: Number(board.dataset.ballCol),
  };
  const step = shell.width * 0.792 / size;
  const center = {
    x: shell.left + shell.width * 0.104 + (ball.col + 0.5) * step,
    y: shell.top + shell.width * 0.104 + (ball.row + 0.5) * step,
  };
  const deltas = {
    up: { x: 0, y: -step },
    right: { x: step, y: 0 },
    down: { x: 0, y: step },
    left: { x: -step, y: 0 },
  };
  const hints = [...document.querySelectorAll('.neighbor-distance')];
  const aligned = hints.every((element) => {
    const rect = element.getBoundingClientRect();
    const delta = deltas[element.dataset.direction];
    return Math.abs(rect.left + rect.width / 2 - (center.x + delta.x)) < 2
      && Math.abs(rect.top + rect.height / 2 - (center.y + delta.y)) < 2;
  });
  return {
    aligned,
    unframed: hints.every((element) => {
      const style = getComputedStyle(element);
      return style.borderTopWidth === '0px'
        && style.backgroundColor === 'rgba(0, 0, 0, 0)'
        && style.boxShadow === 'none';
    }),
    valuesAreDirect: hints.every((element) => element.children.length === 0),
  };
})()`);
if (
  !neighborHintLayout.aligned ||
  !neighborHintLayout.unframed ||
  !neighborHintLayout.valuesAreDirect
) {
  throw new Error(`Neighbor hint layout is invalid: ${JSON.stringify(neighborHintLayout)}`);
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
  `document.querySelectorAll('.neighbor-distance').length`,
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
      easyModeNeighborDirections: easyDistanceDirections,
      neighborHintsAligned: neighborHintLayout.aligned,
      neighborHintsUnframed: neighborHintLayout.unframed,
      neighborValuesAreDirect: neighborHintLayout.valuesAreDirect,
      hardModeDistanceHints: distanceHintCount,
      startScreenshotPath,
      distanceTutorialScreenshotPath,
      movementTutorialScreenshotPath,
      replacementTutorialScreenshotPath,
      boundaryTutorialScreenshotPath,
      trappedTutorialScreenshotPath,
      easyScreenshotPath,
      screenshotPath,
      turn: matchText.match(/第 [0-9]+ 回合/)?.[0],
      currentTurn,
      localInitialState,
      localNextState,
      touchSelection,
      viewport:
        mobileViewport
          ? `${viewportWidth}x${viewportHeight}`
          : "1440x900 desktop",
      url: targetUrl,
    },
    null,
    2,
  ),
);

socket.close();

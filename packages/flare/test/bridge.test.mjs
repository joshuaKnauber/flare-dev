import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRepoInboxPath } from "../dist/inbox-path.js";

const TEST_PROJECT_ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for bridge.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/Flare bridge listening on http:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(Number.parseInt(match[1], 10));
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Bridge exited early with code ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

function waitForJsonEvent(stream, predicate) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for JSON event.\nOutput:\n${buffer}`));
    }, 10000);

    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (!predicate(event)) continue;
          clearTimeout(timeout);
          stream.off("data", onData);
          resolve(event);
          return;
        } catch {}
      }
    };

    stream.on("data", onData);
  });
}

test("flare bridge serves health while running", async () => {
  const child = spawn(process.execPath, ["dist/cli.js", "bridge", "--port", "0"], {
    cwd: new URL("../", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = await waitForReady(child);
  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true });

  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
});

test("flare bridge writes pushed snapshots to the repo inbox folder", async () => {
  const child = spawn(process.execPath, ["dist/cli.js", "bridge", "--port", "0"], {
    cwd: new URL("../", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = await waitForReady(child);

  const payload = {
    projectRoot: TEST_PROJECT_ROOT,
    snapshot: {
      updatedAt: "2026-03-27T10:00:00.000Z",
      changes: [
        {
          selector: ".hero",
          path: "body > main.hero > h1",
          source: `${TEST_PROJECT_ROOT}/src/App.tsx:12:4`,
          changes: [
            {
              property: "font-size",
              before: "32px",
              after: "40px",
            },
          ],
        },
      ],
    },
  };

  const pushResponse = await fetch(`http://127.0.0.1:${port}/api/agent/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(pushResponse.status, 202);
  const pushBody = await pushResponse.json();
  assert.equal(typeof pushBody.inboxPath, "string");
  assert.equal(typeof pushBody.filePath, "string");
  assert.ok(existsSync(pushBody.filePath));
  assert.ok(pushBody.filePath.startsWith(pushBody.inboxPath));

  const written = JSON.parse(readFileSync(pushBody.filePath, "utf8"));
  assert.equal(written.projectRoot, TEST_PROJECT_ROOT);
  assert.equal(written.snapshot.updatedAt, payload.snapshot.updatedAt);
  assert.equal(written.snapshot.changes[0].source, payload.snapshot.changes[0].source);
  assert.equal("prompt" in written.snapshot, false);
  assert.equal("changeCount" in written.snapshot, false);
  assert.equal("pageUrl" in written.snapshot, false);

  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
});

test("flare watch returns one batch of pending inbox files and exits", async () => {
  const bridge = spawn(process.execPath, ["dist/cli.js", "bridge", "--port", "0"], {
    cwd: new URL("../", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForReady(bridge);
  const inboxPath = getRepoInboxPath(TEST_PROJECT_ROOT);
  rmSync(inboxPath, { recursive: true, force: true });
  mkdirSync(inboxPath, { recursive: true });

  const watch = spawn(
    process.execPath,
    ["dist/cli.js", "watch", "--project-root", TEST_PROJECT_ROOT],
    {
      cwd: new URL("../", import.meta.url),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  writeFileSync(
    join(inboxPath, "2026-03-27T10-00-00-000Z.json"),
    JSON.stringify({
      projectRoot: TEST_PROJECT_ROOT,
      snapshot: {
        updatedAt: "2026-03-27T10:00:00.000Z",
        changes: [
          {
            selector: ".hero",
            path: "body > main.hero > h1",
            changes: [
              {
                property: "font-size",
                before: "32px",
                after: "40px",
              },
            ],
          },
        ],
      },
    }),
  );

  const batchEvent = await waitForJsonEvent(
    watch.stdout,
    (event) => event?.type === "watch.batch",
  );
  assert.equal(batchEvent.type, "watch.batch");
  assert.equal(batchEvent.inboxPath, inboxPath);
  assert.equal(batchEvent.files.length, 1);
  assert.equal(batchEvent.files[0].payload.projectRoot, TEST_PROJECT_ROOT);
  assert.equal(batchEvent.files[0].payload.snapshot.updatedAt, "2026-03-27T10:00:00.000Z");
  await new Promise((resolve) => watch.once("exit", resolve));

  bridge.kill("SIGTERM");
  await new Promise((resolve) => bridge.once("exit", resolve));
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const workerPath = path.resolve(__dirname, "../app/workers/diskWriterWorker.js");

function startWorker(t) {
  const worker = new Worker(workerPath);
  const messages = [];
  const waiters = [];
  worker.on("message", (message) => {
    const index = waiters.findIndex((waiter) => waiter.predicate(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      messages.push(message);
    }
  });
  worker.on("error", (error) => {
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  });

  function nextMessage(predicate, timeoutMs = 3000) {
    const existingIndex = messages.findIndex(predicate);
    if (existingIndex >= 0) return Promise.resolve(messages.splice(existingIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("Timed out waiting for disk writer worker response"));
        }, timeoutMs),
      };
      waiters.push(waiter);
    });
  }

  t.after(async () => {
    await worker.terminate();
  });

  return { worker, nextMessage };
}

test("allocation prepares the expected file size without claiming verification", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "era-disk-writer-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "content.bin");
  const { worker, nextMessage } = startWorker(t);

  await nextMessage((message) => message.type === "ready");
  worker.postMessage({ type: "allocate", filePath, fileSize: 4 });
  const response = await nextMessage((message) => message.type === "completed" && message.operation === "allocate");

  assert.equal(response.allocated, true);
  assert.equal(response.verified, false);
  assert.equal(fs.statSync(filePath).size, 4);
});

test("invalid allocation size returns an explicit error instead of hanging", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "era-disk-writer-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { worker, nextMessage } = startWorker(t);

  await nextMessage((message) => message.type === "ready");
  worker.postMessage({ type: "allocate", filePath: path.join(dir, "invalid.bin"), fileSize: -1 });
  const response = await nextMessage((message) => message.type === "error" && message.operation === "allocate");

  assert.equal(response.fileIndex, -1);
  assert.match(response.error, /Invalid fileSize/);
});

test("write and verify messages report separate outcomes", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "era-disk-writer-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "chunk.bin");
  const payload = Buffer.from("test");
  const expectedHash = crypto.createHash("md5").update(payload).digest("hex").toUpperCase();
  const { worker, nextMessage } = startWorker(t);

  await nextMessage((message) => message.type === "ready");
  worker.postMessage({ type: "allocate", filePath, fileSize: payload.length });
  await nextMessage((message) => message.type === "completed" && message.operation === "allocate");

  worker.postMessage({
    type: "write",
    task: { filePath, buffer: payload, offset: 0, expectedSize: payload.length, fileIndex: 0, chunkIndex: 0 },
  });
  const writeResult = await nextMessage((message) => message.type === "completed" && message.fileIndex === 0 && message.chunkIndex === 0);
  assert.equal(writeResult.verified, true, "write acknowledgement reflects current protocol; verify is checked separately");

  worker.postMessage({
    type: "verify",
    task: { filePath, offset: 0, expectedSize: payload.length, expectedHash, fileIndex: 0, chunkIndex: 0 },
  });
  const verifyResult = await nextMessage((message) => message.type === "completed" && message.fileIndex === 0 && message.chunkIndex === 0);
  assert.equal(verifyResult.verified, true);
});

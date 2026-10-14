"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// main/workers/diskWriterWorker.ts
var import_worker_threads = require("worker_threads");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_crypto = __toESM(require("crypto"));
var openFiles = /* @__PURE__ */ new Map();
var pendingFsyncs = 0;
var FSYNC_BATCH_SIZE = 50;
var FSYNC_INTERVAL_MS = 2e3;
function getFileDescriptor(filePath) {
  let handle = openFiles.get(filePath);
  if (!handle) {
    try {
      let fd;
      if (import_fs.default.existsSync(filePath)) {
        fd = import_fs.default.openSync(filePath, "r+");
      } else {
        const dir = import_path.default.dirname(filePath);
        if (!import_fs.default.existsSync(dir)) {
          import_fs.default.mkdirSync(dir, { recursive: true });
        }
        fd = import_fs.default.openSync(filePath, "w+");
        console.log("[DiskWriter] Created new file:", filePath);
      }
      handle = {
        path: filePath,
        fd,
        lastSync: Date.now(),
        pendingWrites: 0
      };
      openFiles.set(filePath, handle);
      console.log("[DiskWriter] Opened file:", filePath);
    } catch (error) {
      throw new Error(`Failed to open file ${filePath}: ${error.message}`);
    }
  }
  return handle.fd;
}
function closeFileDescriptor(filePath) {
  const handle = openFiles.get(filePath);
  if (handle) {
    try {
      import_fs.default.fsyncSync(handle.fd);
      import_fs.default.closeSync(handle.fd);
      openFiles.delete(filePath);
      console.log("[DiskWriter] Closed file:", filePath);
    } catch (error) {
      console.error("[DiskWriter] Error closing file:", error);
    }
  }
}
function syncFile(filePath, force = false) {
  const handle = openFiles.get(filePath);
  if (!handle) return;
  const now = Date.now();
  const timeSinceLastSync = now - handle.lastSync;
  if (force || handle.pendingWrites >= FSYNC_BATCH_SIZE || timeSinceLastSync >= FSYNC_INTERVAL_MS) {
    try {
      import_fs.default.fsyncSync(handle.fd);
      handle.lastSync = now;
      handle.pendingWrites = 0;
      pendingFsyncs = 0;
    } catch (error) {
      console.error("[DiskWriter] fsync error:", error);
    }
  }
}
function allocateFile(filePath, fileSize) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("Invalid filePath for allocation");
  }
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw new Error("Invalid fileSize for allocation");
  }
  const dir = import_path.default.dirname(filePath);
  import_fs.default.mkdirSync(dir, { recursive: true });
  let fd;
  try {
    if (import_fs.default.existsSync(filePath)) {
      const stats = import_fs.default.statSync(filePath);
      if (!stats.isFile()) {
        throw new Error("Allocation target is not a regular file");
      }
      fd = import_fs.default.openSync(filePath, "r+");
    } else {
      fd = import_fs.default.openSync(filePath, "w+");
    }
    // Preserve any existing partial-download bytes while ensuring the target
    // has the expected final size. Let allocation failures reach the message
    // handler instead of swallowing them and reporting a false completion.
    import_fs.default.ftruncateSync(fd, fileSize);
  } finally {
    if (fd !== void 0) {
      import_fs.default.closeSync(fd);
    }
  }
  console.log(`[DiskWriter] Prepared file: ${filePath} (${(fileSize / 1048576).toFixed(2)} MB)`);
}
function writeChunk(filePath, buffer, offset, expectedSize) {
  try {
    const fd = getFileDescriptor(filePath);
    const written = import_fs.default.writeSync(fd, buffer, 0, buffer.length, offset);
    if (written !== buffer.length) {
      throw new Error(`Incomplete write: ${written}/${buffer.length} bytes`);
    }
    const handle = openFiles.get(filePath);
    if (handle) {
      handle.pendingWrites++;
      pendingFsyncs++;
    }
    syncFile(filePath, false);
  } catch (error) {
    throw new Error(`Failed to write chunk: ${error.message}`);
  }
}
function verifyChunk(filePath, offset, size, expectedHash) {
  try {
    const fd = getFileDescriptor(filePath);
    const buffer = Buffer.alloc(size);
    const bytesRead = import_fs.default.readSync(fd, buffer, 0, size, offset);
    if (bytesRead !== size) {
      console.error(`[DiskWriter] Read ${bytesRead}/${size} bytes`);
      return false;
    }
    const hash = import_crypto.default.createHash("md5").update(buffer).digest("hex").toUpperCase();
    const matches = hash === expectedHash.toUpperCase();
    if (!matches) {
      console.error(`[DiskWriter] Hash mismatch: expected ${expectedHash}, got ${hash}`);
    }
    return matches;
  } catch (error) {
    console.error("[DiskWriter] Verification error:", error);
    return false;
  }
}
if (import_worker_threads.parentPort) {
  import_worker_threads.parentPort.on("message", (message) => {
    try {
      if (message.type === "allocate") {
        if (!message.filePath || message.fileSize === void 0) {
          console.error("[DiskWriter] Allocation request:", message);
          throw new Error("Missing filePath or fileSize for allocation");
        }
        allocateFile(message.filePath, message.fileSize);
        if (import_worker_threads.parentPort) {
          import_worker_threads.parentPort.postMessage({
            type: "completed",
            operation: "allocate",
            fileIndex: -1,
            chunkIndex: -1,
            allocated: true,
            verified: false
          });
        }
      } else if (message.type === "write") {
        if (!message.task) {
          throw new Error("Missing task for write operation");
        }
        const task = message.task;
        writeChunk(
          task.filePath,
          task.buffer,
          task.offset,
          task.expectedSize
        );
        if (import_worker_threads.parentPort) {
          import_worker_threads.parentPort.postMessage({
            type: "completed",
            operation: "write",
            fileIndex: task.fileIndex,
            chunkIndex: task.chunkIndex,
            written: true,
            verified: false
          });
        }
      } else if (message.type === "verify") {
        if (!message.task) {
          throw new Error("Missing task for verify operation");
        }
        const task = message.task;
        const verified = verifyChunk(
          task.filePath,
          task.offset,
          task.expectedSize,
          task.expectedHash
        );
        if (import_worker_threads.parentPort) {
          import_worker_threads.parentPort.postMessage({
            type: "completed",
            fileIndex: task.fileIndex,
            chunkIndex: task.chunkIndex,
            verified
          });
        }
      } else if (message.type === "shutdown") {
        console.log("[DiskWriter] Shutting down...");
        for (const [filePath, handle] of openFiles.entries()) {
          syncFile(filePath, true);
          closeFileDescriptor(filePath);
        }
        console.log("[DiskWriter] Shutdown complete");
      }
    } catch (error) {
      console.error("[DiskWriter] Error:", error);
      if (import_worker_threads.parentPort) {
        import_worker_threads.parentPort.postMessage({
          type: "error",
          operation: message.type || "unknown",
          fileIndex: message.task?.fileIndex ?? -1,
          chunkIndex: message.task?.chunkIndex ?? -1,
          error: error.message || "Unknown error"
        });
      }
    }
  });
  import_worker_threads.parentPort.postMessage({ type: "ready" });
  setInterval(() => {
    for (const filePath of openFiles.keys()) {
      syncFile(filePath, false);
    }
  }, FSYNC_INTERVAL_MS);
}

# Era Launcher

> **A detailed guide to the Era desktop application, its launcher architecture, download pipeline, local build tools, integrations, development setup, and implementation status.**

Era is a desktop application built with **Electron** and a React-based renderer. The repository contains a bundled application entry point, renderer assets, native Node.js components, download workers, and the supporting files used by the Era launcher.

The application metadata in the checked-in `package.json` identifies the package as `era`, version `3.0.9`, with `app/index.js` as its main entry point. The visible application is designed around Era services and local Fortnite build management. Its actual behavior depends on the bundled code, the installed native components, the local Windows/game environment, and external services or manifests provided while it is running.

This document is intentionally detailed. It explains the purpose of each major subsystem, how the pieces communicate, how to approach common errors, and which advertised operations are still incomplete in the checked-in revision. **It does not claim that every feature has been tested or that every workflow works on every machine.**

---

## Contents

- [Project at a glance](#project-at-a-glance)
- [Quick start: using this repository snapshot](#quick-start-using-this-repository-snapshot)
- [Project goals and scope](#project-goals-and-scope)
- [Feature summary](#feature-summary)
- [Launcher architecture](#launcher-architecture)
- [Game launch lifecycle](#game-launch-lifecycle)
- [Build downloads](#build-downloads)
- [Content update system](#content-update-system)
- [Build profiler and file fingerprints](#build-profiler-and-file-fingerprints)
- [Client DLL download and fingerprinting](#client-dll-download-and-fingerprinting)
- [Authentication and deep links](#authentication-and-deep-links)
- [Discord Rich Presence](#discord-rich-presence)
- [Diagnostics, logs, and Sentry](#diagnostics-logs-and-sentry)
- [Local Wrapped cache](#local-wrapped-cache)
- [Repository structure](#repository-structure)
- [Technology stack](#technology-stack)
- [Requirements and platform compatibility](#requirements-and-platform-compatibility)
- [Getting the repository](#getting-the-repository)
- [Installing dependencies](#installing-dependencies)
- [Running and inspecting the application](#running-and-inspecting-the-application)
- [Build and packaging notes](#build-and-packaging-notes)
- [Understanding configuration and runtime paths](#understanding-configuration-and-runtime-paths)
- [Troubleshooting](#troubleshooting)
- [Security, privacy, and safe testing](#security-privacy-and-safe-testing)
- [Security audit summary (static review)](#security-audit-summary-static-review)
- [Deep-dive security review: evidence, impact, and remediation](#deep-dive-security-review-evidence-impact-and-remediation)
- [Known limitations and implementation status](#known-limitations-and-implementation-status)
- [Recommended development roadmap](#recommended-development-roadmap)
- [Contributing](#contributing)
- [Reporting a bug](#reporting-a-bug)
- [Frequently asked questions](#frequently-asked-questions)
- [Code-level audit: additional findings from the checked-in implementation](#code-level-audit-additional-findings-from-the-checked-in-implementation)
- [Disk writer worker: detailed behavior](#disk-writer-worker-detailed-behavior)
- [User-data, cache, and file ownership](#user-data-cache-and-file-ownership)
- [IPC/API catalogue for maintainers](#ipcapi-catalogue-for-maintainers)
- [Static audit methodology and limits](#static-audit-methodology-and-limits)
- [Extended module-by-module reference](#extended-module-by-module-reference)
- [Application startup sequence and lifecycle details](#application-startup-sequence-and-lifecycle-details)
- [Detailed profiler behavior and interpretation](#detailed-profiler-behavior-and-interpretation)
- [Content update operation: detailed walkthrough](#content-update-operation-detailed-walkthrough)
- [Download worker and disk-writer coordination](#download-worker-and-disk-writer-coordination)
- [External URL handling and service boundaries](#external-url-handling-and-service-boundaries)
- [Authentication callback and sensitive-data handling](#authentication-callback-and-sensitive-data-handling)
- [Application updater and release integrity](#application-updater-and-release-integrity)
- [UI state and renderer integration](#ui-state-and-renderer-integration)
- [Renderer interface: design, components, and interaction flow](#renderer-interface-design-components-and-interaction-flow)
- [Renderer JavaScript bundle deep dive](#renderer-javascript-bundle-deep-dive)
- [Privacy, telemetry, and support workflow](#privacy-telemetry-and-support-workflow)
- [Suggested issue labels and triage categories](#suggested-issue-labels-and-triage-categories)
- [Additional audit acceptance criteria](#additional-audit-acceptance-criteria)
- [File-by-file implementation reference](#file-by-file-implementation-reference)
- [Source-to-feature tracing guide](#source-to-feature-tracing-guide)
- [Implementation status by confidence level](#implementation-status-by-confidence-level)
- [Recommended remediation plan, ordered by risk](#recommended-remediation-plan-ordered-by-risk)
- [Maintainer checklist for the next release](#maintainer-checklist-for-the-next-release)
- [What static documentation can and cannot prove](#what-static-documentation-can-and-cannot-prove)
- [Final notes](#final-notes)

---

## Project at a glance

| Property | Details |
| --- | --- |
| Application name in package metadata | Era |
| Package version in this snapshot | 3.0.9 |
| Application entry point | `app/index.js` |
| Desktop framework | Electron |
| Renderer | React and compiled front-end assets |
| UI-related libraries | React Router, React Query, Radix UI, Motion, React Three Fiber |
| Download/network support | HTTP client dependencies and dedicated worker files |
| Game/build context | Windows Fortnite build paths and a native launcher component |
| Native module checked into the repository | `app/build/Release/dll_injector.node` |
| Windows helper executable | `app/binaries/FortniteLauncher.exe` |
| Primary limitation | The repository mostly contains bundled output rather than the original source tree |

The name of the repository is not, by itself, a reliable description of every component. This README describes the application based on the files and implementation that are checked in. It does not certify that the app or any included binary is safe, official, or compatible with a particular service.

## Quick start: using this repository snapshot

This repository is useful for inspecting the launcher's checked-in implementation, renderer, worker files, and package metadata. It is not currently a turnkey installer or a reproducible development project: the package has no `scripts` section, no lockfile, and no declared Electron dependency, while the renderer and main process are checked-in build output.

| If your goal is to... | Start here | What this checkout does not provide |
| --- | --- | --- |
| Read or inspect the project | Clone the repository and review `README.md`, `package.json`, `app/index.js`, `app/preload.js`, and `app/renderer/`. | A complete original TypeScript/React source tree or build configuration. |
| Install JavaScript packages | Run `npm install` from the repository root. | An installed desktop launcher. This command only installs package dependencies. |
| Open the desktop UI | Use the Electron version and renderer development server intended for this exact build. The main process selects `http://localhost:5173` in development mode. | A pinned Electron version, a `dev` script, or the Vite/server configuration needed to start that URL. |
| Install the launcher for normal use | Use a release installer provided by the project maintainers, if available. | A checked-in installer or a documented packaging command in this snapshot. `FortniteLauncher.exe` is a helper binary, not an Era installer. |
| Launch a local Fortnite build | Use a compatible Windows environment, the expected game executable under the selected build directory, valid runtime credentials, and the required client/native components. | A guarantee that game launching, DLL injection, remote verification, or any particular build works on this machine. |

For a source checkout, the safe first checks are:

```bash
git status
node --version
npm --version
npm run
```

`npm run` lists scripts and will report that none are configured in the current manifest. For a repository clone, use the command under [Getting the repository](#getting-the-repository). For more detail on dependencies, the development launch example, and platform assumptions, see [Installing dependencies](#installing-dependencies), [Running and inspecting the application](#running-and-inspecting-the-application), and [Requirements and platform compatibility](#requirements-and-platform-compatibility).

## Security audit summary (static review)

**Review date:** 2026-10-30  
**Scope:** Static inspection of the checked-in README, `app/preload.js`, `app/workers/diskWriterWorker.js`, package metadata, and documented findings for the bundled main process. This is not a runtime penetration test, dependency-vulnerability scan, or full native-binary analysis.

The following findings are prioritized by practical risk. Severity labels are qualitative and are not CVSS scores.

| Priority | Finding | Evidence and impact | Recommended remediation |
| --- | --- | --- | --- |
| **High** | HTTPS certificate verification is disabled in the client DLL download path | The current implementation is documented as disabling TLS certificate validation. A network attacker or intercepted connection could potentially substitute downloaded content. | Restore normal TLS certificate validation; require HTTPS; restrict allowed hosts and redirects; verify the downloaded artifact against a trusted SHA-256 digest or signature before use. |
| **Medium / high-risk attack surface** | Generic IPC forwarding in the preload bridge | `app/preload.js` exposes `invoke(channel, ...args)`, `send(channel, ...args)`, and `on(channel, callback)`, allowing renderer code to supply channel names instead of calling only a fixed set of narrow methods. Exploitability depends on renderer trust and the main-process handlers, but this unnecessarily broadens the IPC surface. | Replace generic forwarding with an explicit allowlist of required channels; validate the sender and every payload in the main process; keep privileged filesystem, process, and network operations narrowly scoped. |
| **Medium** | Disk worker can report allocation as verified after an allocation error | In `app/workers/diskWriterWorker.js`, `allocateFile()` catches errors without propagating failure, while the message handler subsequently emits `completed` with `verified: true`. The write branch also sets `verified: true` without running the digest check in that branch. This can make a failed or not-yet-verified operation look successful. | Propagate allocation failures; distinguish `written` from `verified`; only report integrity verification after the relevant digest check succeeds, and require full-file verification before declaring a download complete. |
| **High-priority review item; exploitability not confirmed here** | Manifest-controlled filesystem changes | The content updater processes remote manifest instructions that can add, overwrite, or delete local files. A path-validation flaw could allow writes or deletions outside the intended build directory. This review does not claim a path-traversal exploit has been demonstrated. | Canonicalize each target path and prove it remains inside the selected build root before every read, write, or deletion. Reject absolute paths, traversal segments, unexpected path forms, and unsafe symlink targets; test with adversarial manifests in a disposable directory. |
| **Medium / informational** | MD5 is used for chunk checksums | The disk writer calculates MD5 for chunk verification. A checksum is only as trustworthy as its expected value, and MD5 should not be used as a modern authenticity mechanism. | Use a trusted SHA-256 digest or digital signature for artifact integrity/authenticity. If a legacy protocol requires MD5, document that limitation and do not treat it as proof of trusted origin. |
| **Supply-chain risk** | Bundled native and executable files are opaque to source review | `app/build/Release/dll_injector.node` and `app/binaries/FortniteLauncher.exe` are compiled binaries; their behavior and origin cannot be established from the readable JavaScript alone. | Record provenance and build instructions, verify publisher signatures where available, publish trusted hashes, and review/rebuild from trusted source before distribution. |
| **Privacy risk to verify** | URLs and diagnostic context may contain sensitive values | Manifest URLs and diagnostic context can reveal signed query parameters, local paths, account identifiers, or authentication material if logged or sent to telemetry. The impact depends on the actual value and what is collected. | Redact tokens, authorization codes, signed query parameters, and unnecessary personal paths before logging or sending telemetry. Rotate any real credential that was exposed. |

### Immediate remediation order

1. **Fix TLS certificate validation** in client-DLL and build-manifest downloads; restrict hosts and redirects and verify artifacts before use.
2. **Narrow the IPC bridge** to explicitly named methods and validate all inputs at the main-process boundary.
3. **Correct the download worker's result contract** so allocation, writing, chunk verification, and full-file verification are separate states.
4. **Prove filesystem confinement** for content updates and build downloads; validate paths, manifest schemas, and resource limits before file operations.
5. **Document binary provenance and telemetry redaction** before distributing a release.

### Important limitations

These findings describe observable code patterns and security-sensitive areas, not proof that the application has been exploited. The manifest-path item and privacy risks require end-to-end verification before being called confirmed vulnerabilities. No specific CVE is asserted because the checked-in package metadata alone is not a complete resolved dependency inventory. The bundled main process, renderer bundle, native addon, and helper executable still warrant independent review and runtime tests.

## Deep-dive security review: evidence, impact, and remediation

**Review date:** 2026-10-30  
**Scope:** Static review of the checked-in bundled main process (`app/index.js`), preload bridge (`app/preload.js`), disk writer worker, and `package.json`. No live exploit was run. This is not a penetration test, a full dependency scan, or a native-binary audit.

### Findings

| Priority | Finding | Evidence and impact | Remediation |
| --- | --- | --- | --- |
| **Critical design risk** | Electron renderer has Node integration and weakened web protections | The BrowserWindow configuration sets `nodeIntegration: true`, `webSecurity: false`, and `allowRunningInsecureContent: true`. If untrusted or compromised renderer content executes, the impact can extend to local-process and filesystem capabilities. | Set `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true`; remove insecure-content allowances. Restrict navigation and new-window creation to an explicit allowlist. |
| **High** | TLS certificate validation disabled for downloads | Download request paths use `rejectUnauthorized: false`, weakening verification of the remote server's identity and enabling interception/substitution risk. | Restore certificate verification, require HTTPS, restrict redirects and allowed hosts, and authenticate manifests/artifacts with a trusted signature or independently trusted SHA-256 digest. A checksum delivered by the same unauthenticated response is insufficient. |
| **High** | Authentication callback data is logged | The deep-link callback logs the authorization code and callback URL. These may contain short-lived credentials or other sensitive query parameters. | Never log raw callback URLs or codes. Validate scheme, host, path, and state; redact sensitive query parameters; review and purge exposed logs and revoke/rotate any live credentials found there. |
| **High** | Token passed in process command-line arguments | Launch construction includes a value derived from a token in an `AUTH_PASSWORD` argument. Depending on OS and permissions, process arguments may be visible to local diagnostics, other processes, crash reports, or support bundles. | Prefer a protected supported credential channel, reduce token lifetime/scope, and redact launch arguments from logs and crash/support reports. |
| **High; exploitability unconfirmed** | Manifest-driven filesystem operations may escape the intended build directory | Update logic combines a destination directory with names supplied by a remote manifest before performing file operations. Without canonical containment and symlink checks, traversal-style names may target unintended files. | Canonicalize root and target paths, enforce path-boundary-aware containment before every read/write/delete, reject absolute paths and traversal segments, and prevent symlink escapes. Test only in a disposable fixture. |
| **High-priority review item; exploitability unconfirmed** | Build-download manifest can control output paths and sizes | `DownloadOrchestrator` fetches a renderer-supplied manifest URL with TLS certificate verification disabled, then joins manifest `file.pathName` values to the destination and uses declared sizes/chunks without visible schema, path-containment, or resource-limit validation. | Restore TLS verification; allowlist manifest hosts; validate schema, file names, sizes, chunk ranges and totals; enforce canonical destination containment; cap manifest size, file count, file size, and total download size. |
| **Medium** | Generic IPC forwarding | The preload bridge exposes generic `invoke`, `send`, and event subscription methods that accept renderer-supplied channel names. This broadens the privileged API and makes mistakes in main-process handlers more consequential. | Export narrowly scoped named methods; allowlist channels; validate payload type, size, and sender/origin in privileged handlers. |
| **Medium** | Disk writer may report success without successful verification | Allocation errors can be caught without propagating failure, while a completion response can still report `verified: true`; a write result can also be marked verified before the corresponding digest comparison. | Fail closed, propagate allocation/write errors, and model allocation, write, chunk verification, and full-file verification as distinct states. Only set verified after a successful digest comparison. |
| **Medium** | Resume-download logic may append a full response to a partial file | The updater supports range/resume behavior but accepts both HTTP 200 and 206 responses; if a server ignores a range request and returns the full file, appending it to an existing partial file can corrupt the result. | When resuming, require a valid 206 response and validate `Content-Range`; if a 200 response arrives, truncate/restart rather than append. Verify final size and digest. |
| **Medium** | External URL handler lacks an evident scheme/host allowlist | A renderer-provided URL is forwarded to `shell.openExternal` without an obvious allowlist at that handler. Unsafe schemes can invoke unexpected local handlers on some systems. | Parse URLs and allow only required schemes (normally HTTPS) and known hosts; reject file, javascript, and other unneeded schemes. |
| **Low / correctness** | Launch completion notifications can be duplicated or misleading | Both process `exit` and `close` handlers can call the same callback; missing native dependencies can also lead to a positive-looking injection callback. | Use an idempotent lifecycle state machine and structured result codes that distinguish process spawn, dependency missing, injection attempt, and actual exit. |
| **Supply chain** | Native addon and helper executable are opaque to JavaScript review | The repository contains compiled `dll_injector.node` and `FortniteLauncher.exe`; their behavior and provenance cannot be established from JavaScript alone. | Publish provenance, hashes and signatures; audit/rebuild from trusted source where possible; scan and test packaged binaries in an isolated environment. |
| **Dependency inventory gap** | Package ranges do not identify exact resolved dependencies | `package.json` uses semver ranges, and a root lockfile was not available in the reviewed repository snapshot. This prevents a reliable CVE-by-CVE assessment from the manifest alone. | Commit the release lockfile, record Electron/Node versions, and scan the resolved production and development dependency trees against current advisories. No specific CVE is asserted by this review. |

### Potential attacker impact (static assessment)

The following explains why the findings matter at a high level. It is not an exploit guide: no payloads, exploit code, or live attacks were attempted. The impact depends on the stated precondition, and static inspection alone does not prove that an attacker can reach that precondition.

| Risk area | Evidence in this checkout | Potential impact if the precondition is met | Assessment and defensive action |
| --- | --- | --- | --- |
| Renderer compromise could reach privileged operations | `BrowserWindow` enables `nodeIntegration`, disables `webSecurity`, and permits insecure content; the preload also exposes generic IPC methods. | If untrusted script execution occurs in the renderer, the combination may expose local files, process capabilities, or privileged main-process operations. | **Critical design risk; no renderer injection was demonstrated.** Disable Node integration, restore web security, enable sandboxing, restrict navigation, and replace generic IPC with validated narrow methods. |
| Untrusted URL passed to the system browser | `open:browser` forwards the renderer-supplied value directly to `shell.openExternal` without an evident scheme/host allowlist. | Depending on the operating system and registered handlers, an unexpected scheme could open a local handler or application. | **Reachable handler; exploitability depends on the input path and OS.** Parse and allow only intended HTTPS destinations; reject unexpected schemes and validate the IPC sender. |
| Client DLL substitution | The client downloader accepts a URL supplied at runtime, disables TLS certificate verification for both the initial request and redirect, writes the result under user data, and the launch path later selects that DLL for injection. | If an attacker can influence the URL or intercept the request, untrusted code could be stored and then passed to the native injection path. | **Confirmed insecure transport configuration; attack-chain reachability was not tested.** Restore TLS verification, restrict hosts and redirects, verify a trusted signature/digest, and refuse to inject unverified files. |
| Manifest-directed file changes | The content updater joins `change.name` to the selected build's PAK directory and uses it for file checks, deletion, and downloads without a visible canonical-path containment check. | A malicious or compromised manifest could potentially overwrite or delete files outside the intended content directory. | **High-priority path-validation issue; traversal impact not demonstrated.** Canonicalize root and target paths, enforce containment and reject symlink escapes before every operation. |
| Build-download manifest and file writes | The main IPC handler accepts a download payload; `DownloadOrchestrator.fetchManifest()` disables TLS verification; manifest `file.pathName` values are joined to the destination and passed to file scanning, placeholder creation, allocation, and chunk writing without visible canonical containment checks. Declared sizes and file counts also feed disk and worker operations. | If an attacker can influence the payload or manifest response, they may be able to target files outside the selected build folder or cause excessive disk/memory use. The TLS setting increases exposure to manifest substitution on the network. | **Confirmed unsafe trust/validation pattern; arbitrary file-write or resource-exhaustion impact not dynamically demonstrated.** Use TLS verification, a host allowlist, strict manifest schema and size limits, canonical path checks before every filesystem operation, and a trusted signature for manifests/artifacts. |
| Authentication callback confusion and credential exposure | The `fluxapp://` callback handler extracts `code` and sends it to the renderer without a visible scheme/host/path or state check; callback URLs/codes are logged. | A forged or replayed callback may interfere with login if the surrounding OAuth flow permits it, while logs may retain short-lived authorization material. | **Validation gap visible; exploitability depends on OAuth server and flow behavior.** Validate the complete callback and per-request random state, use PKCE where supported, and redact codes/URLs from logs. |

These items should be reported as **security risks or unverified vulnerability candidates**, not as confirmed remote exploits. Confirming exploitability would require an authorized test build, controlled accounts, a disposable VM, mock services, and harmless test files. Do not probe public accounts, production services, other users' machines, or anti-cheat/game processes.

### Prioritized verification plan

1. **Electron hardening:** inspect effective runtime settings; disable Node integration; enable context isolation, sandboxing, and web security; block unexpected navigation and new windows.
2. **TLS and artifact integrity:** use a test endpoint with an invalid certificate and verify that downloads fail; test redirects; verify trusted signatures/digests before using downloaded artifacts.
3. **Filesystem confinement:** in a temporary directory, test `../`, absolute paths, alternate separators, encoded traversal, duplicate paths, and symlink escapes; confirm no operation changes files outside the fixture root.
4. **Authentication hygiene:** use synthetic credentials, trigger a callback, then inspect logs, telemetry, crash reports, and process arguments for leaks.
5. **IPC minimization:** inventory every registered channel and renderer caller; replace generic forwarding with explicit methods; test malformed payloads and unexpected senders.
6. **Resume and disk-worker correctness:** simulate allocation/write failures, truncated responses, servers that ignore Range, and digest mismatches; never report success or verification on failure.
7. **Supply chain:** scan the exact release lockfile, inspect native-module/runtime versions, verify binary signatures/hashes, and test a packaged release in a disposable VM.

### Confidence and limitations

The unsafe configuration and code patterns above are visible in the checked-in implementation. The real-world exploitability of renderer compromise, path traversal, and sensitive-data exposure depends on reachable inputs, runtime behavior, operating-system permissions, and external service responses. This review does **not** establish that remote code execution has been achieved, that a path traversal has been exploited, that users have been compromised, or that a particular CVE is present. Validate the findings with controlled tests before assigning CVSS scores or making public claims.

## Project goals and scope

The codebase brings several desktop-client responsibilities together in one Electron process:

1. Present a graphical user interface for browsing and managing builds.
2. Coordinate local build downloads and show progress.
3. Compare local content with a manifest supplied by a service.
4. Inspect selected files in a local game build and calculate file fingerprints.
5. Request the game-launch operation and track the resulting process state.
6. Exchange events between the user interface and the main process through Electron IPC.
7. Support deep-link callbacks, client updates, logging, telemetry, and optional Discord presence.

These responsibilities should be considered separate subsystems. The UI can expose a button even when the operation behind it is incomplete, a native dependency is missing, or a service is unreachable. A visible button is therefore not proof of successful end-to-end functionality.

The checked-in files are largely generated or bundled output. This means some function names and internal module labels remain visible in the bundle, but the original component boundaries, TypeScript types, build configuration, and development scripts are not all present in the repository snapshot.

## Feature summary

The following table summarizes what can be established from the checked-in implementation.

| Feature | Code evidence | Practical status |
| --- | --- | --- |
| Desktop window and renderer | Electron main process and renderer directory | Present |
| Single-instance behavior | Main process requests a single-instance lock | Present |
| Local build launch flow | Main process receives a launch request and calls the launch manager | Present; runtime-dependent |
| Native launcher module | Native addon is loaded conditionally | Present; compatibility-dependent |
| Game-close notifications | Main process forwards process-close events to the renderer | Present in the launch flow |
| Build downloads | Download orchestrator and worker files | Present; depends on valid manifests and endpoints |
| Download progress | IPC callbacks and desktop progress bar | Present |
| Download cancellation | A cancellation IPC route is exposed | Route exists; verify cancellation behavior in the full flow |
| Content update checking | Manifest and local-file comparison logic | Present; exercise carefully on a test copy |
| File analysis | Recursive traversal and hash calculations | Present |
| Shipping executable hash | Reads the local game executable and computes a hash | Present |
| Client fingerprint | Calculates a fingerprint for a locally stored client DLL | Present; requires the selected DLL |
| PAK disabling | Function logs the requested file list | **Stub; no disabling operation is implemented here** |
| Client DLL download | HTTPS download function and progress events | Present, but has important TLS-validation concerns noted below |
| Authentication callback | Custom-protocol callback handling forwards a code to the renderer | Callback handling exists; full authentication is not guaranteed by this alone |
| App updates | An update-check and install/restart path exists | Depends on packaging/update configuration |
| Visual C++ runtime check | Windows registry query for a runtime entry | Present; registry check is not a complete repair/install workflow |
| Discord Rich Presence | Discord RPC client and activity update handler | Present; depends on Discord and valid activity data |
| Sentry diagnostics | Context, breadcrumbs, and error-reporting calls | Present; telemetry configuration should be reviewed |
| Wrapped cache | Local JSON cache read/write handlers | Present |
| Linux-native game launching | The native addon/helper and game paths are Windows-oriented | Not established by this repository snapshot |

The status labels describe code presence, not a guarantee that a feature succeeds in production. Any claim of reliable operation requires testing with a supported build, correct service metadata, valid credentials, and a compatible system.

## Launcher architecture

The main process is responsible for operating-system integration and work that should not be performed directly by the renderer. It creates the application window, receives IPC messages, coordinates downloads and launch requests, reads and writes local files, and reports results back to the interface.

The renderer provides the visible application experience through compiled HTML, CSS, JavaScript, images, and other assets. It requests privileged operations through the preload bridge instead of relying only on visual UI state.

The preload layer, `app/preload.js`, uses Electron's `contextBridge` to expose a controlled API under the names `electron` and `electronAPI`. The API includes groups of operations for the app window, external browser, authentication callbacks, library paths, file hashes, downloads, launch state, profiler results, Discord presence, content updates, and cached data.

A simplified, conceptual event flow looks like this:

```text
React renderer
    |
    | user action / request
    v
Preload bridge (contextBridge)
    |
    | Electron IPC message or invoke request
    v
Electron main process
    |
    +--> local filesystem and build paths
    +--> download orchestrator and workers
    +--> manifest/content updater
    +--> native launch component
    +--> app updater and system integrations
    |
    | result / progress / completion event
    v
Preload bridge
    |
    v
React renderer updates the interface
```

This division allows the UI to remain responsive while longer operations happen elsewhere. It also creates responsibilities for event validation, error propagation, cancellation, permissions, and cleanup. Those responsibilities should be tested for each action rather than inferred from the existence of an IPC channel.

### Main process

The bundled `app/index.js` contains the Electron main-process implementation and much of the application logic. It initializes application integrations, configures the app protocol, creates the window, registers IPC routes, and coordinates major subsystems.

Because it is bundled and very large, reviewing it is harder than reading a modular source tree. For long-term maintainability, the code should ideally be separated into files for window management, launch orchestration, content updates, downloads, profiler functions, integration code, and persistence.

### Preload bridge

The preload file maps renderer calls to IPC events. Examples of exposed operations include window controls, opening directories, obtaining hashes, selecting a download destination, starting or cancelling downloads, calling the launch system, analyzing a build, checking content updates, getting a client fingerprint, and reading or writing the local Wrapped cache.

IPC is a boundary between the renderer and the main process. New features should use narrowly scoped, validated operations, validate user-controlled paths and URLs, and avoid exposing powerful generic operations unless they are genuinely needed and appropriately constrained.

### Renderer and UI assets

The `app/renderer/` directory contains the HTML entry page, compiled JavaScript and CSS assets, icons, images, and a 3D asset. The dependency list includes React, React DOM, React Router, React Query, Radix UI components, Motion, Three.js, React Three Fiber, and charting libraries. Those dependencies indicate the technologies available to the renderer; they do not prove that every package is used in every screen.

Because the main renderer bundle is generated output, changes made directly to minified assets can be difficult to maintain and may be overwritten by a later rebuild. The original UI source and repeatable build configuration would be valuable additions.

## Game launch lifecycle

The launch path begins when the renderer asks the preload bridge to send a launch request. The main process receives the local build path along with launch context such as an environment, token, credentials, and build metadata. The metadata can include an identifier, name, build, version, or season number.

The main process then records context for diagnostics and calls the launch manager. The launch manager tracks whether a game process is considered active, builds a path to the expected Windows game executable, and asks the operating system to start that executable. It registers process-close handling and reports launch-related events to the renderer.

At a high level, the flow is:

1. The user selects a build and starts the launch action.
2. The renderer sends the build path and launch context through the preload bridge.
3. The main process receives the IPC event and creates diagnostic context.
4. The launch manager checks its current launch-state flag.
5. The launcher constructs the expected game executable path under the selected build directory.
6. The launcher attempts to create the game process.
7. The process identifier and close event are tracked when available.
8. The renderer is notified of launch-related results and game closure.

This sequence describes the implemented structure; it does not imply that every step succeeds on all configurations. A missing executable, invalid build directory, native module load failure, unsupported game version, permission problem, incompatible system, or external service issue can prevent a successful launch.

The current launch implementation also contains hard-coded launch arguments, including an argument that changes anti-cheat behavior. That is a significant compatibility and policy concern: do not use the launcher to evade anti-cheat controls or access services without authorization. Any legitimate development/testing use should be restricted to an environment where the operator has explicit permission.

### What a launch success event means

A launch event and an actual, playable session are not necessarily identical. A process may be created and then terminate, fail during initialization, reject the supplied authentication context, or encounter a game-side compatibility issue. A robust implementation should distinguish at least these states:

- Request received.
- Build path validated.
- Required executable found.
- Native dependency available.
- Process created.
- Game process still running.
- Game process exited normally.
- Game process exited with an error.
- Game-side initialization completed, if the application has a trustworthy way to know this.

The current bundled code tracks the launcher process state and sends notifications, but users should not interpret a UI response alone as proof that a complete game session initialized successfully.

### Native launcher component

The file `app/build/Release/dll_injector.node` is a compiled Node.js native addon. The main process attempts to load it from a development or packaged-resource path and logs an error if loading fails. Native addons must match the relevant operating system, CPU architecture, Node/Electron ABI, and build expectations. A binary compiled for one Electron runtime or operating system should not be assumed to work on another.

The repository also includes `app/binaries/FortniteLauncher.exe`; the main process attempts to start this helper when the application becomes ready. The existence of this helper and of the native addon does not prove that the required game process or native functionality is available on a given system.

If the native module is missing or incompatible, collect the error message and relevant runtime versions before making changes. Do not replace a native module with an unknown prebuilt binary from an untrusted source.

## Build downloads

The repository includes a download orchestration path, a regular download worker, an alternate pooled worker, and a disk-writing worker. The main process accepts download details through IPC, selects a destination, creates the destination directory when needed, initializes the orchestrator, and calls its build-download operation.

The destination can be selected by the user. If the payload supplies a destination, the main process attempts to determine the final folder from the destination and build identifier. If no destination is supplied, the default path is under the user's Documents directory in an Era/builds location, organized by the build UUID.

During a download, the main process sets the desktop progress bar and the application forwards progress events to the renderer. When the orchestrated operation returns, the main process records the duration, clears the progress bar, and sends completion-related events. Error paths are logged and should be investigated using the logs and network/service metadata.

The download system depends on data supplied at runtime. That can include a build identifier, manifest URL, build metadata, expected filenames, sizes, and the remote endpoints used by the worker. The repository cannot promise that any specific build is available, that a remote endpoint still exists, or that server-side data is correct.

### Download safety and reliability considerations

A production-grade downloader should validate the manifest schema before starting, reject unexpected paths, check the destination stays within the selected directory, enforce reasonable file-size limits, verify downloaded bytes against trusted expected hashes, and handle interrupted downloads without leaving a build that looks complete.

It should also clearly separate the states of queued, downloading, verifying, completed, cancelled, and failed. A progress percentage should not be treated as verification of integrity. A file downloaded to disk is not automatically a valid game file.

When testing download code, use a disposable build directory and keep a backup of important local data. Review manifests and URLs before running a large transfer. Avoid using real account credentials in test fixtures or logs.

### Download cancellation

The preload bridge exposes a cancellation request. The actual user experience depends on whether the running orchestrator and workers correctly observe that request, stop active network streams, close open file handles, clean up temporary files, and report the final status. A cancellation button should be tested during a small test download, near the end of a download, and during shutdown to confirm that the state is consistent.

## Content update system

The content update implementation fetches a manifest and compares its declared changes with files under the selected local build. The code operates on the Fortnite content PAK directory, checks whether target files exist, compares a local hash with the manifest's expected hash, collects files that require download or update, and handles changes marked for deletion.

The code includes retry logic for failed file downloads, using increasing wait intervals up to a capped delay. It reports progress while updating content and can create the destination PAK directory if required. When the manifest marks a file for deletion, the updater attempts to remove the corresponding local file.

Because content updates can overwrite or delete local files, they are not a harmless read-only check. Validate the manifest source, keep backups, and test against a disposable copy of a build before relying on this workflow. A bad manifest, unexpected filename, malformed metadata, interruption, or failed download may leave the local build partially updated.

### Manifest assumptions

A manifest-driven updater normally needs, at minimum, a well-defined schema for the change type, filename, remote location, expected hash, and file size. It also needs consistent rules for path normalization, duplicate names, retry behavior, deletion, interrupted transfers, and final verification.

The bundled updater expects structured change information, including change types such as download/update and delete. That does not mean arbitrary manifests are safe or supported. Only use manifests from sources you trust and are authorized to use.

### Important update checks

Before using content updates on a valuable local installation, verify that:

- The URL points to the intended manifest.
- The manifest can be parsed and follows the expected schema.
- Every listed file resolves under the expected content directory.
- File sizes and checksums match the source's specification.
- The updater preserves the intended local build structure.
- Errors are visible to the user and do not silently mark a partial update as complete.
- Deletions are recorded and recoverable where appropriate.

## Build profiler and file fingerprints

The profiler logic recursively inspects selected directories within a local build, including the content PAK directory and a plugin directory. For files it discovers, the implementation calculates two values and returns result entries to the renderer.

The first hash-like value is calculated from the file's basename and file size. This is a lightweight identifier, **not a cryptographic integrity check of the whole file**: different content can have the same filename and size. The second calculation reads a portion near the end of the file, combines it with the basename and size, and computes a SHA-256 digest. That can be useful for comparison workflows, but it is also not the same as hashing every byte of the file.

The profiler also exposes a shipping-hash operation that reads the expected game executable and computes an MD5 digest from its bytes. MD5 may be useful for compatibility with an existing comparison protocol, but it is not a modern choice for security-sensitive integrity verification. A verified SHA-256 digest from a trusted source is preferable when a security guarantee is required.

The profiler refuses to begin the directory analysis while the launch manager considers the game to be running. It logs directory traversal errors and returns the collected results after analysis is complete. The exact meaning of a match depends on the format and reliability of the comparison data used by the service or UI.

### What hashes can and cannot tell you

A matching hash can help compare a local file with a known reference, assuming the algorithm and reference are appropriate for that purpose. It does not automatically prove that the reference itself is trustworthy, that a complete build is valid, or that the game will start.

Likewise, a mismatch does not by itself prove malicious modification. The file may simply come from a different game version, region, build, or service environment. Interpret profiler results alongside build metadata and the source of the reference values.

### PAK management status

The interface/API contains an operation for disabling selected PAK files. In this revision, the implementation of `disablePaks()` only logs the requested file list. It does not rename, move, delete, or otherwise disable the selected files. This is a placeholder and should be treated as such. Any future implementation should be explicit, reversible, validated against the selected build directory, and tested with backups.

## Client DLL download and fingerprinting

The client-download function receives a URL and an environment value, chooses a filename based on the environment, creates a directory under Electron's user-data folder, and writes the downloaded content to that location. It also reports download progress through an IPC event. A separate client-fingerprint function selects the expected local DLL filename for an environment and computes a digest of that file when it exists.

The expected environment labels in the code include development, staging, and production. The corresponding filenames differ, which allows the caller to keep environment-specific client files separate. If the file is missing, the fingerprint operation returns a missing-file result instead of a hash.

### TLS verification concern

The client downloader currently makes HTTPS requests with certificate verification disabled. This weakens protection against interception or a malicious endpoint and should be corrected before any security-sensitive or production use. A secure downloader should validate certificates by default, validate redirect destinations, restrict allowed hosts where possible, and verify the received file against a trusted checksum or signature before using it.

Do not treat a successful download as proof of authenticity. Avoid placing credentials in URLs, do not trust arbitrary download links, and do not execute or load a downloaded binary until its origin and integrity have been established.

## Authentication and deep links

The main process registers a custom application protocol named `fluxapp` and handles incoming URLs that contain an authorization code. When a suitable callback arrives, the app forwards the code to the renderer and brings the window to the foreground when applicable.

This is one part of an authentication flow, not proof of a complete authentication implementation. A complete flow also needs the correct service-side configuration, callback registration, state/CSRF validation where applicable, safe handling of authorization responses, clear expiration behavior, and secure storage or exchange of any resulting session information.

The code passed in a callback should be treated as sensitive. Do not paste callback URLs into public issue reports, screenshots, chat messages, or logs. If a code or session secret is exposed, follow the account/service's revocation and recovery process.

The repository contains the callback handling, but the available snapshot does not establish that all account login endpoints, token exchanges, refresh flows, or error cases work correctly end to end. If authentication fails, determine whether the callback reaches the app, whether the renderer receives the expected event, and whether the next service request succeeds. Never work around a login failure by sharing or hard-coding a real user's session credentials.

## Discord Rich Presence

The application creates a Discord RPC client and accepts presence updates through an IPC message. The main process forwards the supplied activity fields to the Discord client and sets a default large image key. The experience depends on Discord being available, a valid application/client configuration, and activity data that the RPC service accepts.

If presence does not appear, first confirm that Discord is running and that the application integration is configured correctly. Then check whether the renderer actually sends the presence event and whether the main process logs an error. A Discord connection problem should not prevent core local build management from providing a clear error state.

Do not send account credentials or private session information as part of a presence payload. Presence should contain only the activity information that is intended to be visible to other people.

## Diagnostics, logs, and Sentry

The main process includes structured logging and calls into Sentry for application context, launch events, exceptions, and related breadcrumbs. It tags diagnostics with information such as the launcher version, environment, operating system platform, architecture, and runtime versions. Launch context can include a build identifier, build name, version, environment, and local build path.

Remote diagnostics can make it easier to investigate errors that are difficult to reproduce, but they also introduce privacy responsibilities. Before enabling telemetry for a distributable build, document what is sent, what identifiers are attached, how long data is retained, and how users can report or review issues without exposing private information.

The application also exposes a way to open local logs. Log files are useful when diagnosing failed launch attempts, missing native modules, content updates, downloads, and authentication callbacks. Before publishing logs, remove tokens, authorization codes, private usernames, personal file paths, and any service-specific secrets.

### Useful information for a diagnostic report

A helpful report includes the operating system and version, CPU architecture, Node/Electron versions when applicable, the app version, the selected build's version or identifier, the exact action that failed, the timestamp, and the sanitized error message. If a problem is intermittent, state how often it happens and whether restarting the application changes it.

Avoid submitting an entire home directory listing or unrelated configuration dump. Include only what is necessary to reproduce the issue.

## Local Wrapped cache

The main process stores cached Wrapped reports and accolades as JSON files under an application-specific user-data subdirectory. Separate handlers provide operations to cache and retrieve report data and accolades. When cached data is available and parses successfully, the handler returns it; when files are absent or an error occurs, the handlers return a missing/error result and log the failure.

This cache is a convenience for persistence and responsiveness. It should not be treated as the authoritative source for an account's current data, and it should not contain raw session credentials. Cache schemas may change between app versions, so robust code should handle corrupt, outdated, or partially written JSON files without crashing the app.

## Repository structure

```text
Era-Code/
├── README.md
├── package.json
└── app/
    ├── index.js
    ├── preload.js
    ├── binaries/
    │   └── FortniteLauncher.exe
    ├── build/
    │   └── Release/
    │       └── dll_injector.node
    ├── renderer/
    │   ├── index.html
    │   ├── assets/
    │   │   ├── compiled JavaScript and CSS
    │   │   ├── icons and illustrations
    │   │   └── image and 3D assets
    │   └── application UI resources
    └── workers/
        ├── diskWriterWorker.js
        ├── downloadWorker.js
        └── downloadWorkerPooled.js
```

The tree above highlights the major parts of the checked-in application; it omits individual artwork files and generated bundle details to keep the overview readable.

### Important files

| File or folder | Responsibility |
| --- | --- |
| `README.md` | Project overview, workflow documentation, setup notes, and implementation caveats |
| `package.json` | Package metadata, entry point, and dependency declarations |
| `app/index.js` | Bundled Electron main process and application logic |
| `app/preload.js` | Renderer-to-main IPC bridge exposed with `contextBridge` |
| `app/renderer/index.html` | Renderer HTML entry point |
| `app/renderer/assets/index-Cmjydc3O.js` | Compiled renderer JavaScript bundle |
| `app/renderer/assets/index-ByT-tuHS.css` | Compiled stylesheet |
| `app/renderer/assets/` | Icons, images, logos, and additional UI assets |
| `app/workers/downloadWorker.js` | Bundled download/network worker implementation |
| `app/workers/downloadWorkerPooled.js` | Bundled worker implementation for pooled download work |
| `app/workers/diskWriterWorker.js` | Worker responsible for disk-writing work |
| `app/binaries/FortniteLauncher.exe` | Windows executable the main process attempts to start as a helper |
| `app/build/Release/dll_injector.node` | Compiled native Node.js addon used by the launch path |

The names of compiled assets may change when the renderer is rebuilt. Code that references generated asset names should be updated by the build system rather than maintained manually when original source and tooling are available.

## Technology stack

The dependencies declared in the checked-in package include several major groups:

### Desktop runtime

- **Electron** supplies the desktop window, main process, IPC facilities, system dialogs, external URL handling, updater integration, and application-level lifecycle hooks.
- **Node.js APIs** provide filesystem access, hashing, network support, process coordination, and worker operations where used.
- **electron-log** is available for application logging.
- **electron-updater** provides application update functionality when suitable release and packaging configuration is present.

### Interface and state

- **React** and **React DOM** provide the renderer framework.
- **React Router** provides routing support.
- **TanStack React Query** provides server-data/query state utilities.
- **Zustand** provides lightweight state management.
- **Radix UI** provides accessible low-level interface components and icons.
- **Motion** provides animation support.
- **Tailwind-related utilities and class-variance-authority** can support class composition and visual variants.

### Graphics, data, and networking

- **Three.js**, **React Three Fiber**, **Drei**, and **Rapier** support 3D content and physics-related experiences.
- **Recharts** supports data visualizations.
- **Axios** and **Undici** provide HTTP client functionality.
- **Phoenix** supplies client functionality for Phoenix-style real-time connections when used by the app.
- **Sentry** supports error reporting and diagnostic context.
- **Discord RPC** supports Rich Presence integration.

A dependency being listed in `package.json` only means it is declared for the project. It does not mean every package is required at runtime for every action or that each feature is complete.

## Requirements and platform compatibility

### General requirements

- A Node.js LTS version compatible with the declared dependencies.
- npm, to install declared JavaScript dependencies.
- A desktop environment supported by the relevant Electron build.
- Network connectivity for features that contact services, download files, check updates, or send diagnostics.
- Enough free disk space for dependencies, downloaded builds, temporary data, and application caches.

The exact Node.js/Electron combination matters when native modules are involved. Follow the runtime expected by the native addon and avoid assuming that a package that installs on one machine is ABI-compatible with another.

### Windows-oriented dependencies

The current build paths explicitly expect a Windows Fortnite shipping executable and include a Windows helper executable and a compiled native addon. The Visual C++ runtime check also contains Windows-specific registry queries. Those are strong indicators that the game-launch path is Windows-oriented.

Electron itself is cross-platform, but this does **not** make the bundled launcher, helper executable, or native module portable. A Linux desktop may be able to inspect some JavaScript assets, but the checked-in files do not establish a supported Linux-native game-launch workflow. A proper port would require platform-specific process handling, compatible native modules, path handling, packaging, and explicit testing.

### Network requirements

Login callbacks, manifest downloads, content updates, client downloads, application updates, Discord Rich Presence, and Sentry may rely on external services. A network failure can therefore affect one subsystem without necessarily indicating that the entire application is broken.

Use service URLs and credentials provided by the intended project configuration. Do not assume a URL found in an old build still exists or is authorized for use.

## Getting the repository

Clone the repository using Git:

```bash
git clone https://github.com/troon-dev/Era-Code.git
cd Era-Code
```

Repository: [github.com/troon-dev/Era-Code](https://github.com/troon-dev/Era-Code).

If you already have a local checkout, inspect the branch and working tree before pulling changes:

```bash
git status
git branch --show-current
git pull
```

When investigating a bug, record the commit you tested. Two copies of the same project can behave differently if they use different branches, dependencies, native modules, or external manifests.

## Installing dependencies

### Install the project dependencies

From the repository root, install the dependencies listed in `package.json`:

```bash
npm install
```

This installs the JavaScript packages only. It does **not** install a ready-to-use Era Launcher application: this checkout has no installer/release configuration, no lockfile, and no declared `electron` dependency or `start`/`dev`/`build` script. The checked-in `dll_injector.node` is a prebuilt native module and may not match the Electron runtime installed on your computer.

Check which scripts are available in your checkout:

```bash
npm run
```

There are currently no package scripts to install or launch the app. For an end-user installation, use a release installer supplied by the project maintainers, if one is available; this repository snapshot alone does not provide a documented installer. Do not treat `npm install` as an installer for Windows or as proof that the launcher is ready to use.

If installation fails, preserve the complete error and check the installed Node.js and npm versions:

```bash
node --version
npm --version
```

A dependency installation is not a test of the full launcher. Native addon loading, platform assumptions, remote service configuration, and the availability of game build files all need separate verification.

### Native module setup

The repository contains a prebuilt `dll_injector.node`. A native addon normally needs to match the application's runtime and platform. The bundled entry point mentions a native-build command in its error output, but that does not mean the corresponding script or source files are present in the checked-in package. Verify the build tooling and original native source before attempting to rebuild the module.

Never install an unknown binary from an untrusted download to silence a module-loading error.

## Running and inspecting the application

### Run from a source checkout

The application entry point is `app/index.js`, and it must run inside Electron rather than plain Node.js. The current `package.json` does not include Electron or define a launch script. If you have obtained the Electron runtime version intended for this exact build and installed it in the project environment, launch the entry point from the repository root with:

```bash
npx electron app/index.js
```

`npx` may offer to fetch Electron if it is not installed. Do not accept an arbitrary latest version for a release build: Electron versions affect native module compatibility, and the repository does not record the required Electron version. The command above is therefore a development launch example, not a guaranteed setup command for this snapshot. If Electron is not already available, ask the project maintainers for the matching runtime/version and original development setup.

The current renderer HTML and bundled assets are present, but that alone does not ensure a successful launch. The application also depends on Electron lifecycle APIs, native-module compatibility, Windows-specific game paths for game launching, and external service availability. The included `FortniteLauncher.exe` is a helper binary, not a standalone installer for Era.

For basic inspection before launching, use:

Useful checks include:

```bash
cat package.json
npm run
node --check app/preload.js
```

The syntax check above is appropriate for the JavaScript preload file. The large bundled main file may also be checked with Node's syntax checker, but successfully parsing it does not mean Electron APIs, native libraries, downloads, or game launching will work:

```bash
node --check app/index.js
```

Do not run `app/index.js` directly with plain Node as a substitute for Electron. The main process imports Electron APIs and expects the desktop runtime and application lifecycle to be in place.

For runtime troubleshooting, use the intended Electron packaging/development setup for the exact revision. Since the original build scripts and pinned Electron version are absent from this package snapshot, obtaining the original source tree or packaging configuration may be necessary to reproduce the official development workflow.

## Build and packaging notes

A repeatable Electron release process generally needs a supported Electron version, package metadata, a packaging tool and configuration, the renderer build pipeline, icon/resource handling, native-addon rebuild steps, and update publishing configuration. This repository snapshot does not include enough package scripts to document one guaranteed release command.

Before publishing a new package, verify all of the following in the actual build environment:

- The renderer assets are generated from the intended source revision.
- Native modules are compiled or selected for the exact Electron ABI and target platform.
- Windows-only helpers are packaged only for supported targets.
- Application resources are referenced using paths valid in both development and packaged mode.
- Update metadata and release endpoints match the build being published.
- Secrets and environment-specific endpoints are not accidentally included in distributable files.
- The packaged application starts, opens its window, and can display useful errors when a service or native dependency is unavailable.
- A small, disposable test build can exercise the download, update, and launch-error paths without risking important user files.

A successful packaging step alone does not validate the correctness of the game-launch workflow. Test every major subsystem separately.

## Understanding configuration and runtime paths

Electron applications distinguish between the project directory, packaged resources, the application's user-data directory, and user-selected build locations. These paths serve different purposes:

- **Project directory:** contains the checked-out source or bundled files used during development.
- **Packaged resources:** contains files copied into or alongside a packaged application. The main process uses resource paths to locate the native addon in packaged mode.
- **User-data directory:** stores app-specific state, such as the client DLL directory and the Wrapped cache.
- **Documents/builds directory:** serves as the default base for downloaded builds when a destination is not supplied.
- **Selected build directory:** points to the local build the user wants to inspect, update, or launch.

When a feature cannot find a file, identify which of these path categories it expects. A path that exists in a development checkout may not exist in a packaged build, and a relative path can resolve differently depending on the current working directory.

Do not copy user data or cached DLL files between environments without understanding which version and environment they belong to.

## Troubleshooting

This section is intended as a diagnostic checklist. It does not assume a single cause for any error; collect evidence before modifying files.

### The app does not open

Check that the dependencies installed successfully and that you are using the intended Electron launch method for this revision. Review the terminal output for module-resolution problems, a missing renderer entry, a missing packaged resource, or a failure during initialization.

If the repository was downloaded as a ZIP, confirm that the archive extracted completely. If you are working from Git, confirm that the expected branch and files are present.

### The UI opens but stays blank

The renderer is built from files under `app/renderer/`. Confirm that `index.html` and its referenced compiled CSS and JavaScript files exist. Look for errors loading the renderer assets and avoid renaming hashed asset files without updating the HTML or rebuilding the renderer.

A blank window can also result from an exception inside the compiled UI or a failed request for remote data. Distinguish a renderer startup error from an API/service issue.

### The native addon fails to load

Record the full error, operating system, architecture, Electron version, Node ABI, and path from which the app tried to load the addon. Confirm that the binary corresponds to the current runtime and platform. Do not assume a fresh `npm install` rebuilds a native addon; the current package does not declare a native-rebuild script.

If the native source/build configuration is not available, the repository may not be sufficient to reproduce the binary.

### The launcher cannot find a game executable

The code expects the selected build directory to contain a particular Windows game executable beneath the Fortnite binaries directory. Verify the selected directory carefully and confirm that the build is complete and is the intended version.

Do not point the launcher at an arbitrary directory or change protected system/game files just to make a path check pass. If the build is incomplete, use the intended build-management process to obtain or repair a legitimate copy.

### The process starts and exits immediately

A process being created is not the same as the game reaching its ready state. Check the process-close event, local logs, selected build metadata, dependency availability, and the error reported by the game itself. The launcher may not have enough information to distinguish every game-side initialization failure.

Do not disable security controls to work around this symptom. Investigate compatibility and authorization issues through supported configuration and testing.

### A download fails

Confirm the manifest URL, build identifier, server response, available disk space, write permissions, and whether the destination is a folder the current user can access. Review worker logs for network timeouts, invalid responses, disk-write errors, or checksum mismatches.

Test with a small or disposable build where possible. If the server metadata is incorrect, repeated retries will not fix the underlying problem.

### A download finishes but the build is incomplete

Check whether the completion event was sent, whether every expected file reached the destination, and whether integrity verification was successful. A progress bar reaching its end is not sufficient proof that all files are valid.

Inspect temporary and partial files before deleting anything. If a build contains valuable local data, preserve a backup before running a repair or content-update operation.

### Content updates remove or overwrite unexpected files

Stop using that destination and preserve the current state. The updater acts on manifest change instructions, including deletion instructions, so validate the manifest source and the listed change entries. Restore from a backup if required.

Report the sanitized manifest metadata and exact affected paths. Never publish access tokens or private download URLs that contain credentials.

### Authentication callback does not arrive

Check whether the custom protocol is registered in the intended installation, whether the callback reaches the running app, and whether a second instance is being handled correctly. The code uses a single-instance lock and a custom protocol callback. Registration differences between development and packaged mode can change behavior.

The callback mechanism is only one stage. After the renderer receives a code, the rest of the account exchange must also succeed. Do not ask someone else to send you their callback URL or token.

### Discord Rich Presence is missing

Confirm Discord is running and that the client/application configuration is valid. Check whether the renderer sends a presence update and whether the main process logs an RPC error. Presence is an optional integration and should report its own failure rather than making unrelated launch operations appear successful.

### The Visual C++ runtime check reports a problem

The check reads a Windows registry location for a runtime entry. It does not itself install or repair the runtime. Confirm the operating system and architecture and use official Microsoft distribution channels for any required runtime repair.

The check is skipped on non-Windows platforms, so a positive result on another platform should not be interpreted as verification that a Windows game environment is available.

### Logs contain sensitive information

Do not upload the original log publicly. Make a copy, remove authorization codes, tokens, user-specific identifiers, personal file paths, and private endpoints, and submit only the relevant context. If a real credential has been exposed, revoke or rotate it using the service's official process.

## Security, privacy, and safe testing

This project combines a desktop app with filesystem operations, downloads, process creation, an authentication callback, remote diagnostics, and a native module. These capabilities deserve a careful review before the application is distributed or run with a real account.

### Native binaries

The compiled native addon and included Windows executable should be treated as executable code, not as passive assets. Review their origin, checksum, expected behavior, and compatibility. A filename or repository location is not proof that a binary is trustworthy.

### Downloads and integrity

The client DLL downloader in this revision disables HTTPS certificate verification. That should be corrected before security-sensitive use. Certificate validation, redirect validation, trusted-host restrictions, and cryptographic integrity checks should be mandatory for a robust distribution pipeline.

Manifest-based content updates can overwrite or delete local files. Keep backups and limit update tests to directories that can safely be restored.

### Process and game compatibility

The launch path includes hard-coded arguments that can alter anti-cheat behavior. Do not use this repository to bypass anti-cheat enforcement, evade access controls, or enter services without authorization. Any legitimate testing should happen only with explicit permission and within the service's rules.

The README intentionally focuses on architecture and safe diagnostics rather than instructions to defeat security controls.

### Secrets and telemetry

Authentication codes, session tokens, credentials, and signed URLs can grant access to accounts or services. Keep them out of source control and bug reports. Review what Sentry receives before distributing the application, especially context that contains build paths, build identifiers, usernames, or other metadata.

### IPC boundaries

The preload bridge exposes main-process operations to the renderer. Treat every renderer-provided path, URL, token, environment, file list, and metadata object as untrusted input. Validate expected types and ranges in the main process, restrict writable paths, and apply an allowlist to network destinations where possible.

Avoid registering overly broad IPC routes when a narrow operation can perform the same job. The main process has capabilities that the renderer should not receive directly.

### Data handling

Use least-privilege file access. Keep user cache separate from downloadable builds, do not store session credentials in the Wrapped cache, and ensure temporary download files are removed safely after an error or cancellation. Explain clearly which files an update may overwrite or delete.

### Responsible use

Only run the app with software, builds, accounts, and services you are authorized to use. Do not upload proprietary game files or personal credentials to public issues. This documentation is not a promise that a given binary is safe, official, or accepted by a third-party service.

## Known limitations and implementation status

This section is especially important because the UI and the main process may expose calls whose complete behavior is not implemented in the same revision.

### Confirmed limitations

1. **PAK disabling is a stub.** The current `disablePaks()` function logs the requested file list without performing the disabling operation.
2. **Native launch support is platform-sensitive.** The checked-in addon is a compiled binary, and the path conventions target a Windows game executable.
3. **Development scripts are absent from the current package file.** The checked-in `package.json` does not declare standard start, development, build, or native-rebuild scripts.
4. **Authentication is only partially established by inspection.** The callback forwards an authorization code, but the complete end-to-end login flow cannot be guaranteed from that code alone.
5. **Downloads depend on runtime metadata.** The repository does not guarantee that referenced servers, manifests, files, or APIs are available.
6. **The client DLL downloader disables TLS certificate verification.** This is a security weakness that should be fixed and covered by tests.
7. **The code is largely bundled.** The absence of original source and build configuration makes changes harder to review, test, and reproduce.
8. **A process-start event does not prove full game initialization.** The current launch flow should not be treated as a complete end-to-end health check.
9. **The VCRedist check is not an installer.** It checks the Windows registry and returns a result; it does not repair a missing runtime.
10. **Hash algorithms have different guarantees.** Some profiler values are lightweight comparison fingerprints rather than full-file cryptographic integrity hashes.

### Features that depend on external configuration

- Server-side build metadata and download manifests.
- Client DLL locations and valid environment-specific files.
- Account authentication and the service-side callback registration.
- Application update metadata and release publishing.
- Discord application/RPC availability.
- Sentry configuration and data-handling policy.

These integrations should be tested against authorized test endpoints where possible. A failed external dependency should lead to a clear, isolated error rather than making the application appear to have completed a task it did not complete.

## Recommended development roadmap

The following items are recommendations for future work, not claims that the tasks are already done.

### Priority 1 — Reliability and trust

- Restore normal HTTPS certificate verification in client downloads.
- Validate remote manifests before using any file paths or delete instructions.
- Add trusted checksum/signature verification for downloaded files.
- Validate all renderer-supplied IPC arguments in the main process.
- Ensure cancellation closes workers, network streams, and file handles.
- Avoid reporting successful launch until the relevant success condition has actually been observed.
- Remove or review hard-coded environment-specific launch values.
- Document the exact purpose and policy constraints of launch arguments.

### Priority 2 — Complete the visible feature set

- Implement PAK management only if it is a legitimate project requirement, with explicit previews, reversible operations, and tests.
- Add integration tests for start, close, force-quit, error, and duplicate-launch scenarios.
- Define explicit download states for queued, active, verifying, complete, cancelled, and failed operations.
- Add recovery for interrupted content updates and partial files.
- Test the client download flow with HTTP failures, redirects, truncated responses, and insufficient disk space.
- Test authentication errors separately from successful callback receipt.
- Provide an actionable error message for each missing runtime or native dependency.

### Priority 3 — Recover a maintainable source tree

- Add the original React/TypeScript source, where available.
- Add repeatable renderer and main-process build scripts.
- Pin or document supported Node.js, Electron, and native-addon versions.
- Separate launch orchestration, profiler, updater, downloads, integrations, and window management into focused modules.
- Add tests for path validation, manifest parsing, hashes, retries, cache storage, and IPC validation.
- Generate renderer assets from source rather than editing hashed bundles by hand.
- Add a clean development setup guide that can be followed from a fresh checkout.

### Priority 4 — Packaging and documentation

- Document supported operating systems explicitly.
- Build native modules for each supported target rather than reusing an incompatible binary.
- Verify packaged-resource paths and update behavior for each distribution format.
- Add a release checklist that includes security review and a clean test installation.
- Provide screenshots or a short overview of the UI if project maintainers have permission to publish them.
- Track known issues and fixed versions in release notes.

## Contributing

Contributions should improve correctness, reliability, clarity, or maintainability without claiming features that are not implemented. Before submitting a change:

1. Read the relevant section of this README and inspect the actual code path.
2. Keep changes focused, and avoid unrelated rewrites of generated assets.
3. Validate file paths, external URLs, and IPC payloads.
4. Test normal completion and at least one failure path.
5. Document any new limitations, platform assumptions, or service configuration.
6. Remove secrets and personal data from test fixtures and logs.
7. Explain which platform and runtime were used during testing.

For changes to the downloader or content updater, use a disposable test directory and a test manifest. For changes to the launch manager, test process errors and unexpected exit behavior in an authorized environment. Do not test anti-cheat-related behavior against services without explicit authorization.

## Reporting a bug

Create a report that makes the problem reproducible while avoiding exposure of private data. Include:

- A short, specific summary.
- The exact sequence of actions that caused the problem.
- The application version and commit or release tested.
- Operating system and CPU architecture.
- Node.js, npm, Electron, and native-addon versions where relevant.
- The selected build identifier or version, without publishing proprietary files.
- Sanitized log lines and the exact error message.
- Whether the issue happens every time or only intermittently.
- What you expected to happen and what happened instead.
- Any workaround already tried.

Do **not** include passwords, refresh tokens, authorization codes, cookies, private signed URLs, session files, or full proprietary game builds. If a secret is exposed accidentally, revoke it and create a sanitized report.

## Frequently asked questions

### Is every feature described here guaranteed to work?

No. The README separates visible code paths from confirmed limitations. Full validation would require running the application in a supported environment against valid service metadata and compatible local files.

### Why is the PAK-disable operation listed if it does not work?

The bridge and profiler expose the operation, but the current implementation only logs the request. It is documented so users do not mistake a UI control or IPC channel for a completed feature.

### Can I launch the game natively on Linux with these files?

The repository contains Windows-specific game paths, a Windows helper, and a compiled native addon. Electron can run on several operating systems, but the checked-in files do not demonstrate a supported Linux-native game launcher. A real port would require compatible native code and platform-specific testing.

### Why does npm not have a start command?

The current checked-in package metadata does not declare a start script. Use `npm run` to inspect available scripts. The full development tooling may be missing from this bundled repository snapshot.

### Does a successful download prove that the files are safe?

No. Download completion only indicates that the download operation reached its completion path. Authenticity and integrity require a trustworthy source and verification, and the disabled TLS validation in the client DLL path must be corrected before security-sensitive use.

### Does a launch result prove the game is playable?

Not necessarily. The operating system may create the process even if the game later exits or fails initialization. The launch path, the game process state, and any service-side authentication or compatibility result should be considered separately.

### Where are cached reports stored?

The application stores Wrapped report and accolade JSON files beneath a subdirectory of Electron's app-specific user-data directory. That cache is local convenience data, not an authoritative account database.

### Is the project safe because it is on GitHub?

No. A public repository can help people review source, but it does not independently certify the safety of compiled executables, native modules, remote download endpoints, or application behavior. Inspect and test the exact revision and binaries you intend to run.


## Deep-dive: how to maintain the launcher as a dependable desktop product

This chapter expands the operational documentation with implementation expectations, failure handling, data-flow guidance, and maintainership practices. It is intended to help contributors understand what a reliable launcher should guarantee. Recommendations below are not claims that the current bundled revision already satisfies every requirement.

### 1. User action to completed operation

Every action in the interface should have a traceable path from the control the user activates to the operation that actually runs. For example, a "Download" control should validate the selected build, create a request, pass that request through the preload bridge, start the download worker, receive progress events, verify the files, and finally show a terminal status. If any stage fails, the interface should report the stage that failed instead of leaving a spinner active forever.

This principle is equally important for launching. A click should not immediately become a "Game running" state. The UI should first show that the request was accepted, then that the path was checked, then that process creation succeeded, and finally that the process remains alive. If the application cannot reliably observe a later game initialization stage, the UI should say "Process started" rather than claiming "Game ready."

The same rule applies to update checks, authentication callbacks, client downloads, cache refreshes, and application updates. The user-facing status should correspond to the strongest state the code has actually verified.

### 2. Recommended operation state model

A long-running operation benefits from a small explicit state model. One recommended pattern is:

- `idle`: no operation is active.
- `validating`: input, destination, manifest, or build metadata is being checked.
- `queued`: the request is accepted and waiting for a worker.
- `running`: active work is in progress.
- `verifying`: transferred data or operation results are being checked.
- `completed`: the expected completion criteria have passed.
- `cancelled`: the user or application intentionally stopped the operation.
- `failed`: an error prevented completion.

The state model should reject impossible transitions. A cancelled operation must not later be overwritten by a delayed progress event that marks it as completed. A failure should not silently return to running unless an explicit retry creates a new attempt. A second launch request should be handled deliberately: either rejected with a clear message or queued according to documented behavior.

### 3. Progress reporting that users can trust

Progress bars should communicate the type of progress being measured. Network bytes received, files completed, integrity verification, and finalization are different measures. A progress bar reaching 100% of bytes does not mean all files have been verified or promoted into their final paths.

If the total size is unknown, show indeterminate progress rather than fabricating a percentage. If one file is retried, avoid moving the progress indicator backwards without explanation. If cancellation occurs, immediately stop presenting the task as active while the underlying worker performs safe cleanup.

For multi-file operations, report both overall progress and the current file when that information is available. Avoid emitting an IPC event for every tiny byte chunk if it overwhelms the renderer; progress can be throttled while preserving meaningful updates.

### 4. Logging levels and correlation IDs

Logs should distinguish routine diagnostics from warnings and failures. A practical set of levels is debug, info, warn, and error. Debug logs can include detailed state transitions during development; info logs can record operation start and finish; warnings can identify recoverable problems; errors should include enough context to understand why an operation failed.

For complex workflows, a correlation ID helps connect the initial request to worker messages, retries, verification, and the final result. The ID should be random or otherwise non-sensitive and should not contain a token, username, or account secret. When a user submits a sanitized log, maintainers can follow a single operation without requiring the user's entire log history.

Never log authorization headers, passwords, cookies, raw session tokens, or full callback URLs containing codes. Scrub sensitive query parameters before recording URLs. Prefer stable error codes and sanitized relative paths over raw server responses or absolute user paths.

### 5. Timeout and retry policy

Every network operation should have a defined timeout or cancellation mechanism. Without one, an unavailable endpoint can leave a UI action active indefinitely. Timeouts should be selected based on the operation: a small metadata request and a large file transfer should not necessarily share the same deadline.

Retries should be limited and should use a backoff policy for transient failures. They should not automatically retry malformed data, a permanent authorization error, a missing file, an invalid certificate, or a rejected manifest. When the retry budget is exhausted, return a clear failure result and preserve diagnostic context.

The retry policy should also consider shutdown. Closing the application should stop scheduled retries, close active streams, and wait only as long as is reasonable for cleanup. A background retry should never unexpectedly restart a user-cancelled operation.

### 6. Filesystem changes as transactions

Operations that create, replace, or delete files should make their effects predictable. A safer update design downloads to a temporary file, validates its size and digest, then atomically renames it into place where the platform supports that operation. If validation fails, the previous good file should remain intact.

For updates that affect many files, consider a transaction journal that records which files were prepared, replaced, or deleted. If the process crashes, the next startup can detect an incomplete transaction and offer recovery rather than guessing whether the build is valid. Destructive changes should be logged with relative paths and should not cross the selected build root.

A rollback mechanism should be tested, not merely described. If a rollback is impossible for a particular operation, explain that limitation before the user starts it and recommend a backup.

### 7. Manifest validation checklist

Before acting on a manifest, validate the structure and meaning of every entry:

1. Confirm the manifest comes from the configured, trusted source.
2. Confirm the document has the expected schema version.
3. Reject missing or wrongly typed fields.
4. Normalize and validate every filename.
5. Reject absolute paths and parent-directory traversal.
6. Check that each URL uses an allowed scheme and trusted host.
7. Enforce reasonable file-size and total-download limits.
8. Reject duplicate or conflicting operations for the same destination.
9. Require a trusted digest for files where integrity verification is expected.
10. Treat delete instructions as destructive operations that require strict path confinement.
11. Verify the final file after download.
12. Record the manifest version or digest used for the operation.

The current code expects structured manifest information, but this list describes the stronger validation that a production updater should enforce.

### 8. Launch diagnostics checklist

When the launch flow fails, collect evidence in a consistent order:

1. Confirm the selected build directory is the intended directory.
2. Confirm the expected executable exists at the path the launcher constructs.
3. Confirm the executable and required files are readable.
4. Confirm the native addon loaded successfully and matches the current runtime.
5. Confirm required operating-system dependencies are present.
6. Confirm the environment and build metadata are valid.
7. Record whether process creation returned an error or a process identifier.
8. Record whether the process stayed alive or exited immediately.
9. Inspect sanitized application logs and any game-generated logs available to the user.
10. Reproduce the problem with a disposable, authorized test build when possible.

Do not skip directly to disabling security software, changing anti-cheat settings, or replacing native binaries. Such workarounds can hide the real problem and may violate the rules of the service being used.

### 9. Native module compatibility

A compiled Node.js addon is coupled to more than its filename. Compatibility may depend on the operating system, CPU architecture, Electron version, Node ABI, C/C++ runtime, external libraries, and build flags. Packaging a Windows addon inside a Linux application does not make it a Linux addon, and copying a module from an unrelated Electron release may produce a load error or unstable behavior.

A maintainable release pipeline should record the toolchain and target for each native binary. Where possible, build from reviewed source in a reproducible environment. Store checksums for release artifacts and ensure that the packaged application loads the intended binary path. If a native feature is unavailable, the application should disable only the dependent feature and explain why.

### 10. Cross-platform support boundaries

A framework may support multiple operating systems while a particular application feature remains platform-specific. Electron's availability on Linux, Windows, and macOS does not establish that every helper executable, registry query, process argument, filesystem assumption, or native addon works on all of them.

For each supported platform, maintain a clear compatibility table with tested operating system versions, architectures, Electron versions, native module availability, and known restrictions. If Linux is not supported for game launching in the current revision, say so directly instead of implying that a successful window launch proves full compatibility.

A genuine port should separate platform-specific operations behind a clear interface and implement each target independently. It should also test path separators, permissions, process lifecycle, packaging paths, and shutdown behavior on the target operating system.

### 11. Authentication flow observability

Authentication consists of multiple independent stages: the user starts the login flow, the browser or service handles the request, a callback is sent to the custom protocol, the running app receives the callback, the renderer is notified, the authorization code is exchanged through the expected service flow, and the resulting session is validated. A callback being received proves only that the callback stage was reached.

The app should provide different diagnostics for callback registration errors, missing callback parameters, service rejection, expired codes, network failures, and session restoration failures. Do not print authorization codes in logs to make debugging easier. Test authentication with dedicated accounts and environments approved for development, not with credentials copied from another person.

### 12. Application updates and rollback

An application updater should verify that release metadata matches the intended product and platform, download artifacts from the expected source, and handle interrupted updates without leaving the installation unusable. Users should be able to distinguish "update available," "downloading," "downloaded," "installing," "restart required," and "updated successfully."

A failed updater request should not be reported as a successful update. For a packaged app, verify that the updater configuration matches the distribution method and that the application has permission to write to its installation location. When an update changes the cache schema or native modules, document migration and rollback behavior.

### 13. Accessibility and usability

A desktop launcher should remain understandable without relying only on color, animation, or tiny status text. Controls should have meaningful labels, keyboard navigation should be predictable, errors should be announced clearly, and progress should have text alternatives. Long operations need a clear cancel action where cancellation is safe, and destructive operations should explain what they will change.

The renderer includes UI libraries that can support accessible components, but accessibility still depends on how the components are composed and labeled. Test keyboard-only navigation, high-DPI scaling, reduced-motion preferences where practical, long build names, narrow windows, and error messages that wrap across multiple lines.

### 14. Performance and resource usage

Large build scans and downloads should not block the renderer. File hashing can be CPU- and disk-intensive, especially for large folders. Workers should have a bounded concurrency level and should avoid opening too many files at once. Excessive concurrency may reduce throughput on slower disks or cause resource exhaustion.

Measure performance with representative test data rather than choosing arbitrary worker counts. Track elapsed time, bytes processed, file counts, and peak memory where practical. Avoid sending large arrays of profiler results repeatedly through IPC when a compact summary or paginated result would suffice.

The UI should remain responsive while work proceeds. If a scan can take several minutes, provide status updates and a safe cancellation path. If a worker fails, report which files were not inspected rather than silently treating partial results as a complete scan.

### 15. Dependency and supply-chain maintenance

The dependency manifest is part of the application's security and reproducibility story. Maintain a lockfile when appropriate, review dependency updates, and test native modules after changing Electron or Node versions. Avoid installing packages merely to silence an error without understanding why the package is required.

Release automation should avoid pulling unpinned code at packaging time. Document the toolchain, preserve build logs, and verify the artifacts that are actually shipped. A dependency being popular or available from a package registry is not a guarantee that a particular version is safe or compatible.

### 16. Documentation standards for future features

Every new feature should document five things: purpose, entry point, inputs, outputs, and failure behavior. If it modifies files, state which files may change and whether a backup is recommended. If it uses a remote service, document the configuration requirements and the expected response shape without publishing secrets. If it is platform-specific, list the supported platforms.

A feature should not be described as complete merely because a button, IPC route, or function name exists. Prefer labels such as "implemented but unverified," "verified on Windows," "stub," or "planned" when those distinctions are relevant. Update the feature matrix when the implementation changes.

### 17. Extended QA scenarios

The following scenarios can be used to build a repeatable test suite:

- Start the application with a clean user-data directory.
- Start the application when the renderer cache is already populated.
- Start two instances and confirm the single-instance behavior.
- Deliver a malformed deep link and confirm that no secret is logged.
- Attempt a launch with a nonexistent directory.
- Attempt a launch with the executable missing.
- Attempt a launch with a native addon that cannot be loaded.
- Launch a disposable test process that exits immediately.
- Start a small download and cancel it midway.
- Simulate a network timeout during a metadata request.
- Simulate a truncated file response.
- Provide a manifest with an invalid digest.
- Provide a manifest with a path traversal attempt.
- Provide a manifest containing duplicate destination entries.
- Simulate a disk-full error while writing a file.
- Interrupt an update between download and final rename.
- Read a corrupt JSON cache.
- Run without Discord available.
- Run while telemetry endpoints are unavailable.
- Test update metadata for the wrong platform.
- Confirm that all terminal states clear progress indicators and listeners.

Each scenario should define expected logs, expected UI state, filesystem effects, and whether the operation can be safely retried. Automated tests should use small fixtures and mocked services where possible.

### 18. Definition of done

A change is ready to merge when the implementation, error handling, documentation, and tests agree. A practical definition of done includes:

- The intended behavior is described and reviewable.
- Inputs are validated at the privileged boundary.
- Failure cases have useful, non-sensitive diagnostics.
- Long-running work has a terminal state and cleanup path.
- File operations stay within the intended directory.
- Tests cover the main success path and important failure cases.
- Platform assumptions are explicit.
- No credentials or private user data are committed.
- The README describes the actual behavior rather than an aspirational version.
- Any known limitation introduced by the change is documented.

This standard reduces the chance that the application appears functional in the happy path while leaving users with corrupted builds, stuck progress indicators, unclear launch failures, or leaked diagnostic data.



## Code-level audit: additional findings from the checked-in implementation

This audit section goes beyond the feature overview and records noteworthy behavior visible in the bundled main process, preload bridge, and disk-writing worker. It is a static code review, not a dynamic security assessment. A finding indicates that a code pattern exists in this revision; runtime behavior can still depend on timing, Node/Electron versions, operating system, server responses, and files present on disk.

### Severity and scope

| Area | Observation | Why it matters |
| --- | --- | --- |
| Client DLL download | HTTPS certificate validation is disabled in the request options | The server identity is not properly verified by that request, increasing interception risk |
| Authentication callback | The callback code is written to console output | Authorization codes are sensitive, and logs may be shared or uploaded |
| Content update | Manifest-provided names are joined to a local PAK directory without an evident containment check in this function | A malformed or untrusted manifest could resolve paths outside the intended directory |
| Content update resume | Existing file size is used to request a byte range; response handling accepts both 200 and 206 while appending when a partial file exists | A server that ignores the range request may cause duplicate bytes to be appended |
| Native launch result | Some missing-dependency branches still call the callback used for the “injected” result | The UI can receive a positive-looking event even when the native operation did not occur |
| Process lifecycle | Both `exit` and `close` handlers call the same close callback | The renderer may receive duplicate game-close notifications |
| Launch diagnostics | Child process stdio is configured as ignored | Errors emitted by the child process are not captured through those pipes by this code path |
| Disk writer | Allocation catches its own error, after which the message handler can still send a completed response with `verified: true` | A completion response should not be interpreted as proof that allocation succeeded |
| Disk writer | A write task reports `verified: true` immediately after the write; byte verification is a distinct message type | Writing and verifying should be represented as distinct states |
| Runtime check | The Visual C++ check returns true on non-Windows systems because the Windows-specific check is skipped | A true result on Linux/macOS should not be interpreted as proof of a Windows runtime installation |
| External browser | The main-process handler forwards a renderer-provided URL to `shell.openExternal` without an obvious allowlist at that handler | External URL schemes should be validated before opening them |
| Package metadata | The current package file does not contain the normal start/build scripts | A reproducible developer workflow cannot be inferred from the package manifest alone |

The purpose of documenting these findings is to make future fixes and tests easier to prioritize. The README does not provide instructions for bypassing anti-cheat systems or exploiting malformed manifests.

### Launch callback semantics need improvement

The launch manager is expected to report whether a launch-related operation succeeded. In this revision, branches that detect a missing native injector or a missing client DLL still invoke the callback named for the injection result. This makes the callback ambiguous: a renderer might receive the same event whether injection occurred or whether it was skipped because a dependency was absent.

A better contract would return a structured result with explicit fields such as a status code, a user-safe message, and an optional diagnostic identifier. For example, a result should distinguish “process spawned,” “native module unavailable,” “client DLL missing,” “injection failed,” and “process exited.” Each result should be based on an actual check, not simply on reaching the end of a callback branch.

This section describes a correctness problem, not a replacement implementation for the injection logic. The safest next step is to define unambiguous launch-result semantics and test them in an authorized environment.

### Process exit events should be idempotent

The launch path attaches handlers to both the child process's `exit` event and its `close` event, and both paths call the close callback. Those events represent different process/stdio lifecycle moments and can both occur for one process. A consumer should not assume the callback runs exactly once.

A robust state machine should make the transition out of “running” idempotent. The first valid terminal event can mark the session as ended; later related events should enrich the diagnostic record without sending a second user-visible terminal notification. Tests should confirm that one launched process leads to one final close state, even if more than one low-level event fires.

### The launch result is not an independent health check

The launch handler records build metadata and then invokes the launcher. The launch manager may be able to observe process creation, a process ID, and termination; those are useful observations, but they do not demonstrate that a complete game session initialized or that a service accepted the session. The README should not equate DLL-related callbacks, process creation, or a missing exception with a validated playable session.

For ordinary diagnostic purposes, maintainers should label the state that was actually observed. If a later initialization signal is not available, state that limitation rather than inferring success from process creation.

### Command-line arguments and sensitive values

The launch code assembles command-line arguments and includes values derived from the supplied launch token, as well as a hard-coded launcher token and flags that affect game startup behavior. Command-line arguments can sometimes be inspected by local diagnostic tools and may appear in crash reports or process listings. Credentials should not be placed in command-line arguments when a safer supported transport is available.

The hard-coded launch configuration should be reviewed by the maintainers, especially any static token-like value and any argument that disables or changes an anti-cheat-related behavior. This README deliberately does not reproduce those values or describe how to use them. Do not use the launcher to bypass anti-cheat controls or to access a service outside its rules. A future safe design should remove embedded secrets, use supported authentication flows, and avoid claiming support for unsupported or prohibited launch configurations.

### The credentials field is passed but not consumed by the shown launch function

The IPC handler calls the launch function with a credentials property, but the visible launch function destructures only the build path, token, environment, and callbacks. The credentials property is not used by that function body. This may be legacy API shape or an incomplete flow; the checked-in code does not establish that the credentials object affects process creation.

If a value is part of a public API but unused, maintainers should either connect it to a documented, authorized workflow or remove it from the contract after checking all renderer callers. Leaving unused authentication parameters in the interface can confuse debugging and lead users to believe that a value is being applied when it is not.

### Native-module failures must not be reported as success

Loading the native addon is attempted during module initialization. If loading fails, the error is logged and the application can continue to initialize. Continuing with a reduced set of features can be a reasonable design, but dependent actions must be visibly disabled or return explicit unavailable errors.

The current launch path's callback behavior makes this distinction particularly important. The UI should not receive a success-looking result just because the application handled the failure without throwing. A clear dependency status, a structured error result, and a test for the missing-module case would make support substantially more reliable.

### Child-process diagnostics are limited

The game process is spawned with its standard input, standard output, and standard error ignored. That may avoid mixing the game's console output with the launcher's output, but it also means the launch manager is not reading the child's output from those streams. Debugging a process that exits immediately therefore requires other diagnostic sources.

The application should log the exit code and distinguish process-creation errors from post-start exits. If a supported development workflow can safely capture diagnostics, it should redact secrets and avoid storing unbounded output. A missing process identifier, a synchronous spawn failure, and a normal process exit are different failure classes and should be presented separately.

### Client DLL download behavior

The client downloader chooses a filename based on the requested environment and writes the response to a file beneath the app-specific user-data directory. It reports progress when response data arrives and resolves after the output stream finishes. The visible implementation has several behaviors maintainers should review:

- Certificate validation is explicitly disabled on its HTTPS requests.
- Redirect handling is limited to the first redirect response; nested redirect responses are not handled as a complete redirect chain.
- The output stream is closed when the first request receives a redirect, yet the redirected request is passed into a handler that writes to the same stream object. That is a likely failure path for redirects and should be tested before relying on redirected URLs.
- The downloader accepts a URL supplied to the operation, so the caller and main-process boundary should restrict it to the expected trusted host(s).
- The code reports the response content length for the completed result; that value can be zero or missing when the server does not provide the header, and it is not a cryptographic integrity check.
- The downloaded file is written to its final environment-specific filename, rather than being described as a verified temporary artifact promoted after integrity validation.

These are maintenance concerns to investigate. Client files should only be accepted after certificate verification, redirect checks, response-length checks where applicable, and a trusted checksum or signature verification. A failed or untrusted download must not silently replace a previously valid client file.

### Content-update resume behavior

The content-update worker checks whether a target file already exists and records its size as a potential partial-download offset. When the size is between zero and the expected size, it requests a byte range and appends received chunks to the existing file. The response handling accepts HTTP 200 or 206. If a server ignores a range request and returns the complete file with HTTP 200, appending that response to a partial file can produce a corrupted result.

A reliable resumable downloader should inspect the response status and range headers, confirm that the returned range starts at the requested byte offset, and restart from zero if the server does not support the requested range. It should also verify the final size and digest before reporting completion. These checks are especially important after interruptions or when a CDN changes behavior.

The existing content updater retries failed operations and records file progress, which is useful infrastructure. However, retry behavior should not substitute for strict response validation or final-file verification.

### Manifest file names and filesystem containment

The content updater constructs a local destination by joining the chosen build path, the Fortnite content directory, and the manifest's change name. In the visible function, that path is then used for file-existence checks, hash comparisons, deletion, or file download. The function does not show an explicit check that the resolved target remains below the intended PAK directory.

The correct security boundary is the resolved destination, not simply the fact that a string was concatenated with a known directory. Before any file operation, an updater should normalize the target and verify that it remains inside the expected root. It should reject absolute names, path separators or parent-directory traversal that are not part of the documented manifest format, and conflicting entries. Deletion instructions require the same checks as downloads.

Use only manifests from a trusted source. This README does not include a malicious manifest example or instructions to exploit this risk; the finding is included so maintainers can fix the validation gap and write a regression test.

### Manifest retry policy and observability

The manifest helper is configured for ten retries in addition to the initial request, meaning a failure can result in as many as eleven attempts. It applies request timeouts to headers and response body, logs failed attempts, and uses a capped increasing delay between attempts. This can help with temporary service errors, but it can also make a permanent failure take a noticeable amount of time before the UI receives a final result.

The function logs the manifest URL. If a URL ever contains a signed query parameter or other secret, that value could be copied into logs or remote diagnostics. Prefer logging the host and a sanitized path, with sensitive query parameters removed. The renderer should display that the updater is retrying and provide a cancellation path for long operations.

Retries should be differentiated by failure class. Invalid JSON, an unsupported schema, or an unsafe path should fail validation rather than being retried as though it were a transient network outage.

### Hash semantics differ across subsystems

The profiler exposes more than one type of digest. One value is computed from the filename and file size, another uses a limited region of the file plus name and size, and a separate operation computes MD5 over the full contents of the shipping executable. The disk-writing worker also uses MD5 to validate the bytes for a requested chunk.

These values are not interchangeable. A digest of filename and size does not inspect file contents; a hash of a portion of a file is not a complete file digest; a per-chunk digest verifies only the requested chunk; and a whole-file digest covers a different input. A reference value can only be compared meaningfully with a digest generated from the same algorithm and input convention.

For integrity-sensitive downloads, use a clearly documented full-file cryptographic digest or a trusted signature. If an existing server protocol requires a legacy fingerprint, label it accurately and do not present it as a security guarantee. Document the algorithm, exact bytes included, encoding, letter case, and expected value format for every hash field.

## Disk writer worker: detailed behavior

The checked-in `app/workers/diskWriterWorker.js` uses Node's worker-thread messaging API and synchronous filesystem calls. The worker maintains a map of open file descriptors, opens existing files for read/write, creates parent directories when necessary, and can prepare a target file to a declared size.

### Message types visible in the worker

| Message type | Visible behavior | Important note |
| --- | --- | --- |
| `allocate` | Prepares a file and sends a completion message | The allocation helper catches errors internally, so a later completion message is not proof of successful allocation |
| `write` | Writes a supplied byte buffer at a specified offset | The returned `verified` field is set as part of the write path without a byte-level verification in that branch |
| `verify` | Reads the requested region and compares an MD5 digest with an expected digest | Verifies a region, not automatically the entire file |
| `shutdown` | Attempts to synchronize and close open file descriptors | Shutdown should be tested while writes are pending |

The worker sends a `ready` message after initializing its listener. For writes, it checks that the requested operation has a task object and verifies that the synchronous write reports the expected number of bytes written. Errors are logged and, when a task is available, an error response is returned with file and chunk indices.

### File allocation and existing files

The allocation helper checks whether a destination already exists. If the existing file size matches the requested size, it returns without recreating it. If a non-empty file has a different size, it opens the file for read/write and returns rather than always truncating it. Otherwise it creates or truncates the target and attempts to set its size.

This behavior can be useful in a chunked/resumable downloader, but the caller must know whether the existing bytes are valid. Matching size is not proof of matching content, and a non-empty partial file should not be treated as complete without verification. The allocation helper logs failures instead of propagating every error to the message handler, which makes a separate, explicit result contract particularly important.

### Chunk writes and synchronization

The worker writes data at the byte offset supplied with each task, allowing different chunks of a file to be placed in their intended positions. It records write activity and synchronizes open descriptors based on a batch count or elapsed time. On shutdown, it tries to force synchronization before closing its open descriptors.

Synchronous filesystem methods make the worker's control flow easier to follow, but they still occupy the worker thread while each operation runs. The worker should not be given unbounded numbers of tiny tasks, and callers should wait for completion messages before scheduling conflicting work for the same file. An incomplete write or failed sync should be surfaced as an operation failure rather than only appearing in console logs.

### Chunk verification

The verification method reads a region defined by an offset and size, confirms that the requested number of bytes were read, calculates an MD5 digest for those bytes, and compares it with the supplied expected digest. A false result indicates the region did not match or could not be read. A true result proves only that this particular region matched the expected digest at the time of the check.

MD5 is used here as a compatibility checksum, not a modern authenticity mechanism. The expected digest must itself come from a trustworthy source. The parent process should distinguish allocation completion, write completion, and verified completion rather than presenting all three as the same state.

### Worker shutdown and resource cleanup

Open file descriptors consume operating-system resources. The worker's shutdown path attempts to synchronize and close descriptors, and a periodic timer also invokes synchronization logic. Test this shutdown path with multiple open files, with files that are not writable, and after a write error. A worker should stop accepting new work after shutdown begins, flush or explicitly abandon queued work according to policy, close every descriptor, and notify the parent process when cleanup has completed.

If the parent process loses a worker unexpectedly, it should not assume in-flight chunks completed. A recovery process should compare the on-disk state with the manifest and re-verify any chunks whose completion state is uncertain.

## User-data, cache, and file ownership

Electron provides an application-specific user-data directory intended for persistent app data. This repository uses it for downloaded environment-specific client DLLs and a local Wrapped cache. That data should be treated separately from the game build folder and from temporary worker files.

### Suggested ownership boundaries

| Data category | Recommended handling |
| --- | --- |
| Application settings | Store only settings that are necessary and safe to persist |
| Wrapped report cache | Treat as disposable cached data and validate the JSON schema when reading |
| Client DLLs | Store only trusted, verified files; do not trust the filename alone |
| Build downloads | Keep under an explicitly chosen build root and verify before marking complete |
| Temporary files | Name and track them clearly, then remove or recover them after interruption |
| Logs | Redact authorization codes, tokens, sensitive URLs, and unnecessary personal paths |
| Native modules | Package only expected, reviewed binaries matched to the target platform and runtime |

The application should avoid mixing credentials with cached reports or build metadata. When adding a feature that persists data, describe its location, retention policy, format, migration behavior, and whether a reset or cleanup action is safe.

## IPC/API catalogue for maintainers

The following catalogue is based on names in `app/preload.js`. It should be used as a quick navigation aid. The main process may impose additional behavior, and the existence of an exposed method does not guarantee a successful operation.

| Exposed method | Channel or mechanism | Data or result pattern |
| --- | --- | --- |
| `getVersion()` | Synchronous `app/version` | Returns the app version through the main process |
| `maximize()` | `app/maximize` | Requests maximize/unmaximize |
| `minimize()` | `app/minimize` | Requests minimization |
| `close()` | `app/close` | Requests app shutdown |
| `openBrowser(url)` | `open:browser` | Asks the OS to open a URL; validate schemes at the main boundary |
| `authV3Callback(fn)` | `auth:callback` event | Registers a callback listener; code values are sensitive |
| `onToggleTitlebar(fn)` | `toggle-titlebar` event | Receives whether the custom title bar should be shown after full-screen transitions |
| `openDirectory()` | `library:open-directory` | Opens a directory picker |
| `handleOpenedDirectory(fn)` | `library:directory-selected` event | Receives the selected directory path |
| `shippingHash(path)` | `library:get-hash` | Requests a hash for the shipping executable |
| `handleShippingHash(fn)` | `library:hash-result` event | Receives the hash result or `null` |
| `openPath(path)` | `library:open-path` | Asks the OS to open a path |
| `openLogs()` | `library:open-logs` | Opens the app's user-data/log location |
| `selectDownloadPath()` | `download:select-path` | Resolves with a selected folder or cancellation result |
| `startDownload(payload)` | `download:start` | Sends a build download request |
| `cancelDownload()` | `download:cancel` | Requests cancellation |
| `onDownloadProgress(fn)` | `download:progress` event | Registers a progress listener |
| `checkVCRedist()` | `vcredist:check` | Resolves to the main-process runtime-check result |
| `cacheWrappedReport(id, data)` | `wrapped:cache-report` | Stores report JSON and returns a success flag |
| `getCachedWrappedReport(id)` | `wrapped:get-cached-report` | Returns parsed report data or a missing/error result |
| `cacheWrappedAccolades(data)` | `wrapped:cache-accolades` | Stores accolades data |
| `getCachedWrappedAccolades()` | `wrapped:get-cached-accolades` | Returns parsed data or a missing/error result |
| `sentrySetUser(...)` | `sentry:set-user` | Updates diagnostic context; consider privacy implications |
| `sentryClearUser()` | `sentry:clear-user` | Clears diagnostic user context |
| `launch(...)` | `launcher:launch` | Sends build path, token, environment, credentials, and build metadata |
| `onLaunched(fn)` | `launcher:launch:result` event | Receives the launch-related notification |
| `onGameClose(fn)` | `game:close` event | Receives the process-close notification |
| `analyzePaks(path, id)` | `profiler:analyze` | Requests build-file analysis |
| `onAnalyzeResult(fn)` | `profiler:analyze:result` event | Receives analysis rows |
| `clientFingerprint(env)` | `client:fingerprint` | Returns a digest or a missing/error marker |
| `disablePaks(path, files)` | `paks:disable` | Currently reaches a stub that logs the file list |
| `discord(data)` | `discord:presence` | Sends an activity payload to the RPC handler |
| `checkForContentUpdate(url, path, id)` | `content-update:check` | Requests manifest processing and returns the handler result |
| `onContentUpdateProgress(fn)` | `content-update:progress` event | Registers a listener and returns an unsubscribe function |
| `forceQuitGame()` | `launcher:force-quit` | Requests termination of the tracked game process |
| `downloadClient(url, env)` | `download:client` invoke | Requests an environment-specific client download |
| `onClientDownloadProgress(fn)` | `download:client:progress` event | Receives download percentage updates |
| `invoke(channel, ...args)` | Generic invoke | Calls a main-process handler by channel name |
| `send(channel, ...args)` | Generic send | Sends an IPC message by channel name |
| `on(channel, fn)` | Generic event subscription | Registers a listener and returns an unsubscribe function |

`window.electron` and `window.electronAPI` are aliases for this same object. The table above lists the named preload methods. The main process also registers the following application-owned request channels; `send` channels are event-style requests, while `handle` channels return a promise result:

| Main-process request channel | IPC style | Purpose / result |
| --- | --- | --- |
| `app/version` | `sendSync` | Returns the Electron app version synchronously. |
| `app/minimize`, `app/maximize`, `app/close` | `send` | Control or close the main window/application. |
| `open:browser` | `send` | Passes a URL to Electron's external browser handler. |
| `library:open-directory`, `library:get-hash`, `library:open-path`, `library:open-logs` | `send` | Select a directory, hash the expected Fortnite shipping executable, open a path, or open the app user-data folder. |
| `download:select-path` | `handle` | Opens a folder picker; returns the path or `null` if cancelled. |
| `download:start`, `download:cancel` | `send` | Starts or cancels a build download. Results arrive through download events. |
| `vcredist:check` | `handle` | Checks a Windows Visual C++ runtime registry entry; returns a boolean. |
| `update:check` | `handle` | Requests an application update check and returns the updater result or an error. |
| `update:install` | `send` | Asks `electron-updater` to install a downloaded update and restart. |
| `launcher:launch`, `launcher:force-quit` | `send` | Starts the configured Fortnite executable with launch arguments/token or kills the tracked game process. |
| `profiler:analyze` | `send` | Scans the build's PAK/plugin folders and emits analysis rows. |
| `client:fingerprint`, `paks:disable` | `handle` | Returns the local client DLL digest, or calls the PAK-disable stub and returns a boolean. |
| `content-update:check` | `handle` | Reads a manifest, updates PAK files, and returns `{ success: true }`, possibly with `noManifest: true`. |
| `download:client` | `handle` | Downloads an environment-specific client DLL from the supplied URL and returns `true` or an error. |
| `wrapped:cache-report`, `wrapped:get-cached-report`, `wrapped:cache-accolades`, `wrapped:get-cached-accolades` | `handle` | Writes/reads local Wrapped report and accolade JSON. |
| `settings:import-v1` | `handle` | Reads and deletes the legacy `v1-settings.json` file if present; returns parsed settings or `null`. |
| `discord:presence` | `send` | Updates the Discord RPC activity from the supplied presence object. |
| `sentry:set-user`, `sentry:clear-user` | `send` | Set or clear the diagnostic user context. |

Main-process events sent to the renderer include `toggle-titlebar`, `auth:callback`, `library:directory-selected`, `library:hash-result`, `download:progress`, `download:complete`, `download:canceled`, `download:error`, `download:client:progress`, `content-update:progress`, `launcher:launch:result`, `game:close`, and `profiler:analyze:result`. `electron-updater` additionally emits `update:checking`, `update:available`, `update:not-available`, `update:error`, `update:download-progress`, and `update:downloaded`. The SDK's internal Sentry IPC traffic is not part of the app's named product API.

The bridge also exposes generic `invoke`, `send`, and `on` methods, so renderer code can address channels beyond the named wrappers. In the checked-in application, the updater uses this generic bridge for `update:check`, `update:install`, and updater events. This makes the channel list a privileged boundary: it must be reviewed together with all registered main-process handlers, not treated as a strict allowlist just because the table lists named methods.

### Suggested API contract improvements

- Return structured data consistently instead of mixing event-only results, booleans, `null`, and rejected promises without a documented convention.
- Include a stable operation identifier for long-running work so progress and completion events can be associated with the correct request.
- Add an unsubscribe function to every event-listener helper.
- Redact authorization codes and sensitive URLs from diagnostic output.
- Validate and constrain every URL and filesystem path in the main process.
- Replace generic IPC access with narrow, documented methods where possible.
- Separate "request accepted" from "operation completed" and from "operation verified."
- Ensure error payloads are safe to display and do not reveal tokens, local secrets, or raw sensitive server responses.

## Static audit methodology and limits

This review was performed by reading the committed file tree, package metadata, preload bridge, and relevant sections of the bundled main-process and worker files. Because `app/index.js` and the download workers include bundled dependency code, not every line belongs to the application's own business logic. A string or library implementation appearing in a bundle is not necessarily an application feature; it can be part of a dependency.

The audit did not execute the application, contact its services, download client binaries, run the native addon, launch Fortnite, or test the manifest updater against real data. Therefore, it cannot establish production availability, validate service-side behavior, or certify the safety of the compiled binaries.

A follow-up dynamic test plan should use a disposable user-data directory, small synthetic files, mocked network responses, invalid test manifests, and a dedicated environment. Never use real account tokens in fixtures. Do not test anti-cheat-altering behavior against public services. The most valuable tests are those that prove failures are reported honestly and cannot corrupt unrelated files.

### Findings that deserve priority

1. Correct the client downloader's TLS verification and redirect handling before trusting downloaded DLLs.
2. Stop logging raw authentication callback codes.
3. Validate URL schemes before opening external links.
4. Validate manifest filenames after path resolution and confine operations to the build's intended content directory.
5. Verify HTTP range responses before appending to partial files.
6. Make allocation/write/verification results unambiguous in the disk-writer protocol.
7. Ensure launch notifications distinguish a missing native dependency from an actual successful operation.
8. Deduplicate process terminal events so one process does not produce multiple final close notifications.
9. Avoid placing token-like secrets in command-line arguments and remove embedded static credentials/configuration from the source.
10. Make development and packaging procedures reproducible and platform-specific.

These priorities concern correctness, integrity, privacy, and transparent user feedback. They should be addressed before adding more visual polish or increasing the number of features advertised in the interface.



## Extended module-by-module reference

This reference is based on the checked-in files that can be inspected in this repository. Since several application components have been bundled into `app/index.js`, exact source-level names are not always available as separate files. Names and examples in this chapter should be understood as identifiers visible in the published bundle, not as a promise that a dedicated source module exists in the checkout.

### Module map

| Subsystem | Main location visible in the bundle | Main responsibility | Review focus |
| --- | --- | --- | --- |
| Application startup | `app/index.js` | Initialize Electron, integrations, protocol handlers, and window | Ordering, lifecycle, startup failures |
| Preload bridge | `app/preload.js` | Expose renderer-callable functions | API consistency, listener cleanup, argument trust |
| Launch manager | Bundled main process | Start and track the configured game process | State transitions and honest result reporting |
| Profiler | Bundled main process | Walk selected directories and calculate fingerprints | Hash semantics and scan failures |
| Client downloader | Bundled main process | Save an environment-specific client DLL | TLS verification, redirects, integrity |
| Content updater | Bundled main process | Fetch a manifest and apply file changes | Path containment, resumable responses, rollback |
| Download orchestrator | Bundled main process | Coordinate build downloads and worker activity | Cancellation, progress, incomplete files |
| Disk writer | `app/workers/diskWriterWorker.js` | Allocate, write, synchronize, and verify file ranges | Write correctness and completion semantics |
| Download workers | `app/workers/downloadWorker.js`, `downloadWorkerPooled.js` | Support high-volume download processing | Bounded concurrency, resource handling, cancellation |
| Local report cache | Bundled main process | Save/read Wrapped report and accolade JSON | Schema validation and recovery |
| Diagnostics | Bundled main process | Set Sentry context and record breadcrumbs | Data minimization and redaction |
| Discord integration | Bundled main process | Connect RPC client and accept activity updates | Optional failure isolation and privacy |
| Application updater | Bundled dependency and IPC handler | Check for updates and request installation | Package-specific configuration and rollback |

This map is useful when triaging a bug. Start from the subsystem that owns the failing operation and then trace outward to the preload API, the renderer caller, and any service or worker it depends on.

## Application startup sequence and lifecycle details

The main process waits for Electron's ready event before setting its launcher diagnostic context, attempting to start the included helper executable if it exists, initiating the Discord RPC login, and creating the main application window. It also registers an activation handler that focuses an existing window or creates one if the window list is empty. When all windows close, the app quits on non-macOS platforms and tries to stop the helper process.

This ordering matters for debugging because a failure may happen before the UI appears. For example, renderer assets cannot explain a problem that occurs while Electron is loading the main bundle or a native addon. Similarly, a window that opens successfully does not prove that the helper, Discord RPC, or game-launch functionality initialized correctly.

### Startup diagnostics

A startup diagnostic record should separate these milestones:

1. Electron runtime entered the main bundle.
2. The application acquired its single-instance lock.
3. The ready event fired.
4. Launcher context was initialized.
5. The optional helper executable was found and started or a clear absence was recorded.
6. Optional integrations were started.
7. The renderer window was created and its assets loaded.
8. The renderer became able to receive IPC events.

Do not make startup depend on an optional integration being reachable. A Discord RPC login failure should not prevent the app window from opening. A missing helper should be reported as a specific diagnostic condition rather than being confused with a missing game executable or missing native addon.

### Helper executable lifecycle

The main process looks for the helper at a packaged-resource path and tries to spawn it if the file exists. At shutdown, it attempts to terminate the tracked helper process. That means packaging layout is part of the runtime contract: if the helper is copied somewhere else by a packaging step, the path must be updated consistently.

The presence of `FortniteLauncher.exe` in the repository should not be interpreted as proof that it is a complete installer, updater, or game launcher on its own. The main bundle uses it in a specific helper/dummy-process role. Its origin and purpose should be documented by maintainers, and its hash should be checked against the expected release artifact before distribution.

## Detailed profiler behavior and interpretation

The profiler operates on a selected local build and visits the expected content PAK and plugin directories. It recursively collects paths for files it finds, calculates the values used by the current comparison workflow, and returns rows containing a filename and multiple fingerprints. If the main launch manager reports that the game is running, the analysis path logs that condition and stops rather than scanning concurrently.

### Recursive walk behavior

Recursive directory traversal is convenient because plugin folders and content folders can contain nested directories. It can also be expensive on large builds. The implementation should be tested with directories containing many small files, a few very large files, unreadable directories, symbolic links where supported, and paths with unusual Unicode characters.

A robust scan should define what to do with unreadable files: stop and report a partial scan, skip and include a warning, or fail the complete operation. It should not label the results as complete when a subset of directories could not be read. If scans are later moved to workers, progress messages should include the number of files visited and the current phase, not just an unqualified completion percentage.

### Fingerprint versioning

When a fingerprint algorithm changes, the result format should include an algorithm/version identifier. Without that identifier, a value produced by an older launcher can be compared incorrectly with a value from a newer implementation. A stable comparison protocol should define the character encoding, filename normalization, case handling, byte ranges included, and hexadecimal output format.

For any integrity-sensitive comparison, the result should be tied to a reference that the user can trust. A hash matching an untrusted remote manifest is only evidence that the local file matches that manifest; it does not establish that the manifest is legitimate.

### Hash implementation summary

| Operation | Input represented | What it is useful for | What it does not establish |
| --- | --- | --- | --- |
| Filename/size fingerprint | File basename and size | Fast identification when matching an existing protocol | Full content identity |
| Partial SHA-256 fingerprint | A limited region near the end, plus basename and size | Lightweight comparison for a known protocol | Full-file integrity |
| Shipping executable digest | Whole executable bytes, MD5 in this revision | Compatibility with a reference value that uses the same MD5 convention | Modern collision-resistant assurance |
| Disk-writer chunk digest | Bytes in the requested chunk, MD5 in this revision | Detecting an unexpected chunk relative to a trusted expected digest | Integrity of other chunks or authenticity of the source |
| Client DLL fingerprint | Whole local DLL bytes, MD5 in this revision | Comparing a local client file with a compatible reference | That the downloaded DLL was obtained securely |

Never compare values from different rows as if they were the same algorithm. When a modern integrity guarantee is needed, define a new versioned format using a trusted full-file digest or a signed artifact manifest, and migrate consumers deliberately.

## Content update operation: detailed walkthrough

The current content updater requests a manifest URL, parses the response as JSON, reads the declared change list, and decides whether files should be kept, removed, or downloaded/updated. It places target content under the selected build's Fortnite PAK directory. For updates it checks a local fingerprint against the manifest value and skips a file if that value matches; otherwise it schedules the file for download. It then processes the scheduled downloads, sending progress events to the main window.

### Progress data

The progress payload visible in the implementation includes information such as the total expected size for the scheduled changes, the number of files in the update, the current file position, a current-file size, and a percentage derived from downloaded bytes and the current file's size. The exact meaning should be documented in the UI so users do not confuse current-file progress with whole-update progress.

For example, a current-file percentage can reset when the next file begins. The UI may need to display both a per-file bar and an overall summary. If a file is already partially present, the count should account for bytes that have already been written only if those bytes are known to belong to the correct file and range.

### Manifest and progress edge cases

A production updater should explicitly handle an empty change list, a zero-byte file, a file without a declared size, an unknown change type, a duplicate filename, a missing hash, a response that returns the wrong content range, and a download that ends before the expected byte count. All of these conditions should have a documented outcome and should not be silently reported as success.

The current implementation is useful to understand the intended content-update architecture, but static reading does not establish that all these edge cases are covered. They should be added as repeatable test cases before any claim of robust recovery or integrity verification is made.

### Safe recovery after an interrupted update

If a download is interrupted, preserve enough metadata to know which file was being updated, how many bytes were confirmed, which manifest was used, and whether the previous file was replaced. On the next attempt, validate the partial file and response range instead of assuming any existing file is resumable.

Where an update may delete or replace local files, take a backup or create a staging directory first. Only promote the new result after all files needed for a consistent update have passed their checks. If transactional updating is not implemented, clearly state that the operation may leave a build partly updated and recommend using a copy that can be restored.

## Download worker and disk-writer coordination

The repository includes both regular and pooled download worker bundles, plus a disk writer worker. The presence of multiple worker scripts suggests alternative or pooled execution paths, but the actual concurrency policy should be confirmed from the orchestrator configuration before documenting a guaranteed number of concurrent requests.

A common design is to separate fetching remote chunks from writing them to disk. The network worker retrieves bytes and associated metadata; the disk writer places chunks at offsets and reports write or verification outcomes; the orchestrator tracks the relationship between file indices, chunk indices, retries, and completion. The current disk-writer message format includes file and chunk indices, which allows a caller to correlate a response with the original task.

### Worker contract requirements

For a reliable pipeline, every task should have a unique or unambiguous identity. Every accepted task must produce a terminal response, including errors. Duplicate responses must not increment progress twice. An unknown message type should result in a clear protocol error instead of being ignored silently. The parent process must handle worker exits and errors and decide whether an unfinished task can be retried.

Concurrency should be bounded by available memory, disk speed, server limits, and the target device. Large buffers can quickly consume memory when many requests are active. The orchestrator should avoid loading entire multi-gigabyte files into RAM; streaming or fixed-size chunks keep the memory profile predictable.

### Durability versus verification

The disk writer calls file synchronization periodically and while closing descriptors. Synchronization helps flush operating-system buffers to the filesystem, but it does not prove that the correct data was written. A successful write, successful synchronization, successful checksum verification, and successful whole-file validation are separate milestones.

The response schema should reflect those differences. Avoid setting `verified: true` in a branch that only performed a write. If a checksum verification fails, the caller should mark the relevant chunk as invalid, retry it only according to an explicit retry policy, and prevent the overall file from being marked complete until all required chunks have passed verification.

## External URL handling and service boundaries

Several operations deal with URLs: opening an external browser, downloading a client DLL, fetching an update manifest, downloading content files, and checking application updates. Each route has its own trust requirements and should not accept arbitrary URLs merely because the renderer supplies one.

### URL validation

Before using an externally supplied URL, confirm that it uses an expected scheme, a valid hostname, and an approved destination. For a browser action, a typical safe design allows only intentional web schemes and rejects unexpected schemes that may invoke local handlers. For a binary download, prefer a fixed or allowlisted host and validate every redirect target as well as the initial URL.

Manifest URLs and content file URLs should be reviewed separately. A manifest should not be able to redirect a privileged file-writing operation to an arbitrary host unless that behavior is a deliberate, authenticated part of the service protocol. Log sanitized host/path details, not signed query strings or access tokens.

### Service availability

A hard-coded service URL can become unreachable, change its response format, or stop serving an old build. An unavailable endpoint does not necessarily mean local files are broken. The launcher should distinguish DNS/TLS/connectivity failures from HTTP status errors, invalid JSON, an unknown manifest schema, missing content, and invalid local build paths.

Where service configuration is environment-specific, document which environments exist and how they are selected without embedding secrets in public docs. Do not promise that development, staging, or production endpoints are accessible to every user.

## Authentication callback and sensitive-data handling

The main process parses a callback URL, extracts a `code` parameter, focuses the app window, and forwards the code to the renderer. The current implementation also writes the callback URL and code-related information to console output. Callback codes are sensitive short-lived credentials and should not be printed verbatim. Logs can be uploaded automatically, attached to bug reports, copied to shared channels, or stored for longer than expected.

A better diagnostic policy records that a callback was received and whether a required parameter was present, without recording its value. On failure, record the category of the error, not the code itself. If a code has already been exposed, use the service's account-security process to invalidate or replace affected session credentials as appropriate.

The custom protocol also needs robust parsing. A malformed URL should not crash the main process, and callbacks arriving before the window is ready should be handled deliberately. Where supported by the authentication protocol, verify the expected state value and ensure the callback belongs to the login flow the user actually initiated.

## Application updater and release integrity

The main process exposes a handler that requests an update check from Electron's updater and another event handler that calls the updater's install/restart function. These routes demonstrate integration points, but actual update availability depends on release metadata and packaging configuration. Running an update check does not mean an update is available, and requesting installation is not proof that the new version installed successfully.

A release process should sign artifacts where supported, verify platform and version metadata, and keep the update feed separate from arbitrary user-provided URLs. Test with a staging release and a disposable installation before publishing a production update. Include failed download, corrupted update, no-update-available, permission-denied, and restart-required scenarios in the QA plan.

If the application can update itself, the README and release notes should also explain whether the app restarts automatically, whether the user needs to close the game first, where pending update files are stored, and how to recover from a failed update. Only describe behavior that has been verified for the actual package format.

## UI state and renderer integration

The renderer receives progress and result events through the preload bridge. Because several operations are asynchronous, the visible interface should not rely on local button state alone to infer what the main process is doing. A request can be lost, rejected, cancelled, or finish after the component that started it has unmounted.

### Recommended UI behavior

- Disable duplicate start actions while an identical operation is running.
- Show a clear operation label and the build identifier or sanitized name.
- Distinguish file-download progress from verification and finalization.
- Surface cancellation as a terminal state instead of leaving a stale spinner.
- Show actionable errors, with a separate affordance for sanitized technical details.
- Remove event listeners when a view no longer needs the event.
- Recover from window recreation by re-querying operation state if such a state API exists.
- Do not show success based only on a button click or on an IPC send being attempted.

If the current API has no way to query the state of an operation after a view is recreated, a future improvement is to expose a narrowly scoped status query rather than making the renderer infer state from old events.

## Renderer interface: design, components, and interaction flow

This section documents the visible renderer shell, the styling rules in the checked-in CSS bundle, and the operations exposed to interface code. It is a static description of the repository snapshot, not a claim that every view or interaction has been runtime-tested.

### 1. How the interface is loaded

The renderer entry point is `app/renderer/index.html`. It creates the `#root` element, sets the document to a dark theme, and loads two generated assets:

- `app/renderer/assets/index-Cmjydc3O.js` — the compiled JavaScript application. The package manifest declares React and React DOM, alongside libraries for routing, state, data fetching, controls, animation, charts, Markdown, and 3D content.
- `app/renderer/assets/index-ByT-tuHS.css` — the generated stylesheet that supplies layout utilities, colours, component styles, visual effects, animation rules, and responsive breakpoints.

The React renderer mounts inside `#root`. The HTML shell does not contain the full interface itself; screen structure and event handlers live in the compiled JavaScript bundle. The hashed filenames are build outputs, so they should be updated together when the original renderer source is rebuilt.

### 2. What the renderer CSS contains

The CSS is more than a set of basic colours. It combines utility-style classes, shared theme tokens, custom visual effects, and component-specific styling.

| CSS area | What is present in the checked-in stylesheet | Practical effect |
| --- | --- | --- |
| Dark base and theme variables | A near-black page background, light foreground text, card and border colours, plus `--primary`, `--accent`, and `--theme-*` variables | Gives the UI a consistent dark foundation and reusable accent colours |
| Cyan, indigo, and purple accents | Theme values include cyan/blue, indigo, and violet/purple tones | Supports coloured highlights, gradient borders, and emphasis states |
| Utility-based layout | Utility classes for flex and grid layouts, spacing, sizing, alignment, overflow, typography, borders, and rounded corners | Lets compiled components assemble layouts without a separate hand-written rule for every element |
| Translucent panels | The `.glassmorphism` class uses a semi-transparent background, backdrop blur, and a subtle light border | Creates glass-like overlays and panels where components use the class |
| Ambient backgrounds | `.blobs`, `.blob`, `.blob-rotate`, and `.blob-move`, with configurable size, blur, and colours | Provides the CSS building blocks for soft, blurred, moving colour fields |
| Motion and progress effects | Keyframes/classes for aurora, meteors, gradients, grid movement, rainbow effects, shimmer, ripples, spinning, marquees, and progress bars | Supports animated decorative backgrounds, loading/progress treatments, and scrolling content |
| Form and interaction states | Classes for hover, focus, active, disabled, pointer events, visibility, and transitions | Gives controls visual feedback and supports interaction-specific styling |
| Markdown content | `.markdown` and `.markdown-v2` rules style headings, paragraphs, strong text, links, and lists | Helps formatted descriptions or report text fit the dark UI |
| Special presentation styles | `.lanyard-wrapper` and `.wrapped__outline-text` define full-height centred presentation layout and outlined display text | Provides specialised styling for Lanyard/Wrapped-style presentation elements when those classes are used |
| Responsive layout | Breakpoints at 640, 768, 1024, 1280, and 1536 pixels | Enables layout changes for different window widths and display sizes |
| Motion preference | One shine animation is wrapped in `@media (prefers-reduced-motion: no-preference)` | Enables that effect when motion is allowed; the sheet does not provide a broad `prefers-reduced-motion: reduce` override |

The CSS defines these styles and animation primitives, but a selector's presence does not prove that a particular screen currently uses it. Confirm usage by tracing the class name in the renderer bundle or by testing the actual interface.

#### Additional styling capabilities in the compiled CSS

The stylesheet also contains functional rules beyond its general dark theme and animation list:

- **Shared design tokens:** `:root` defines the background and foreground, primary and secondary colours, card and border colours, five gradient colours, and variables for the size, blur, and colours of ambient blobs. Separate `--theme-primary`, `--theme-secondary`, and `--theme-accent` values let utility classes build theme-tinted text, borders, rings, and gradients.
- **Electron window dragging:** `.drag` marks a region as an Electron draggable area and disables text selection there; `.no-drag` marks controls inside that region as clickable. These classes support the custom frameless title bar.
- **Custom scrollbars:** WebKit scrollbar rules set an 8-pixel track/thumb, a transparent track, rounded indigo thumb, and a brighter hover state. This affects Chromium/Electron rendering; it is not a cross-browser scrollbar API.
- **Control feedback and state styling:** There are hover, focus, focus-visible, active, disabled, `group-hover`, `group-open`, `peer-checked`, and `data-disabled` variants. They provide visual response for controls such as buttons, toggles, disclosure groups, and disabled actions when the renderer uses the corresponding classes. The CSS does not itself implement the control behavior.
- **Layered visual effects:** Besides `.glassmorphism`, the sheet includes gradient borders/backgrounds, masked gradient layers, grid and radial backgrounds, blur and backdrop blur, neon shadows, text clipping/strokes, and line-clamp helpers. These can create glowing cards, decorative surfaces, compact text, and layered hero sections.
- **Animated presentation primitives:** Keyframes and utility classes cover aurora, moving blobs, meteors, grid movement, shimmer/shine, rainbow gradients, ripples, marquees, progress bars, spinning, and pulsing. Some utilities accept custom CSS variables such as `--duration`, `--gap`, and blob colour/size values.
- **Markdown content:** `.markdown` and `.markdown-v2` style paragraphs, heading hierarchy, links, nested ordered/unordered lists, list markers, blockquotes, horizontal rules, inline code, and preformatted code blocks. This is presentation support for rendered text, not a Markdown parser.
- **Responsive layouts:** The generated utilities include container widths and responsive grid, spacing, sizing, and typography variants at 640, 768, 1024, 1280, and 1536 pixels. The presence of these breakpoints does not prove every screen adapts well at those widths; the main Electron window itself has a fixed minimum size.

The CSS appears to be generated utility output with additional component styles. To determine which of these capabilities is used by the app, search the exact class in `index-Cmjydc3O.js`; to understand what a control does, also trace its renderer handler and preload IPC call. A class such as `.peer-checked` can draw a selected switch state, for example, but cannot save a setting or perform the action represented by that switch.

#### Animation and visual-effect reference

The compiled stylesheet defines the following reusable effects. Durations below are the defaults written in the CSS; a component can override timing or custom properties, and some helpers do not set a duration themselves.

| CSS class / keyframe | Default behavior | Possible UI use |
| --- | --- | --- |
| `.blob`, `.blob-rotate`, `.blob-move` | Three blurred ellipses use separate colours, staggered delays, 8-second blob morphing, 20–30-second rotation, and 10-second movement. | Slow ambient colour fields behind a screen or card. |
| `.animate-aurora` | Moves a background gradient back and forth over 10 seconds. | Animated banner or decorative surface. |
| `.animate-grid` | Shifts a grid vertically over 15 seconds. | Moving grid background. |
| `.animate-meteor` | Fades and translates a meteor-like element across 500 pixels over 5 seconds. | Decorative streaks or star-field effects. |
| `.animate-gradient`, `.animate-rainbow` | Move a background gradient over 8 or 10 seconds respectively. | Gradient title, border, or highlight. |
| `.animate-shiny-text`, `.animate-shimmer-slide` | Sweep a background shine; the slide variant uses a `--speed` variable. | Shimmering text, card edges, or loading decoration. |
| `.animate-marquee`, `.animate-marquee-vertical` | Translate content by its width/height using `--duration` and `--gap`. | Repeating horizontal or vertical ticker content. |
| `.animate-progress-bar` | Animates width from 0% to 100% with a linear, forwards animation; the class itself does not define a duration. | A CSS-driven progress fill when the component supplies suitable timing. |
| `.animate-ripple`, `.animate-rippling` | Scale an element outward and fade it; the ripple helper repeats over 3.4 seconds, while rippling runs once over 0.6 seconds. | Decorative pulse/ripple indicator. |
| `.animate-spin`, `.animate-spin-around`, `.animate-pulse`, `.animate-ping`, `.animate-blink-cursor` | Standard rotation, custom rotation sequence, opacity pulse, expanding ping, or blinking opacity with fixed timings from 1 to 2 seconds (spin-around uses `--speed`). | Loading indicators, notification emphasis, or cursor-like accents. |

The source also defines `featured-display-bar`, shine, line-shadow, and background-position keyframes, including some duplicated generated keyframe blocks. Duplication is a build-output detail; it does not mean the effect runs automatically. An animation only appears when an element receives the corresponding class and the required dimensions, variables, content, and positioning.

#### Layout, accessibility, and runtime boundaries

- **Window chrome:** `.drag` and `.no-drag` are Electron-specific. A draggable region can make pointer events behave differently from a normal web page, so clickable title-bar buttons should sit in a `.no-drag` region.
- **Keyboard and assistive-technology helpers:** `.focus-visible` variants draw rings or outlines for keyboard focus, and `.sr-only` visually hides content while keeping it available to assistive technology. The stylesheet provides these tools but cannot confirm that every interactive control has an accessible name or focus order.
- **Direction-aware controls:** `rtl:` variants and logical inset utilities include support for right-to-left layouts, including a checked peer switch translation. This is partial styling support, not proof that every screen has been localized or tested in RTL.
- **Container and overflow behavior:** The stylesheet includes responsive container widths, flex/grid helpers, aspect-ratio and overflow rules, and one-line/two-line clamping. A line-clamped label may be visually truncated; inspect the component for an accessible full-text alternative where needed.
- **Browser/runtime assumptions:** The stylesheet is loaded by Electron's Chromium renderer and uses WebKit scrollbar selectors, `backdrop-filter`, masks, container query units, and newer CSS utility output. Effects can render differently in other browsers or older runtimes.
- **Performance:** Large blurred surfaces, multiple infinite animations, backdrop filters, and repeated shadows can be GPU-intensive. Use browser devtools to check actual compositing and frame time before adding these effects to large or full-window layers.
- **Motion accessibility:** Only the specific `.motion-safe` shine helper is gated by `prefers-reduced-motion: no-preference`. Many other animation classes are not globally disabled for users who request reduced motion, so the component must provide an appropriate fallback if required.

For a reproducible CSS change, locate the original component/class source if available, make the edit there, rebuild the renderer, and update the hashed HTML references. Editing this generated file directly is useful for diagnosis but is likely to be lost on rebuild.

#### CSS classes confirmed in the renderer bundle

I also searched the checked-in JavaScript bundle for exact class names. These examples connect some CSS rules to concrete renderer elements:

| Class found in both assets | Renderer use visible in the bundle | What the CSS contributes |
| --- | --- | --- |
| `blobs`, `blob-rotate`, `blob-move` | A decorative component renders three nested blob layers and marks the wrapper `role="presentation"` with pointer events disabled. | Positions, blurs, colours, rotates, and moves the background shapes without intercepting clicks. |
| `lanyard-wrapper` | Wraps a React Three Fiber canvas and camera setup. | Centres the canvas in a full-viewport flex container. |
| `wrapped__outline-text` | Styles a large season-name heading in the Wrapped presentation. | Makes the text transparent with a violet outline. |
| `line-clamp-1`, `line-clamp-2` | Used on compact names/descriptions in card-like data and shop-related UI. | Restricts text to one or two lines to keep card heights consistent. |
| `animate-progress-bar` | Applied to a 1-pixel-high progress strip with `animationDuration: "7s"`. | Fills the strip from 0% to 100% over the supplied seven-second duration. |
| `animate-rainbow` and `before:animate-rainbow` | Used in a button variant and a blurred pseudo-element behind it. | Moves a multi-colour gradient through the button and its glow. |
| `animate-spin` | Appears on several renderer elements. | Provides the standard one-second rotating loading/decorative effect. |
| `markdown`, `markdown-v2` | Referenced by bundled rich-text rendering components. | Formats headings, links, lists, quotes, and code supplied as rendered Markdown. |

Exact string search did not find `glassmorphism`, `font-gaming`, `.animate-aurora`, `.animate-grid`, `.animate-meteor`, `.animate-shimmer-slide`, `.animate-shiny-text`, or the marquee helpers in this renderer bundle. Their CSS rules are available, but they may be unused, constructed dynamically, or referenced by a different build; do not claim they appear in the active UI without further tracing. Conversely, a class string found in the bundle confirms a code reference, not necessarily that the associated component is reachable in every session.

### 3. Fonts and visual identity

The HTML shell requests the Dancing Script font from Google Fonts, while the CSS defines a `.font-gaming` class using Bricolage Grotesque and also includes a Google Fonts import. The stylesheet's shared theme values include a dark background (`rgb(10 10 10)`), bright foreground text, cyan/blue primary accents, and violet/purple secondary accents.

Since the fonts are requested externally, font availability can depend on network access and browser font loading. The interface should retain reasonable fallback fonts if those requests cannot complete.

### 4. Interface operations exposed by the preload bridge

The preload file exposes the same API under both `window.electron` and `window.electronAPI`. Those objects connect renderer controls to Electron's main process. The available method names show the following operation groups:

| Operation group | Relevant exposed methods | Purpose |
| --- | --- | --- |
| Window and app controls | `getVersion`, `maximize`, `minimize`, `close`, `onToggleTitlebar` | Read the app version and request common window actions |
| Browser and authentication callback | `openBrowser`, `authV3Callback` | Open a browser URL and receive an authentication callback event |
| Local library and diagnostics | `openDirectory`, `handleOpenedDirectory`, `shippingHash`, `handleShippingHash`, `openPath`, `openLogs` | Select/open local folders, request a file hash, and open logs |
| Build downloads | `selectDownloadPath`, `startDownload`, `cancelDownload`, `onDownloadProgress` | Select a destination, start or cancel a download, and receive progress events |
| Game launch | `launch`, `onLaunched`, `onGameClose`, `forceQuitGame`, `checkVCRedist` | Request launch, receive launch/close events, force-quit a game process, and check the Visual C++ runtime |
| Build profiling and client fingerprint | `analyzePaks`, `onAnalyzeResult`, `clientFingerprint`, `disablePaks` | Request a build analysis, receive its result, calculate a client fingerprint, and call the PAK-related operation |
| Content and client downloads | `checkForContentUpdate`, `onContentUpdateProgress`, `downloadClient`, `onClientDownloadProgress` | Request content-update/client-download operations and receive progress |
| Wrapped report cache | `cacheWrappedReport`, `getCachedWrappedReport`, `cacheWrappedAccolades`, `getCachedWrappedAccolades` | Save or retrieve report and accolade data from the local cache |
| Integrations and diagnostics | `discord`, `sentrySetUser`, `sentryClearUser` | Send Discord presence data and set or clear diagnostic user context |

These are API entry points, not proof that every button is visible or that every operation succeeds. For example, a method may be present in preload while the corresponding main-process operation remains incomplete, fails in a particular environment, or depends on valid service data. The existing implementation-status and troubleshooting sections describe those distinctions.

### 5. How a UI action works from click to result

The intended flow is:

1. **A renderer component handles the interaction.** A click, selection, or other UI event invokes a method on `window.electron` or `window.electronAPI`.
2. **The preload sends the request over Electron IPC.** The implementation uses `ipcRenderer.send` for event-style requests and `ipcRenderer.invoke` where a returned promise/result is expected.
3. **The main process performs privileged work.** Depending on the channel, it can coordinate filesystem access, a network request, a download worker, a local process, or an integration.
4. **Results return to the renderer.** Some operations return a value through `invoke`; others emit progress or result events such as `download:progress`, `launcher:launch:result`, `profiler:analyze:result`, or `content-update:progress`.
5. **The UI updates its state.** A component can then update displayed progress, success, cancellation, or error information. The stylesheet controls how those states look; it does not execute the underlying operation.

A request being sent is not equivalent to a successful download, verified file, or confirmed game launch. The interface should wait for the corresponding result event or return value and display failure states honestly.

### 6. Renderer libraries declared by the project

The current package manifest declares several libraries that provide common interface building blocks:

- **React and React DOM** for the renderer UI; **React Router** for route-based navigation; **TanStack Query** for asynchronous data/query management; and **Zustand** for shared client state.
- **Radix UI** and **React Icons** for controls and iconography; **Motion** for animation; **Recharts** for charts; and **react-markdown** for Markdown content.
- **Three.js**, **React Three Fiber**, **Drei**, and **Rapier** for 3D rendering and physics-related components; **canvas-confetti** and **html2canvas** for visual effects or capture-related functionality.

These are dependencies declared in `package.json`. Their presence indicates available implementation tools, but it does not by itself establish which screen imports each library or whether a feature using it is currently reachable.

### 7. Safe ways to investigate or modify the interface

- To understand a control, search the compiled renderer for its label or handler, identify the preload method it calls, and trace that method to the matching main-process IPC handler.
- To understand an appearance, locate the CSS class in `index-ByT-tuHS.css` and then search for the same class in the renderer bundle. The stylesheet alone cannot explain the behaviour of a control.
- Prefer recovering the original component and stylesheet source before making broad UI changes. Editing a generated/minified bundle directly is difficult to review and may be overwritten by the next build.
- If a change adds/removes an exposed operation, update the preload/API documentation and verify the corresponding main-process handler, progress events, error path, and listener cleanup.
- Test the packaged application at narrow and wide window sizes, with and without a network connection, and with reduced-motion preferences enabled. Do not infer runtime success from static CSS or a function name alone.


## Renderer JavaScript bundle deep dive

**Scope and evidence note.** This is a static review of the renderer bundle present in this repository checkout at `app/renderer/assets/index-Cmjydc3O.js` (7,050,729 bytes), together with the checked-in renderer HTML and CSS. The hash-like filenames are generated build names. The review describes code and strings found in those local assets; it does not establish that the service endpoints are currently available or that every route was exercised. No app runtime, backend, native addon, or live OAuth flow was tested.

The bundle contains the React runtime and the application renderer together. Much of its size comes from bundled libraries (React, router/query/state utilities, animation, charts, Three.js/React Three Fiber, physics, image/canvas helpers, and Sentry), not just Era's own UI. The production application code is distributed among the dependency code, so searching a single label or function is not a complete audit by itself.

### Screens and navigation

The router registers the following paths. Authentication and the account/role/maintenance gates run before the main application views.

| Path | Functionality visible in the bundle |
| --- | --- |
| /auth | Discord sign-in flow, animated sign-in screen, and a four-item recent-news area. |
| /home | Launcher dashboard with banner carousel, build launch/download actions, news, status alerts, and launcher activity/insights. |
| /library | Local build library, installed-build metadata, import/identification flow, public/available builds, downloads, progress, and cancellation/error states. |
| /store | Store catalog, owned products, monthly pack, and active perks. |
| /shop | Fortnite item-shop view backed by the launcher API. |
| /post/:id | Single news post and post-view tracking. |
| /wrapped | Season recap/Wrapped status, accolades, report data, statistics, charts, and report presentation. |
| /settings | Account information and username changes, installed builds/client settings, theme presets and custom colours. |
| /profile | User statistics and recent match history. |
| /leaderboards | Leaderboard results and placement display. |
| / | Redirects to /home when authenticated, otherwise /auth. |

The bundle also has dedicated states for maintenance, missing Visual C++ runtime, users without the required launcher role, mandatory username changes, launch verification failures, and fatal renderer errors. The visible strings include **Update Required**, **Auth Failed**, **Modified Files**, and **Launch Failed** for launch-flow errors. The presence of a route or state establishes that code is bundled, not that the server currently makes the feature available.

### API and realtime data flow

The renderer uses an authenticated Axios client for most account/build data and a separate public client for news. The authenticated client reads the persisted **era-auth-storage** entry from local storage and attaches its bearer token, plus the launcher version headers, to requests. A 401 response clears that stored authentication and redirects to /auth. A response indicating the missing-role error sets an access-denied state; other 403 responses set the maintenance state.

| Service | Calls visible in the renderer | Purpose |
| --- | --- | --- |
| Public service at api-v1-public-service-prod.erafn.dev/api/v1/public | /news/posts, /news/posts/:id | List and display news. |
| Launcher service at api-v1-launcher-service-prod.erafn.dev/api/launcher | /user, /banners/v2, /builds, /builds/query, /builds/public, /builds/identify, /status-alerts, /friends, /features, /shop, /cyclops/catalog, /cyclops/user, /insights, /user/stats, /user/matches, /leaderboards/:id?type=..., /user/wrapped, /user/wrapped/accolades, /user/wrapped/reports/:id, /check-username/:username, /user/username | Account, launcher dashboard, library, shop/store, status, profile, leaderboard and Wrapped data. |
| OAuth service at oauth-v3-service-prod.erafn.dev/v3/oauth | /authorize, /token | Start the authorization-code flow and exchange the returned code for an access token. |
| Phoenix WebSocket at wss://ws-prod.erafn.dev/launcher | Per-user ui, friends, activity, and invites channels; global ui:global; build-specific launcher channel | Push updates for account currency/character/role, shop data, match state, friend presence, activity/invites, feature flags and launch verification. |

The status-alert query refreshes periodically, the insights store can poll every 15 seconds when started, and Wrapped status is polled every 10 seconds until the report is marked completed. These intervals are client code, not uptime guarantees for the backing service.

#### Other network-facing services and artifact endpoints

The API table above covers the account-facing HTTP and Phoenix interfaces. The checked-in main and renderer bundles also contain these infrastructure calls. These are service integrations, not additional JSON endpoints exposed by a local launcher server:

| Host / protocol | Observed use |
| --- | --- |
| `build-download-chunks-v3.eracontentspace.site` | Build manifest paths of the form `/manifests/v3.<build-uuid>.manifest` and chunk objects at `/chunks/<chunk-hash>.chunk`. The manifest supplies build files and chunk metadata to the download workers. |
| `required-content-files.eracontentspace.site` | Content-update manifest at `/manifests/<build-id>.v1.manifest` and file downloads at `/files/<file-name>`. The content updater uses these paths for PAK changes. |
| `launcher-v3-bucket.eracontentspace.site` (S3-compatible update feed) | `electron-updater` is configured with bucket `launchers-v3`, region `auto`, and channel `latest`. It checks/downloads launcher application releases. |
| Sentry ingestion DSN in `app/index.js` | Sends configured error, diagnostic, and performance telemetry to the Sentry project. This is a write/ingestion endpoint rather than a user-facing data API. |
| Discord RPC | The bundled Discord RPC client logs in with a configured application ID and receives presence updates from the renderer through `discord:presence`. It communicates with the local Discord client; the renderer does not call Discord's REST API directly for presence. |
| Google Fonts | `fonts.googleapis.com` and `fonts.gstatic.com` are requested by the HTML/CSS for Dancing Script and Bricolage Grotesque fonts. |
| Client DLL URL supplied at runtime | `download:client` accepts a URL and downloads from it into the app's user-data directory. The source does not pin one single client-file URL in the downloader; the renderer obtains the URL from service data. |

HTTP methods and request bodies vary by call site and are not exhaustively encoded in the compact route list above. To audit a particular operation, search its path in the renderer bundle and inspect the nearby Axios call, query parameters, request body, response handling, and authentication headers. Do not infer a stable public API contract or guaranteed availability from a URL embedded in a client build.

### Authentication and persisted renderer state

The sign-in button builds an authorization URL for the custom fluxapp://callback redirect, opens it through the Electron bridge, exchanges the callback code for a token, requests the user profile, and stores authentication through the persisted Zustand store. The bundle also updates Discord Rich Presence after login and on launch/close events.

The renderer's OAuth request embeds a static HTTP Basic credential pair in the compiled JavaScript and creates state from a Base64-encoded object containing only the release version and channel. The visible request does not include a PKCE code_challenge, and the renderer callback handler does not visibly compare a returned state value before exchanging the code. Those observations require an end-to-end check of the main-process callback and authorization server; they are not proof that the service lacks additional validation. Any credential intended to be confidential must be treated as exposed when embedded in a distributed renderer. Prefer a public-client flow with PKCE or perform the confidential token exchange server-side, and use a cryptographically random, per-request state value that is validated on callback.

Renderer storage includes at least **era-auth-storage** (authentication), **era-library-storage** (the local build list), **era-settings-storage** (including the client-DLL-check preference), **era-news-storage**, **era-status-alerts-storage**, and migration markers for older settings. The library metadata stored in local storage points to local build folders; the renderer's local state is not itself proof that a directory still exists or its contents are valid.

One control labelled **Remember device** is rendered as a checkbox but has no visible state binding, onChange handler, or connection to the OAuth request in this bundle. It can visually toggle as a native checkbox, but this code does not make the choice persist or alter authentication behavior.

### Build launch, integrity checks, and downloads

The renderer's launch hook follows this sequence:

1. Resolve build metadata and a local path from the library state or query the build service.
2. Ask Electron to check for a content-update manifest at required-content-files.eracontentspace.site/manifests/:buildId.v1.manifest. Failure is caught and logged as a missing/optional manifest, after which the launch flow continues.
3. Ask Electron for the local client fingerprint. In the production path, unless the persisted skip-check setting is enabled, the renderer calls the launcher service to check the client DLL and requests a download URL when the HTTP response is not successful. After a download it checks the fingerprint again.
4. Ask Electron to analyse PAK files. The result is placed in renderer state and used in the launcher-channel verification.
5. Join launcher:<buildId>, request a server timestamp, then send an integrity field built from release-version text, timestamp, shuffled analysis data, nested Base64 encoding, and reversed characters.
6. On an “ok” verification response, request an online token and call Electron's launch method with the local path, token, production environment, and options. An offline path requests token:offline on the current channel.
7. Receive launch/close events through the Electron bridge to update the UI and Discord Rich Presence.

The Base64/reversal steps are encoding/obfuscation; they are not a digital signature or a substitute for server-side integrity validation. Actual trust depends on the service's verification rules and on the main/native process, which this renderer-only review cannot establish. The renderer also exposes the invalid-PAK disable-and-retry flow, but whether that operation safely changes files must be determined from the main-process implementation.

Build downloads are initiated through the Electron bridge and observed through completion, cancellation, error, and per-file progress events. The UI translates common error text (permission denied, out of space, no network, timeout, 403/404 and TLS-related text) into human-readable messages. That mapping is UI error handling, not a guarantee that every error shape is recognized.

### Realtime and update behavior

The Phoenix connection is authenticated with the user's token and subscribes to account, global, friends, activity, invite and launch topics. On the global update event, however, the supplied renderer copy logs “Update notification received” and then only references window.electron.checkUpdates; it does not call the function or invoke the update-check channel in that callback. The separate startup updater path does invoke update:check, so this finding concerns the realtime push handler and does not prove that all update checks are broken.

The launch hook registers an onAnalyzeResult callback inside each launch attempt but does not save or call a returned unsubscribe function. The auth screen likewise registers authV3Callback in a mount effect without returning cleanup. If the preload methods create persistent listeners, repeated navigation or launch attempts can leave old callbacks registered and cause the same result to be processed more than once. Verify the exact preload contract and test repeated launch/auth cycles; prefer one-shot subscriptions or explicit cleanup in finally/effect cleanup.

### Telemetry and logging

Sentry is initialized in production with application version context, 10% trace sampling, 10% session-replay sampling and 100% replay sampling on errors. Replay is configured with maskAllText and blockAllMedia, but sendDefaultPii is enabled. When authenticated, the renderer sets Sentry's user context to the account UUID, username and email and forwards the same identity to the Electron bridge. The renderer also sends user agent, language and application version as context. This is a real telemetry/data-minimisation decision and should be documented in the application's privacy notice and reviewed against retention/access settings in the Sentry project.

The bundle logs detailed lifecycle events to the console. Noteworthy examples include the full returned client-DLL storage response/download URL and the refreshed user object. If a service response contains signed URLs, temporary credentials, account identifiers or other sensitive fields, logging the full object can put those values into diagnostic logs. Log only status and non-sensitive identifiers, redact query parameters and avoid printing complete user objects.

### Findings and recommended fixes

| Priority | Finding from the supplied renderer copy | Recommended action |
| --- | --- | --- |
| High-priority security review | Static Basic credential pair is embedded in the renderer; the authorization URL uses deterministic state and no visible PKCE fields/state comparison. | Confirm the server-side OAuth contract. Rotate the credential if it is meant to be secret; use PKCE, unpredictable per-request state and callback validation, or move confidential exchange out of the renderer. |
| Medium — launch correctness | onAnalyzeResult subscription is registered per launch attempt without visible cleanup. | Store and call the unsubscribe handle, or provide a one-shot preload API. Add a regression test that launches, closes and launches again and confirms one verification/launch per analysis. |
| Medium — library reliability | queryBuilds catches both HTTP 404 and 500 and calls clearBuilds(), which empties persisted local build metadata. A transient server failure can therefore hide every build from the library even though their folders remain on disk. | Keep the local list on transient/server errors. Remove a build only after an explicit, validated “not found” decision for that build; surface a retry/error state rather than clearing all entries. |
| Medium — update correctness | The global WebSocket update handler references checkUpdates but does not invoke it. | Call the approved update-check method/channel, handle its rejection and test a server-pushed update notification. |
| Medium — client update error handling | Any non-OK HTTP response from the client-DLL version check is treated as a reason to request/download the latest DLL, including possible authorization or server failures. | Distinguish “version missing/outdated” from 401/403/5xx/network errors; only download when the service response explicitly indicates an update is required. |
| Medium — listener lifecycle | The auth callback subscription has no visible React-effect cleanup. Whether it leaks depends on the preload method's implementation. | Make the preload method return an unsubscribe function and return it from the component effect. |
| Low — dead preference | Remember device has no handler, state, persistence or effect on the auth request in the supplied bundle. | Wire it to a supported backend/browser behavior or remove/disable the misleading control. |
| Privacy — data minimisation | Sentry permits default PII, authenticated user UUID/username/email are explicitly attached, and error sessions have replay sampling configured to 100%. Console logs also print some full objects/URLs. | Review the exact captured payload and access/retention policy; retain masking, redact log values, minimise identity fields, and clearly disclose telemetry. |
| Maintainability | The release string 3.0.9 is repeated in API headers, OAuth state, launch verification and update URLs rather than being consistently derived from the runtime version. | Use one generated release-version constant and test that package, renderer, server headers and update checks agree. |

### Verification checklist

- Compare the exact packaged JavaScript with the supplied formatted copy before attributing these findings to a release.
- Test login from a clean state, verify the callback state, and inspect whether the OAuth flow uses PKCE or additional validation outside the renderer.
- Launch, close and re-launch a build several times; confirm one PAK result, one verification exchange and one launch action per attempt.
- Simulate a 500 from /builds/query; verify that local build metadata remains intact and errors are recoverable.
- Deliver a global WebSocket update event and confirm that the updater is actually invoked.
- Simulate client-version responses of 404, 401, 403 and 500; confirm only an explicit outdated/missing-version response triggers DLL download.
- Inspect Sentry's actual captured event/replay payloads using synthetic account data; confirm that no tokens, full signed URLs or unnecessary user data are included.
- Click Remember device, restart the app and sign in again; verify that the UI is either genuinely functional or clearly removed.

Static code inspection can identify these wiring and data-handling patterns, but it cannot establish the authorization server's behavior, the main process's filesystem protections, the native addon's safety, or whether a remote service currently returns a particular response. Treat the OAuth points as high-priority validation items and the confirmed renderer wiring issues as fix candidates until runtime tests are recorded.
## Privacy, telemetry, and support workflow

The codebase contains Sentry-related setup and can attach launch or build context to diagnostic events. Support tooling should avoid collecting more data than needed. Build paths can reveal operating-system usernames; build identifiers can be associated with user activity; authentication callbacks may contain credentials. Review every field attached to a telemetry event and explicitly scrub sensitive values.

A privacy-conscious support workflow uses a minimal diagnostic bundle that contains the app version, platform, architecture, an operation identifier, a sanitized error code, and the relevant sequence of state transitions. If the full path is useful, replace the user-specific prefix with a placeholder before sharing. Never include the client DLL, full game build, or authentication/session files in a public issue unless there is a legitimate and authorized reason and an approved secure exchange process.

## Suggested issue labels and triage categories

To make a growing project easier to maintain, bugs can be grouped into consistent categories:

| Category | Examples | Initial investigation |
| --- | --- | --- |
| `startup` | Window does not open, renderer asset missing | App startup logs and asset paths |
| `launch` | Process not found, early exit, native dependency error | Build path, process events, runtime compatibility |
| `download` | Timeout, incomplete file, cancelled transfer | Manifest status, worker logs, destination permissions |
| `content-update` | Unexpected deletion, hash mismatch, invalid manifest | Manifest schema, paths, backup/recovery state |
| `profiler` | Scan fails or fingerprints differ | Directory permissions, algorithm/version, build metadata |
| `auth` | Callback missing, rejected code, expired session | Protocol registration and sanitized response category |
| `integrations` | Discord presence absent, Sentry unavailable | Optional integration config and logs |
| `packaging` | Missing helper or native addon | Packaged resource paths and target ABI |
| `security` | URL validation, TLS, secret exposure | Risk review, reproduction on test data, mitigation |
| `documentation` | Incorrect instructions or stale claims | Compare README with current implementation |

Triage should prioritize data-loss risk, credential exposure, unsafe remote file handling, and false success states above cosmetic issues. A good bug report should identify which subsystem owns the failure and whether any local files changed before the error appeared.

## Additional audit acceptance criteria

For the highest-priority fixes, define observable acceptance criteria rather than simply closing a ticket when code has changed.

| Fix area | Suggested acceptance criteria |
| --- | --- |
| TLS verification | Invalid or untrusted certificates cause the client download to fail; no final DLL is marked ready |
| Redirect handling | Redirect chains are bounded and every destination is validated; the final file is written only after a valid response |
| Callback privacy | Logs and telemetry never include raw authorization codes or full sensitive callback URLs |
| URL opening | Unexpected schemes are rejected and an invalid URL produces a clear, non-crashing error |
| Manifest path containment | Paths are normalized and proven to remain inside the intended content directory before read/write/delete |
| Resumable download | A range response must match the requested offset; a server ignoring Range triggers safe restart rather than blind append |
| Disk writer | Allocation/write/verify have distinct results; allocation failure cannot be reported as verified success |
| Launch outcome | Missing native dependencies and skipped operations cannot emit the same state as a verified successful operation |
| Process closure | One child process generates one terminal UI state even if several Node process events fire |
| Cache robustness | Invalid JSON is handled and recovery does not crash unrelated application features |
| Listener cleanup | Repeated view mounting does not create duplicate event handling |
| Packaging | A clean installation loads the expected assets and native component for the target platform |

These are proposed tests, not statements about tests currently passing. Store any future test outcomes in CI or release documentation so maintainers can distinguish a recommended control from a validated control.



## File-by-file implementation reference

This chapter is a navigation guide for maintainers working from the repository snapshot. It separates source files that can be read directly from generated bundles and compiled binaries that require different audit tools. It also explains what each file contributes to the user-visible launcher flow, what evidence can be inferred statically, and what remains unverified until the relevant workflow is tested.

### `package.json` — package metadata and dependency declaration

The package manifest names the package `era`, uses version `3.0.9` in this snapshot, identifies `app/index.js` as the entry point, and declares the JavaScript dependencies. It includes Electron-oriented packages, React and renderer dependencies, networking clients, error-reporting integrations, Discord RPC, and libraries for graphics, animation, UI components, data fetching, and charts.

The current manifest has no `scripts` section. This is a significant development limitation: there is no npm-defined `start`, `dev`, `build`, or native rebuild command in the checked-in file. A user should not assume a familiar Electron command exists simply because the dependencies are installed. A maintainable project should restore the package scripts and document their required tools.

Before changing dependencies, contributors should identify which runtime version the compiled application expects, whether a lockfile is present in the full repository, and which packages are actually imported by the main bundle or renderer. Avoid upgrading Electron or Node-adjacent dependencies casually while a compiled native addon is checked in; runtime changes can break that addon even when JavaScript still parses.

### `app/index.js` — bundled Electron main process

This is the main application entry point and a large bundled file. Its visible application-specific regions cover the launch manager, profiler, client downloader, content update worker, window and lifecycle management, IPC handlers, user-data cache, Discord RPC, Sentry context, and application updates. The file also contains substantial bundled third-party dependency code, so its total size should not be interpreted as the size of the project's original source logic.

The main process is responsible for privileged work that the renderer cannot safely perform by itself: reading and writing local files, opening system dialogs, coordinating operating-system processes, invoking update functionality, and forwarding result events. A change in this file can therefore have consequences beyond the screen currently visible in the interface.

#### What the main process does

At startup, `app/index.js` requests a single-instance lock and registers the `fluxapp://` protocol used for authentication callbacks. In production it serves the checked-in renderer directory through `electron-serve`; in development it points the window at `http://localhost:5173`. Once Electron is ready, it sets diagnostic context, attempts to start `FortniteLauncher.exe` as a helper, logs in to Discord RPC, and creates the application window. The window is 1160 × 710 pixels, frameless, and non-resizable. Closing all windows quits the app outside macOS and attempts to stop the helper process.

The main process also installs handlers for these groups of renderer requests:

| Group | What the handlers do |
| --- | --- |
| Window and system integration | Minimize/maximize/close the window, return the app version, open external URLs and local folders, show directory pickers, open logs, and check the Windows Visual C++ runtime registry entry. |
| Build library | Check for the expected Fortnite shipping executable and calculate its MD5 digest. |
| Build downloads | Select a destination, start/cancel a manifest-based download through the worker/orchestrator code, and send progress/completion/error events to the renderer. |
| Game launch | Construct the expected Windows game executable path, spawn it with launch arguments and a supplied token, try to inject an environment-specific DLL, and report launch/close events. |
| Build analysis | Walk the PAK and plugin directories and return filename/size and partial SHA-256 fingerprints. The `paks:disable` handler currently calls a stub that only logs the request. |
| Content updates | Fetch a manifest, compare or delete listed files under the build's PAK directory, download requested files, and forward progress. |
| Client DLL | Download an environment-specific DLL into the app's user-data directory and calculate its local fingerprint. |
| Wrapped cache and settings | Read/write Wrapped report and accolade JSON files under Electron's user-data directory, and import a legacy settings file if present. |
| Integrations and diagnostics | Update Discord Rich Presence, attach/clear Sentry user context, record subsystem events, and check/download/install application updates from the configured update feed. |

This is an overview of the code paths, not a claim that each workflow succeeds. Several implementation details deserve attention when running or distributing the app: the window sets `webSecurity: false` and `allowRunningInsecureContent: true`; the client DLL downloader disables HTTPS certificate verification; content-manifest paths are joined to the build directory without an explicit containment check in the visible updater; and the game launch callback can report the injection stage even when the native injector or DLL is missing. The authentication URL is also written to logs in some callback paths. Treat these as concrete review findings and verify/fix them before relying on this build with sensitive accounts or local files.

Recommended maintenance approach:

1. Identify the application-owned section before editing; do not treat bundled dependency code as application source.
2. Trace the corresponding exposed API in `app/preload.js`.
3. Find the matching IPC handler and its success/error behavior.
4. Review filesystem effects, network requests, and process actions.
5. Add a focused test or a reproducible manual test plan.
6. Update this documentation if the public behavior or limitations change.

Because this file is generated/bundled, edits made directly to it may be difficult to review and difficult to reproduce. Recovering the original source and build configuration should be a priority before larger refactors.

### `app/preload.js` — controlled renderer API

The preload exports a single API object and exposes it to the renderer as both `window.electron` and `window.electronAPI`. It groups methods by application/window control, browser opening and callbacks, library paths and hashes, build downloads, runtime checks, Wrapped cache, Sentry, game launch, profiler operations, client downloads, content updates, and generic IPC.

The file is short enough to serve as the first navigation point for user-facing operations. When a UI control appears unresponsive, search for the method it calls, note whether it uses `send` or `invoke`, then follow the named channel into the main process. For subscriptions, confirm that event callbacks are removed when no longer needed.

Important design considerations include:

- Both global aliases point to the same API. New code should use one documented name consistently to avoid unnecessary ambiguity.
- Some helper methods return no unsubscribe function, while other helpers do. This inconsistency can contribute to duplicate events if a component registers a listener repeatedly.
- Some wrappers pass the Electron event object to the callback, while the generic `on` helper removes that event object and passes only the payload. Callback argument shape should be consistent and documented.
- The generic `send`, `invoke`, and `on` helpers allow arbitrary channel names to be passed from the renderer. Keep this surface narrow or replace it with specific methods, and validate all payloads in the main process.
- Paths, URLs, environment labels, credentials, build IDs, and file arrays are inputs, not trusted proof that the requested operation is safe.

### `app/renderer/index.html` — renderer shell

The HTML entry point defines the document language, viewport metadata, a font preconnect and stylesheet request, the title `Era V3`, the renderer root element, and references to compiled JavaScript and CSS assets. The UI is mounted into the root element by the compiled renderer bundle.

The file references a favicon at `./src/favicon.svg`, while the visible checked-in tree is centered on compiled assets. Verify that the referenced icon exists in the actual checkout or package; if it does not, the browser may request a missing resource. The script and stylesheet use hashed asset names, so those paths must be regenerated alongside the renderer build rather than renamed by hand.

The HTML shell is intentionally small. It does not describe the renderer's full component hierarchy or prove which screens are interactive. Those details are contained in the compiled renderer JavaScript and need to be traced from the relevant UI events.

### `app/renderer/assets/index-Cmjydc3O.js` — compiled interface

This is the main compiled renderer bundle. It contains generated application UI code and may include bundled dependencies. Because it is minified or generated, direct editing is not a sustainable development method: names are shortened, source module boundaries may be lost, and an asset rebuild can overwrite manual changes.

For UI maintenance, recover the source components and original build process wherever possible. If only the bundle is available, make a copy before analysis, search for exact strings or labels, and verify any inferred UI path against the preload API. Do not assume a string appearing in the bundle is necessarily reachable in the current screen.

### `app/renderer/assets/index-ByT-tuHS.css` — generated styling

The stylesheet is a large compiled CSS asset. It supplies styling for the renderer rather than the application’s main-process behavior. Style changes should ideally be made in the original CSS or component source and regenerated. Changes to the compiled file can affect all screens that share the corresponding class names and may disappear during a future build.

### Renderer artwork and 3D assets

The asset directory includes images, icons, a GLB 3D asset, and other UI resources with generated or hashed filenames. Filenames indicate which files are included, but they do not establish which views reference them at runtime. Before deleting an apparently unused asset, search the compiled bundle and HTML/CSS references and test a complete packaged launch.

Binary assets should be included in release review and tracked intentionally. Avoid replacing them with untrusted downloads or committing user data embedded in screenshots or image metadata.

#### Checked-in renderer asset inventory

The following inventory reflects the files and approximate sizes in this checkout. Descriptions are based on filenames and file type; confirm actual usage by searching the bundle before treating an asset as tied to a specific screen.

| Asset | Approx. size | Likely role / notes |
| --- | ---: | --- |
| `index-Cmjydc3O.js` | 7.05 MB | Compiled React renderer, application screens, state and service integration, plus bundled dependencies. |
| `index-ByT-tuHS.css` | 151 KB | Compiled renderer stylesheet, including utility classes, theme styling, responsive rules, and animations. |
| `card-BP4TWJmK.glb` | 2.46 MB | Binary glTF 3D model; inspect renderer references and the model in a viewer to establish its exact scene role. |
| `quest-B-roHW7d.png` | 938 KB | Quest-themed artwork by filename. |
| `stairs-BnjnJdH2.png` | 82 KB | Stair/building-themed artwork by filename. |
| `currency-CQhm-UnH.png` | 21 KB | Currency icon or artwork by filename. |
| `wood-DfFKJk3w.png` | 24 KB | Wood/material artwork by filename. |
| `era-logo-01-DShvfrht.png` | 13 KB | Era logo artwork. |
| `lanyard-O8bUCbw4.png`, `lanyard-founder-GsGH-rjX.png` | 11 KB each | Lanyard and founder-lanyard artwork by filename. |
| `victory-royale-C4nMOp_3.png` | 11 KB | Victory Royale artwork by filename. |
| `ar-DDa27CbB.png` | 10 KB | Small AR-themed image or icon by filename. |
| `sniper-D-iSN9Tw.png`, `smg-C-5YEhyV.png`, `shotgun-Dj-AEatf.png`, `rocket-BEmy1qe8.png` | 7–11 KB each | Weapon-themed artwork by filename. |

The renderer HTML currently references `/assets/index-Cmjydc3O.js` and `/assets/index-ByT-tuHS.css`, while the logo and other artwork are expected to be referenced from the compiled bundle or styles. The HTML also points its favicon at `./src/favicon.svg`; that path is not present in the checked-in renderer file listing, so verify whether packaging supplies it or update the HTML/build output to a real icon. Keep the HTML references synchronized with hashed asset names after rebuilding.

#### Reading the compiled JavaScript bundle

At about 7 MB, the renderer bundle is a production artifact rather than a maintainable source tree. Application code and third-party code are packed together, and minification obscures component and variable names. The routes, service calls, authentication state, realtime subscriptions, and preload calls described in this README are observations from static inspection; a string or route definition alone does not prove that a user can reach the feature or that its backend operation succeeds.

For a focused investigation, search distinctive UI labels and route paths, then trace the surrounding code to its data hook or event handler. Follow privileged actions from the renderer through `app/preload.js` to the matching `ipcMain` listener in `app/index.js`; follow API calls to their request client and response/error handling. For asset usage, search exact filenames and inspect the related component/style context. Do not infer the role of embedded dependency strings or source-map fragments as application features.

The bundle may also contain implementation details that should be treated carefully during publication, such as service hostnames, telemetry configuration, OAuth flow metadata, or diagnostic messages. Review these values before making a repository public, and never commit live credentials or user-specific data. Reproducible source files and build tooling are preferable to editing the generated bundle directly.

### `app/workers/diskWriterWorker.js` — file allocation and chunk I/O

This worker uses Node's worker-thread message interface and synchronous filesystem operations. It maintains open file handles in a map, creates or opens destinations, prepares files to expected sizes, writes chunk buffers at offsets, verifies requested regions using an MD5 digest, and handles a shutdown message by attempting to sync and close handles.

The visible message protocol includes `allocate`, `write`, `verify`, and `shutdown`, and the worker announces readiness after attaching its listener. For task-oriented messages, it can return completion information including file and chunk indices, or report an error with those indices.

There are correctness details to preserve when this worker is modified. Allocation errors are caught inside the allocation helper; the caller must not assume that no thrown exception means successful allocation. The write path reports a completion flag that should not be confused with cryptographic verification. Verification is performed by a separate message type. The parent orchestrator must reconcile the responses rather than treating every `completed` message as identical.

### `app/workers/downloadWorker.js` and `downloadWorkerPooled.js`

These are large generated/bundled worker files. Their presence indicates that download work can be performed through worker implementations, including a pooled variant. They are large enough to contain bundled utility or dependency code, so the complete file size is not evidence of the size of the download algorithm itself.

The exact number of active downloads, chunk scheduling policy, cancellation guarantees, and fallback behavior should be confirmed by tracing the orchestrator code in the main bundle. Do not document a guaranteed level of concurrency based solely on the word "pooled" in a filename. A production downloader should bound requests and buffers, associate each chunk with a task ID, handle worker exits, and refuse to complete a build while required chunks remain unverified.

### `app/binaries/FortniteLauncher.exe` — Windows helper binary

This checked-in executable is a Windows binary that the main process attempts to launch from a packaged resource path as a helper process. It is not source code and cannot be audited fully by reading the README or a JavaScript file. Its origin, signature, checksum, expected behavior, and licensing/redistribution status should be recorded by the maintainers.

The main process also tries to stop its tracked helper process when the application exits through the relevant window lifecycle path. That shutdown behavior should be verified on each supported platform and package format. Do not infer a Linux-native implementation from the presence of this Windows executable.

### `app/build/Release/dll_injector.node` — compiled native module

The native addon is loaded by the Electron main process and is involved in the launch flow. It is a compiled binary, not a readable JavaScript module. Its compatibility depends on target operating system, CPU architecture, Electron/Node ABI expectations, required runtime libraries, and the code that calls its exports.

The README can document the location and role of the module but cannot certify the behavior of its compiled code without additional binary/source analysis and runtime tests. Future releases should record a trusted digest and build provenance for this artifact. A missing or incompatible addon must produce an explicit unavailable/failure state, not a success-looking launch result.

## Source-to-feature tracing guide

The following examples describe how to trace a user-visible feature across the repository without assuming the UI and main process are always synchronized.

### Trace a build download

1. Find the renderer action that calls `startDownload`.
2. Inspect the payload fields: build UUID, manifest URL, destination, and build metadata.
3. Follow `startDownload` in the preload bridge to the `download:start` IPC event.
4. Locate the main-process handler for that event.
5. Trace how the final destination is chosen and the orchestrator is initialized.
6. Identify how progress reaches the renderer and whether progress is per-file or overall.
7. Follow cancellation into the active orchestrator and confirm workers actually stop.
8. Inspect how errors reset the desktop progress bar and notify the UI.
9. Verify final file integrity and the final result event before calling it a successful download.

This is a trace checklist, not evidence that every state has already been tested.

### Trace a content update

1. Start with `checkForContentUpdate` in the preload bridge.
2. Follow the `content-update:check` handler in the main process.
3. Inspect the manifest fetch helper and its retry/timeout behavior.
4. Confirm the schema expected for `changes`, file names, sizes, hashes, and change types.
5. Check path normalization before any local file operation.
6. Check the rules for skipping an existing file, downloading a new file, or deleting a file.
7. Inspect the byte-range handling for partial downloads.
8. Confirm that final size and hash are checked before completion is reported.
9. Review the cancellation and rollback behavior for failure halfway through the update.

### Trace a profiler request

1. Find the UI caller of `analyzePaks`.
2. Follow the `profiler:analyze` event and its main-process handler.
3. Confirm the build path is the expected local build root.
4. Check which directories are traversed and how inaccessible folders are reported.
5. Confirm which hash implementation generated each column in the result.
6. Verify the renderer knows the fingerprint algorithm/version and does not compare unlike values.
7. Confirm that partial scan results are labeled as partial rather than complete.

### Trace authentication callbacks

1. Identify where the application initiates the supported login flow.
2. Check how the custom `fluxapp` protocol is registered in development versus packaged mode.
3. Follow the `open-url` handler and confirm malformed URLs are caught.
4. Check whether callbacks arriving before window creation are queued safely.
5. Confirm that the raw code is never written to logs.
6. Confirm the renderer receives only the required callback data.
7. Test exchange errors, expired callbacks, cancellation, and successful session validation with authorized development credentials.

## Implementation status by confidence level

Use a status vocabulary that prevents planned behavior from being confused with verified behavior. Suggested labels are:

| Label | Meaning | Evidence required |
| --- | --- | --- |
| Code present | A relevant function or IPC route is present | Static source/bundle inspection |
| Connected | The UI/preload/main handlers are wired together | Trace the full call path |
| Runtime-tested | The code path was executed in a stated environment | Reproducible test result |
| Failure-tested | One or more expected failures were exercised | Test logs and expected outcomes |
| Security-reviewed | Inputs, filesystem effects, network trust, and secrets were reviewed | Review notes and remediation status |
| Incomplete/stub | The function does not perform the advertised operation yet | Direct implementation inspection |
| Unsupported | No compatible implementation is available for the target | Platform and dependency evidence |

A feature may have more than one useful status. For example, a download IPC route may be code-present and connected while still not runtime-tested in the current environment. Avoid a single generic "working" label when it obscures these differences.

## Recommended remediation plan, ordered by risk

This plan proposes an order for future code fixes. It does not claim that the fixes have already been made.

### P0 — Protect credentials and downloaded binaries

- Stop logging raw authentication authorization codes and sanitize callback URLs before logging.
- Restore TLS certificate validation for client downloads.
- Restrict client download URLs and validate redirect destinations.
- Verify downloaded binaries using a trusted digest or signature before treating them as available.
- Review static token-like launch configuration and ensure no reusable secret is committed or passed unnecessarily through command-line arguments.

### P1 — Prevent unintended filesystem changes

- Normalize and validate manifest file names before creating, reading, replacing, or deleting files.
- Ensure every resolved target remains inside the selected build's allowed content directory.
- Verify byte-range response headers before appending to a partial file.
- Validate manifest shape, file sizes, change types, duplicate paths, and expected digests before mutating the build.
- Make destructive updates recoverable, or clearly warn when a rollback is unavailable.

### P1 — Make results truthful

- Give launch operations structured results for process creation, dependency status, and observed termination.
- Do not report injection or launch success when a required dependency was skipped.
- Make close handling idempotent so multiple process events produce one terminal UI state.
- Separate disk allocation, write, chunk verification, and full-file verification results.
- Ensure an allocation error cannot be followed by a success message that says the file is verified.

### P2 — Improve observability and maintainability

- Standardize IPC payload/result contracts and error formats.
- Make every listener registration return an unsubscribe function.
- Avoid generic IPC routes when a specific safe method is sufficient.
- Add tests for retry behavior, malformed manifests, network interruptions, and cache corruption.
- Recover source files and repeatable build scripts for the bundled renderer and main process.
- Record supported runtime/ABI combinations and build provenance for native binaries.

### P3 — Improve developer experience

- Add a tested setup guide and scripts for development, linting, tests, and packaging.
- Add CI checks for JavaScript syntax, source formatting, generated artifacts, and dependency review.
- Keep the contents list synchronized with the section headings.
- Include a small synthetic manifest and fixture files for safe update/profiler tests.
- Add release notes that identify the exact features tested and the limitations that remain.

## Maintainer checklist for the next release

Use this checklist for a future release candidate. Items should only be marked complete when there is evidence from the target build.

- [ ] The package scripts and build process are available from a clean checkout.
- [ ] The supported Electron, Node, operating system, and architecture matrix is published.
- [ ] The helper executable and native addon have verified provenance.
- [ ] The client downloader uses normal TLS validation and safely handles redirects.
- [ ] Authentication codes and sensitive URLs are redacted in logs.
- [ ] External browser URLs are checked against an explicit scheme policy.
- [ ] Manifest paths cannot escape the intended build directory.
- [ ] Resumed downloads verify that the server returned the requested byte range.
- [ ] Full-file integrity is verified with a trusted expected digest or signature.
- [ ] Cancellation closes network streams, worker tasks, and file handles.
- [ ] Failure events never look like successful completion events.
- [ ] The same process does not cause repeated terminal launch notifications.
- [ ] The PAK-disable stub is clearly marked in the UI or completed and tested.
- [ ] Corrupt caches and missing optional integrations do not crash the application.
- [ ] Logs and telemetry do not contain secrets or unnecessary personal data.
- [ ] A clean installation and the documented update workflow have been tested.
- [ ] The README describes what was actually tested, not only intended behavior.

## What static documentation can and cannot prove

The README is based on visible code, declarations, and file structure. It can explain which handlers exist, how they are wired, what inputs they appear to use, and what error-handling patterns are visible. Static inspection cannot prove that a remote API is currently online, that a provided credential is valid, that a native binary behaves safely, or that a game build is accepted by an external service.

For this reason, future audit notes should cite the relevant file and function, identify the evidence type, and distinguish a confirmed code pattern from a hypothesis that requires a runtime test. A good issue should include a minimal reproduction and sanitized evidence. Large output dumps, secrets, private service data, and full proprietary game content should not be attached.

When a limitation is fixed, remove or revise the old warning only after confirming the replacement behavior. When a new feature is added, list its entry point, inputs, outputs, platform assumptions, data changes, error states, and test coverage. Keeping that evidence attached to the documentation will make the next README expansion more accurate and useful.


## Final notes

Era combines a desktop interface with game-build downloads, local file analysis, process launch coordination, deep-link handling, telemetry, and third-party integrations. The project has a substantial bundled application implementation, but a useful technical README must explain both the intended workflows and the concrete limits of the checked-in code.

The most important next steps are to restore a maintainable source/build setup, improve validation around manifests and file operations, correct the client downloader's TLS verification behavior, document supported platforms precisely, and add tests for the launch and download lifecycles.

Documentation should evolve with the source. When a function is implemented, tested, or removed, update the feature table and troubleshooting notes so that users and contributors can tell the difference between an available interface, an implementation present in code, and a workflow verified in practice.

---

**Repository:** [troon-dev/Era-Code](https://github.com/troon-dev/Era-Code)  
**Main package entry point:** `app/index.js`  
**Package version in this snapshot:** `3.0.9`

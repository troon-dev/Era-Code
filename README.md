# Era Launcher

> **A detailed guide to the Era desktop application, its launcher architecture, download pipeline, local build tools, integrations, development setup, and implementation status.**

Era is a desktop application built with **Electron** and a React-based renderer. The repository contains a bundled application entry point, renderer assets, native Node.js components, download workers, and the supporting files used by the Era launcher.

The application metadata in the checked-in `package.json` identifies the package as `era`, version `3.0.9`, with `app/index.js` as its main entry point. The visible application is designed around Era services and local Fortnite build management. Its actual behavior depends on the bundled code, the installed native components, the local Windows/game environment, and external services or manifests provided while it is running.

This document is intentionally detailed. It explains the purpose of each major subsystem, how the pieces communicate, how to approach common errors, and which advertised operations are still incomplete in the checked-in revision. **It does not claim that every feature has been tested or that every workflow works on every machine.**

---

## Contents

- [Project at a glance](#project-at-a-glance)
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
- [Privacy, telemetry, and support workflow](#privacy-telemetry-and-support-workflow)
- [Suggested issue labels and triage categories](#suggested-issue-labels-and-triage-categories)
- [Additional audit acceptance criteria](#additional-audit-acceptance-criteria)
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
Era-Code-Malware/
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
git clone https://github.com/troon-dev/Era-Code-Malware.git
cd Era-Code-Malware
```

If you already have a local checkout, inspect the branch and working tree before pulling changes:

```bash
git status
git branch --show-current
git pull
```

When investigating a bug, record the commit you tested. Two copies of the same project can behave differently if they use different branches, dependencies, native modules, or external manifests.

## Installing dependencies

Install dependencies from the project root:

```bash
npm install
```

Then inspect the scripts declared by the current package:

```bash
npm run
```

The checked-in `package.json` in this snapshot defines the package entry point and dependencies but does not declare a `start`, `dev`, `build`, or native-rebuild script. Do not assume a command exists because it is common in other Electron projects. Use the actual scripts supplied by the revision you have.

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

Because the current package has no declared launch script, start by inspecting the package metadata and entry file rather than guessing an npm command.

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

For runtime troubleshooting, use the intended Electron packaging/development setup for the exact revision. Since the original build scripts are absent from this package snapshot, obtaining the original source tree or packaging configuration may be necessary to reproduce the official development workflow.

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
| `openDirectory()` | `library:open-directory` | Opens a directory picker |
| `shippingHash(path)` | `library:get-hash` | Requests a hash for the shipping executable |
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


## Final notes

Era combines a desktop interface with game-build downloads, local file analysis, process launch coordination, deep-link handling, telemetry, and third-party integrations. The project has a substantial bundled application implementation, but a useful technical README must explain both the intended workflows and the concrete limits of the checked-in code.

The most important next steps are to restore a maintainable source/build setup, improve validation around manifests and file operations, correct the client downloader's TLS verification behavior, document supported platforms precisely, and add tests for the launch and download lifecycles.

Documentation should evolve with the source. When a function is implemented, tested, or removed, update the feature table and troubleshooting notes so that users and contributors can tell the difference between an available interface, an implementation present in code, and a workflow verified in practice.

---

**Repository:** [troon-dev/Era-Code-Malware](https://github.com/troon-dev/Era-Code-Malware)  
**Main package entry point:** `app/index.js`  
**Package version in this snapshot:** `3.0.9`

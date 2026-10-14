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

## Final notes

Era combines a desktop interface with game-build downloads, local file analysis, process launch coordination, deep-link handling, telemetry, and third-party integrations. The project has a substantial bundled application implementation, but a useful technical README must explain both the intended workflows and the concrete limits of the checked-in code.

The most important next steps are to restore a maintainable source/build setup, improve validation around manifests and file operations, correct the client downloader's TLS verification behavior, document supported platforms precisely, and add tests for the launch and download lifecycles.

Documentation should evolve with the source. When a function is implemented, tested, or removed, update the feature table and troubleshooting notes so that users and contributors can tell the difference between an available interface, an implementation present in code, and a workflow verified in practice.

---

**Repository:** [troon-dev/Era-Code-Malware](https://github.com/troon-dev/Era-Code-Malware)  
**Main package entry point:** `app/index.js`  
**Package version in this snapshot:** `3.0.9`

# Era

**Era Launcher — desktop client for Era services**

Era is an Electron desktop application with a React-based interface for managing Fortnite builds and related Era services. This repository contains the application bundle, native launcher component, download workers, and UI assets.

> **Important:** this project includes a native DLL-injection module and code that interacts with Fortnite game files/processes. Review the source and only run it in an environment and with software you are authorized to modify. Do not use it to evade anti-cheat, bypass access controls, or violate a game's terms. The presence of a feature in the code does not mean it is complete or guaranteed to work.

## What it does

### Launcher and game process
- Provides a launch flow that accepts a local build path and launch context from the UI.
- Tracks launch state and reports launch results and game-close events back to the interface.
- Loads the native `dll_injector.node` module when available; the launch path calls into the native launcher manager and logs injection results.
- Includes `app/binaries/FortniteLauncher.exe`, which the main process attempts to start as a helper/dummy process when the application becomes ready.
- Exposes a force-quit action for the launched game.

**Compatibility note:** the native injector is a compiled binary and is platform/ABI-sensitive. Its presence alone does not establish that launch or injection will succeed on every Windows version, game build, or system configuration.

### Build downloads and content updates
- Lets the user select a destination folder for build downloads.
- Starts and cancels downloads through Electron IPC and reports progress to the UI.
- Includes dedicated download workers and a disk-writing worker for download/file handling.
- Supports a client-download flow and a content-update check that compares a supplied content URL with a local build path.
- Uses the Electron window progress bar while a build download is active.

The actual availability of a build depends on the URLs, metadata, and services supplied to the application; this repository does not guarantee that a server or downloadable build is available.

### Build inspection and local files
- Can analyze files in a local Fortnite build and return analysis results to the interface.
- Includes a client-fingerprint function that computes a fingerprint from a selected environment and local client/DLL data.
- Exposes a shipping-hash operation for a selected path.
- Has an interface for disabling selected PAK files, but the current implementation of `disablePaks()` only logs the request. **Do not treat PAK disabling as implemented functionality in this revision.**

### Account, app, and integrations
- Handles an authentication callback URL and passes the returned authorization code to the UI. This callback handler alone does not document or guarantee the full account-authentication flow.
- Opens external URLs in the system browser.
- Includes manual update-check and install/restart handling through `electron-updater`.
- Checks for the Microsoft Visual C++ Redistributable.
- Integrates Discord Rich Presence.
- Integrates Sentry error reporting/telemetry.
- Caches “Wrapped” reports and accolades locally.
- Provides app window controls, log access, and directory selection.

## Repository layout

| Path | Purpose |
| --- | --- |
| `app/index.js` | Bundled Electron main process and application logic |
| `app/preload.js` | Exposes the renderer's controlled Electron API through the context bridge |
| `app/renderer/` | Renderer HTML, compiled UI assets, images, and 3D assets |
| `app/workers/downloadWorker.js` | Bundled download/network worker |
| `app/workers/downloadWorkerPooled.js` | Alternate pooled download worker |
| `app/workers/diskWriterWorker.js` | Disk-writing worker |
| `app/binaries/FortniteLauncher.exe` | Windows helper executable used by the main process |
| `app/build/Release/dll_injector.node` | Compiled native Node addon used by the launch/injection path |
| `package.json` | App metadata and JavaScript dependencies |

Much of the application is committed as bundled/minified output rather than original TypeScript/React source, which makes some behavior harder to audit and modify.

## Requirements

- Node.js and npm compatible with the versions supported by the dependencies.
- A supported desktop environment for Electron.
- For the native launch component, a compatible build of `dll_injector.node` and the required Windows/game environment.
- Network access for services, downloads, authentication, updates, and optional integrations.

The checked-in native addon and Windows helper are not cross-platform. A Linux build is **not** implied by the presence of Electron or JavaScript files.

## Run from source

1. Install a supported Node.js LTS release.
2. Clone this repository and enter the project directory.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Inspect `package.json` for the scripts available in this checkout before running the application:
   ```bash
   npm run
   ```

The repository snapshot does not declare a `start`, `dev`, `build`, or native-rebuild script in `package.json`; do not assume those commands exist without checking the scripts for your revision. The checked-in `app/index.js` is a bundled entry point, not the original source tree.

## Security and privacy notes

- Inspect the code and binaries before running them; a README cannot certify a binary as safe.
- The app contains network/download functionality, authentication callback handling, Sentry integration, and a native DLL-injection component. Understand these behaviors and the services they contact before use.
- Never share session tokens, authorization codes, logs containing secrets, or account credentials in bug reports.
- Use only builds and game files you are permitted to access and modify.

## Current implementation caveats

- `disablePaks()` currently logs the request rather than disabling files.
- The launch/injection flow depends on a compiled native addon and an appropriate runtime/game environment.
- Authentication callback handling is visible, but a complete end-to-end authentication guarantee cannot be inferred from the callback handler alone.
- Downloading and content updates depend on external URLs and metadata supplied at runtime.
- This documentation describes behavior visible in the checked-in code; it is not a claim that every feature works in every environment.

## Contributing and bug reports

When reporting a problem, include the operating system, Node.js/npm versions, the exact steps to reproduce, relevant sanitized logs, and the build/version involved. Remove tokens, authorization codes, personal data, and other secrets first.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build / dev (TypeScript MCP server)

```bash
npm install
npm run build         # tsc → dist/
npm run watch         # tsc --watch
npm run dev           # build + start (stdio MCP server)
npm start             # node dist/index.js
npm run build:lite    # build root + packages/lite
npm run build:desktop # gradle installDist for desktop-companion
npm run build:all     # build + build:desktop
```

The TypeScript build is published as the `claude-in-mobile` npm package (entry `dist/index.js`, started over stdio). `postinstall` symlinks the repo into its own `node_modules/claude-in-mobile` so the `packages/lite` workspace can import it as a sibling package.

### Test (Vitest)

```bash
npx vitest run                                  # all tests once (CI mode)
npx vitest                                      # watch mode (also: npm run test:watch)
npx vitest run src/tools/flow-tools.test.ts     # single file
npx vitest run -t "name of the test"            # by test name
```

Tests live next to source as `*.test.ts` (configured in `vitest.config.ts`). They're excluded from the production `tsc` build via `tsconfig.json`. CI runs `npx tsc --noEmit` for typecheck plus `npx vitest run` on Node 20 and 22 (`.github/workflows/ci.yml`).

### Native CLI (Rust)

```bash
cd cli && cargo build --release      # → cli/target/release/claude-in-mobile
cargo test
```

The Rust CLI in `cli/` is an independent ~2 MB binary; it does NOT share code with the TypeScript server. Releases are tag-driven (`v*.*.*` → `.github/workflows/release.yml`) and produce darwin-arm64 / darwin-x86_64 tarballs that auto-update the Homebrew tap.

### Desktop companion (Kotlin/JVM)

```bash
cd desktop-companion && ./gradlew installDist    # macOS-only; JDK 17+
```

Launched on demand by `DesktopAdapter` to drive macOS apps over JSON-RPC. Path overrideable via `MOBILE_TOOLS_COMPANION`.

## Architecture

This repo ships **three independent products** plus a Kotlin sidecar:

1. **`/src` — Full MCP server** (`claude-in-mobile` on npm). Stdio MCP server with 16 meta-tools across 5 platforms.
2. **`/packages/lite` — Lite MCP server** (`claude-in-mobile-lite`). 12 atomic tools, ~600-token schema, for small local LLMs (Llama 3 8B, Phi-3, etc.). Imports adapters/clients from the full package via the workspace symlink.
3. **`/cli` — Rust CLI** (`claude-in-mobile` binary). Separate codebase; same UX surface but no Node.js dependency. Distributed via Homebrew/release tarballs and shipped with a Claude Code skill in `cli/plugin/skills/`.
4. **`/desktop-companion` — Kotlin/JVM helper** for macOS desktop automation (JNA + accessibility APIs). Spawned by the TS server when the desktop module is used.

When changing behavior that's user-visible across products, consider whether the lite package and Rust CLI also need updates.

### Meta-tool dispatch (the central pattern in `/src`)

The server exposes **meta-tools** like `device`, `input`, `screen`, `ui`, `app`, `system`, `flow`, `browser`, `desktop`, `store`, `visual`, `recorder`, `sync`, `accessibility`, `performance`, `autopilot`. Each takes an `action` string (e.g. `input(action:'tap', x:100, y:200)`) which routes to an underlying handler.

Flow:
- `src/index.ts` is the MCP entry point. It reads `MOBILE_PROFILE` env, decides which meta-tools start visible vs hidden, and registers them.
- `src/tools/meta/*-meta.ts` defines each meta-tool. They're built by `src/tools/meta/create-meta-tool.ts`, which merges underlying tools' input schemas and dispatches by `action`.
- Underlying handlers live in `src/tools/*-tools.ts` (`device-tools.ts`, `interaction-tools.ts`, `screenshot-tools.ts`, etc.). Don't add new top-level tools — extend an existing meta-tool by adding a handler and exposing the action.
- `src/tools/registry.ts` maintains `toolMap`, `aliasMap`, `hiddenTools`, `manuallyDisabled`, and `lazyModules`. After init it is **frozen** (`freezeRegistry()`); no further tool registration is allowed (alias registration is still open for client-specific aliases). Hidden modules notify clients via `notifyToolListChanged` when they appear/disappear.
- Backward-compat aliases (`tap` → `input(action:'tap')`, `screenshot` → `screen(action:'capture')`, etc.) are registered with default args via `registerAliasesWithDefaults`. **Preserve these** — published clients depend on them.

### Profiles & lazy modules

`src/profiles.ts` defines five profiles (`minimal`, `core`, `android`, `web`, `full`) selected by the `MOBILE_PROFILE` env var (default `core`). The profile picks the **startup-visible** module set; `device` and `screen` are `ALWAYS_VISIBLE`. The LLM can call `device(action:'enable_module', module:'browser')` (or `category:'platform'`) at runtime to unhide more. `device(action:'disable_module')` sets `manuallyDisabled` so auto-enable on first use won't bring the module back.

When adding a new meta-tool: register it in `src/index.ts`'s `allMetaTools` map, add module metadata to `MODULE_METADATA` in `src/profiles.ts`, and decide which profiles see it by default in `PROFILE_VISIBLE`.

### Platform adapters (capability-segregated ISP)

`src/adapters/platform-adapter.ts` splits the platform contract into focused interfaces instead of one God interface:

- `CorePlatformAdapter` — every platform: list/select devices, tap/swipe/text, screenshot, ui hierarchy, system info.
- `AppManagementAdapter` — `launchApp`, `stopApp`, `installApp` (Android/iOS/Aurora/Desktop, **not** Browser).
- `PermissionAdapter` — grant/revoke/reset (Android + iOS only).
- `ShellAdapter` — shell, logs, clearLogs (Android/Aurora).
- `SyncScreenshotAdapter` — legacy synchronous screenshot.

Concrete adapters in `src/adapters/{android,ios,desktop,aurora,browser}-adapter.ts` implement only what they support. Consumers use type guards (`hasAppManagement`, `hasPermissions`, `hasShell`, `hasSyncScreenshot`) to narrow before calling. The legacy `PlatformAdapter` intersection alias still exists but is deprecated — prefer the segregated interfaces in new code.

`src/device-manager.ts` is a thin routing layer (~230 LOC) that holds `Map<Platform, CorePlatformAdapter>` and an active target. Platform-specific work belongs in adapters or in the underlying clients (`src/adb/`, `src/ios/`, `src/desktop/`, `src/aurora/`, `src/browser/`).

### Tool context

`src/tools/context.ts` is a façade that wires the singleton `DeviceManager` and re-exports state from submodules:

- `context/shared-state.ts` — per-platform caches: `lastScreenshotMap`, `lastUiTreeMap`, `screenshotScaleMap`, `getCachedElements`, `setCachedElements`, `invalidateUiTreeCache`. **Mutate caches through these helpers**, not directly — hint generation and diff features depend on them.
- `context/hints.ts` — generates the post-action UI-diff "hints" that are appended to most tool responses (the `hints:false` opt-out exists in many tool args for rapid sequences).
- `context/ios-helpers.ts` — iOS accessibility tree parsing.

Every handler signature is `(args, ctx: ToolContext, depth?: number)`. `ctx.handleTool` re-enters the dispatcher; this is how `flow_batch` / `flow_run` / `flow_parallel` recurse. `MAX_RECURSION_DEPTH = 3` is enforced in `src/index.ts`.

### Errors, retries, and metrics

- All thrown errors should subclass `MobileError` from `src/errors.ts` (e.g. `DeviceNotFoundError`, `AdbNotInstalledError`). The `code` field drives retry config and recovery hints.
- `src/index.ts` retries only at depth 0 (top-level MCP calls) for transient codes: `DEVICE_OFFLINE` (3×), `COMMAND_TIMEOUT`/`ADB_ERROR`/`SYNC_BARRIER_TIMEOUT` (2×). Inner recursive calls don't retry.
- `getGlobalMetrics()` records every call's duration and error flag. Surface via `system(action:'metrics')` / `system(action:'reset_metrics')`.
- `src/utils/anti-patterns.ts` records call sequences to flag wasteful patterns (e.g. screenshot after every tap).

### Module boundaries to respect

- **Don't import across product boundaries** other than the documented `claude-in-mobile/*` exports defined in root `package.json` (`./adapters/*`, `./adb/*`, `./ios/*`, `./desktop/*`, `./tools/registry`, `./tools/helpers/*`, `./tools/context/*`, `./errors`, `./device-manager`). The lite package consumes these stable surfaces; deep imports outside this list will break it.
- The Rust CLI and TypeScript server are independent — keep them in sync at the **CLI command surface** level only, not source.

## Conventions

- **ESM with NodeNext.** `package.json` has `"type": "module"`. Every relative import inside `/src` MUST end in `.js` (not `.ts`) — TypeScript resolves these correctly under `moduleResolution: "NodeNext"`. Example: `import { foo } from "./bar.js";`
- **Strict TypeScript.** `tsconfig.json` enables `strict`. Don't add `// @ts-ignore` to silence — fix the type.
- **Tests are colocated** as `*.test.ts` next to the source, excluded from `tsc` output.
- **Version is single-sourced** from root `package.json` (read at runtime in `src/index.ts`). The Rust `cli/Cargo.toml` and `Formula/claude-in-mobile.rb` are bumped by the release workflow — bump root `package.json` first.
- **Don't hand-edit** `Formula/claude-in-mobile.rb` SHA256s; the release workflow rewrites them.

## Environment variables

| Var | Effect |
|---|---|
| `MOBILE_PROFILE` | `minimal` \| `core` (default) \| `android` \| `web` \| `full` — startup tool set |
| `ADB_PATH` | Override ADB binary location (else `$ANDROID_HOME`/`$ANDROID_SDK_ROOT`/OS defaults/`PATH`) |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | ADB discovery |
| `DEVICE_ID` / `ANDROID_SERIAL` | Pin Android device |
| `IOS_DEVICE_ID` | Pin iOS simulator |
| `WDA_PATH` | WebDriverAgent location (else Appium's bundled copy is auto-built on first iOS UI call) |
| `CHROME_PATH` | Chrome binary for browser module (else auto-detect) |
| `MOBILE_TOOLS_COMPANION` | Path to desktop-companion binary |

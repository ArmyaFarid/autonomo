# MISTAKES.md — ArmyaFacturation

> Read this file at the start of every session. Every entry here is a mistake that was made and corrected. Never repeat any of these. When a new mistake is identified and fixed during a session, append it immediately at the bottom of this file.

---

## Format

Each entry follows this structure:

```
### [MM/YYYY] — Short title
**Context:** What was being worked on
**Mistake:** What went wrong
**Fix:** How it was corrected
**Rule:** What to always do instead
```

---

## Log

### [04/2026] — electron-vite config requires explicit entry points
**Context:** Phase 1 project init — running `npm run build` for the first time
**Mistake:** `electron.vite.config.ts` had no `build.rollupOptions.input` — electron-vite errored: "An entry point is required"
**Fix:** Added explicit `build.rollupOptions.input` with the file path for each target (main, preload, renderer)
**Rule:** Always specify `build.rollupOptions.input` for all three targets in electron-vite config

### [04/2026] — renderer HTML script path must be relative when root is `src/`
**Context:** Phase 1 — renderer build failing after fixing the entry point error
**Mistake:** `src/index.html` had `<script src="/src/main.tsx">` — fails because the vite root is already `src/`, so the absolute path `/src/main.tsx` doesn't resolve
**Fix:** Changed to `<script src="./main.tsx">` (relative)
**Rule:** When electron-vite renderer root is set to `src/`, use relative paths in index.html, never absolute `/src/...` paths

### [04/2026] — drizzle-orm 0.30.x ships broken internal .d.ts references
**Context:** Phase 1 — TypeScript check on main process code
**Mistake:** `tsc --noEmit` on tsconfig.node.json failed with errors about `mysql2/promise` and `bun-types` not found — these come from drizzle-orm's own declaration files, not our code
**Fix:** Added `"skipLibCheck": true` to tsconfig.node.json
**Rule:** Always use `skipLibCheck: true` in tsconfig.node.json for this project — drizzle-orm's internal types reference optional peer dependencies that aren't installed

### [04/2026] — package.json "main" must match electron-vite output path
**Context:** Phase 1 — running `npm run dev`
**Mistake:** `package.json` had `"main": "dist-electron/main.js"` but electron-vite outputs to `out/main/index.js` by default — Electron couldn't find its entry file
**Fix:** Changed to `"main": "out/main/index.js"`
**Rule:** Always set `"main": "out/main/index.js"` in package.json when using electron-vite with default output config

### [04/2026] — better-sqlite3 must be rebuilt against Electron's Node + requires v12+
**Context:** Phase 1 — first `npm run dev`, app crashes on startup
**Mistake:** `better-sqlite3` is a native module compiled for the system Node.js (NODE_MODULE_VERSION 115) but Electron 30 uses a different ABI (NODE_MODULE_VERSION 123). Additionally, v9.4.3 has a V8 `SetAccessor` API incompatibility with Electron 30 that causes a compile error.
**Fix:** Upgraded to `better-sqlite3@12.9.0` (first version compatible with Electron 30 V8 API), then rebuilt with `electron-rebuild -f -w better-sqlite3`. Added `"postinstall": "electron-rebuild -f -w better-sqlite3"` to package.json scripts so this runs automatically.
**Rule:** Always use `better-sqlite3 >= 12.x` with Electron 30. Always have `postinstall` run `electron-rebuild` for any native module.

### [04/2026] — preload path must match electron-vite output filename
**Context:** Phase 1 — app stuck on "Chargement..." indefinitely
**Mistake:** `electron/main.ts` had `join(__dirname, "../preload/preload.js")` but electron-vite outputs the preload as `out/preload/index.js`. The preload never loaded, so `window.api` was undefined, IPC calls threw silently, and `setAppReady(true)` was never reached.
**Fix:** Changed path to `join(__dirname, "../preload/index.js")`. Also added `.catch()` on the `init()` call in `app.tsx` so any future error still unblocks the loading screen.
**Rule:** electron-vite always outputs preload as `index.js` (matching the rollupOptions input key). Always use `../preload/index.js` as the preload path in main.ts.

### [04/2026] — puppeteer 22.x is deprecated — use 24.x
**Context:** Phase 1 — npm install
**Mistake:** package.json specified puppeteer@22.8.2 which npm flagged as deprecated (< 24.15.0 no longer supported)
**Fix:** Updated to puppeteer@24.42.0 (latest stable at time of writing)
**Rule:** Always check puppeteer version is >= 24.15.0

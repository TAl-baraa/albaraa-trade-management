# Windows desktop wrapper

Run commands from `frontend/`:

```bash
npm install
npm run tauri -- dev
```

Tauri starts the existing Vite server at `http://localhost:5173`. Stop any
separately running Vite server on that port before starting Tauri. Browser-only
development remains available with `npm run dev`.

The Windows build requires Rust with the MSVC toolchain, Visual Studio C++ Build
Tools, Windows SDK, and WebView2. The first launch downloads and compiles Rust
dependencies.

`npm run tauri -- build` runs `npm run build`, embeds `../dist`, and builds an
NSIS installer. The included icons are the default Tauri placeholder icons.

The existing localStorage implementation is unchanged. WebView2 uses a separate
application profile from Chrome/Edge, so browser records do not automatically
appear in the desktop app. Development and packaged app origins also differ;
their localStorage should not be assumed to be shared. No migration is included.

No native commands, plugins, database, authentication, or backup features are
enabled by this wrapper.

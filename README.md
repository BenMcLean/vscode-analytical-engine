# Babbage Analytical Engine Assembly for Visual Studio Code

[Babbage Analytical Engine](https://en.wikipedia.org/wiki/Analytical_Engine) [Assembly](http://fourmilab.ch/babbage/contents.html) support for Visual Studio Code is provided by this extension. The current scaffold is intentionally small, but it is pointed at the serious goal:

- first-class `.ae` language recognition
- a web-friendly extension architecture
- a bundled TypeScript build using esbuild
- automated `.vsix` packaging in GitHub Actions

## About the Project

**Q:** Is this serious computer science education software or a joke?  
**A:** [Yes](https://quoteinvestigator.com/2019/10/01/boy-girl/).

## Current Features

- Registers the `analytical-engine` language for `.ae` files
- Provides syntax highlighting ported from Alec Lownes' 2017 Atom package, [`language-analytical-engine`](https://github.com/cakenggt/language-analytical-engine)
- Reuses the old Atom snippets as VS Code snippets
- Adds `Analytical Engine: Run Current Program`
- Runs programs through [Alec Lownes's analystical-engine](https://github.com/cakenggt/analytical-engine) based on [John Walker's web emulator](https://fourmilab.ch/babbage/emulator.html).
- Resolves built-in and relative library includes through VS Code URIs so the extension can stay compatible with desktop and web hosts

## Development

```bash
npm install
npm run compile
```

Recommended editor defaults are already included in `.vscode/settings.json` and `.prettierrc.json`, with tabs enforced via Prettier.

## Packaging

```bash
npm run vsix
```

The release workflow builds and uploads a `.vsix` artifact when changes land on the `release` branch.

Because the emulator code is bundled into `dist/*/extension.js`, but its built-in `Library/*.ae` card files are runtime assets, the build also copies just those library files into `dist/analytical-engine/Library`. That avoids shipping the full dependency tree while keeping standard library includes working.

## Near-Term Roadmap

- Diagnostics for invalid cards and unresolved includes
- Hover help and card reference docs
- Breakpoint-aware debugging on top of the emulator's `DebuggerSession`
- Rich output views for the Attendant Log, Printer, and Curve Drawing Apparatus
- Snippets, formatting, tasks, and project templates

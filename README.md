# Babbage Analytical Engine Assembly for Visual Studio Code

[Babbage Analytical Engine](https://en.wikipedia.org/wiki/Analytical_Engine) [Assembly](http://fourmilab.ch/babbage/contents.html) support for Visual Studio Code is provided by this extension with a full-featured development experience for writing, running, and debugging `.ae` programs. It brings together editing support, emulator-backed execution, interactive debugging, and plotter output in a package that works with both desktop and web-compatible extension hosts.

## About the Project

**Q:** Is this serious historical computer science education software or a joke?  
**A:** [Yes](https://quoteinvestigator.com/2019/10/01/boy-girl/).

## Features

- `.ae` language registration with editor configuration for Analytical Engine source files
- Syntax highlighting ported from Alec Lownes' Atom package, [`language-analytical-engine`](https://github.com/cakenggt/language-analytical-engine)
- Snippet support adapted from the earlier Atom tooling
- `Babbage Analytical Engine Assembly: New Sample Program` for quickly creating a runnable starter file
- `Babbage Analytical Engine Assembly: Run Current Program` for one-command execution of the active program
- Emulator-backed execution using [Alec Lownes's analytical-engine](https://github.com/cakenggt/analytical-engine), itself based on [John Walker's web emulator](https://fourmilab.ch/babbage/emulator.html)
- Output capture for the Attendant Log and Printer in a dedicated VS Code output channel
- Curve Drawing Apparatus / plotter output in a live webview panel
- Plotter controls to reopen the panel, copy generated SVG, and save plots to disk
- Dynamic debug configuration for `.ae` files
- Launch-based debugging with step, continue, pause and stop
- Breakpoint support for Analytical Engine source files
- Debug views for current execution state, including Mill and Store variables
- Resolution of both bundled library cards and relative user includes through VS Code URIs
- Diagnostics for malformed cards, suspicious indentation, decimal-place issues, and missing include targets
- Hover help and document symbols for common card forms
- Support for desktop and web extension hosts through separate Node and browser bundles
- Optional bell sound integration for `B` cards on desktop hosts

## Debugging and Running

You can use the extension in two ways:

- Run the active program directly with `Babbage Analytical Engine Assembly: Run Current Program`
- Start a debug session with the `Analytical Engine` debugger or the generated launch configuration

During debugging, the extension can stop on entry, honor source breakpoints, expose Mill and Store state through the Variables view, and surface plotter output when the program draws a curve.

## Include Resolution

The extension follows the emulator's current source-relative include rule.

- `A include cards path/to/deck` resolves `path/to/deck.ae` relative to the file containing that include.
- `A include from library cards for sqrt` first checks for `Library/sqrt.ae` relative to the including file.
- If no project-local override exists, the extension falls back to the packaged standard library bundled with the extension.

That behavior is intentional because it scales cleanly to large projects with nested folders and many `.ae` files, while still keeping the standard library available by default.

## Development

```bash
npm install
npm run compile
```

Useful scripts:

```bash
npm run lint
npm run test
npm run vsix
```

## Packaging

Because the emulator code is bundled into `dist/*/extension.js`, but its built-in `Library/*.ae` card files are runtime assets, the build also copies just those library files into `dist/analytical-engine/Library`. That avoids shipping the full dependency tree while keeping standard library includes working.

## Publication

The extension metadata is set up for both the Visual Studio Marketplace and Open VSX.

- Push to `release` to package a VSIX and publish automatically when the corresponding GitHub Actions secrets are present.
- Run the workflow manually from `master` or another branch to package a VSIX artifact without publishing by leaving the `publish` input unchecked.

- `VSCE_PAT` for the Visual Studio Marketplace
- `OVSX_TOKEN` for Open VSX

Remaining work before a public launch:

- More automated coverage around debugger and execution scenarios
- Documentation examples, screenshots, and usage walkthroughs

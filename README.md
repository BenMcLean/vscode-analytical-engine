# Babbage Analytical Engine Assembly for Visual Studio Code

[Babbage Analytical Engine](https://en.wikipedia.org/wiki/Analytical_Engine) [Assembly](https://fourmilab.ch/babbage/contents.html) support for Visual Studio Code is provided by this extension. It brings together a fully modern (2026) development experience for writing, running, and debugging `.ae` programs with editing support, emulator-backed execution, interactive debugging and plotter output in a package that works with both desktop and web-compatible extension hosts.

This extension is for the Analytical Engine assembly language documented by John Walker and should run his example programs verbatim. It is not a new dialect, alternate syntax or separate language design. If you want to know how to program the machine, see the original programming references:

- John Walker's [Analytical Engine contents](https://fourmilab.ch/babbage/contents.html)
- Esolang's [Analytical Engine Programming Cards](https://esolangs.org/wiki/Analytical_Engine_Programming_Cards)

[mandelbrot.ae](https://gist.github.com/BenMcLean/57bc13db1337a55429c856231b72f92f) is recommended as an additional test program.

## Features

- `.ae` language registration with editor configuration for Analytical Engine source files
- Syntax highlighting ported from Alec Lownes' Atom package, [`language-analytical-engine`](https://github.com/cakenggt/language-analytical-engine)
- Snippet support adapted from the earlier Atom tooling
- `Babbage Analytical Engine Assembly: New Sample Program` for quickly creating a runnable starter file
- `Babbage Analytical Engine Assembly: Run Current Program` for one-command execution of the active program
- Emulator-backed execution using a [custom fork](https://github.com/benmclean/analytical-engine) of [Alec Lownes's analytical-engine](https://github.com/cakenggt/analytical-engine), itself based on [John Walker's web emulator](https://fourmilab.ch/babbage/emulator.html)
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

## Known Issues

The bundled JavaScript emulator strips comment lines before execution. This differs from John Walker's original browser emulator, which could retain comments in the mounted card chain.

As a result, some original Walker examples which use literal combinatorial jump distances may not run verbatim in this extension.

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

## About the Project

**Q:** Is this serious historical computer science education software or a joke?

**A:** [Yes](https://quoteinvestigator.com/2019/10/01/boy-girl/).

----

**Q:** What level of effort was involved in making this?

**A:** I forked an existing emulator somebody else wrote and just added a little glue and polish to make it run inside Visual Studio Code.

----

**Q:** Is the code in this extension just a bunch of hastily thrown together heavily vibe coded LLM slop?

**A:** Absolutely 100% "Owner of a Lonely Heart" Yes and I didn't even scrutinize its work very hard. It wasn't single prompt or anything silly like that but I did sit back and let the model write the code while I described what I wanted feature by feature. I was far more interested in a functional end result based on manual testing than I was in making sure every detail was correct on this. I would not recommend working this way when building code on which anybody's life could depend, but LLMs made it possible to throw this together in just a few days.

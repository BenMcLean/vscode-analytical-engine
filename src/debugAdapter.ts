import * as vscode from "vscode";
import { ExecutionHooks, makeExecutionHooks } from "./engineHooks";

// Minimal types matching analytical-engine's index.d.ts
type LibraryRequest = {
	kind: "system" | "user";
	name: string;
	path: string;
	sourceUri?: string;
};

type LibraryResponse = {
	text: string;
	sourceName: string;
	sourceUri: string;
};

type CardSnapshot = {
	text?: string;
	cardIndex?: number;
	sourceLine?: number | null;
	sourceName?: string | null;
	sourceUri?: string | null;
};

type Breakpoint = {
	id?: number;
	enabled?: boolean;
	sourceUri?: string | null;
	sourceName?: string | null;
	sourceLine?: number | null;
	cardIndex?: number | null;
	text?: string | null;
};

type NormalizedBreakpoint = {
	id: number;
	enabled: boolean;
	sourceUri: string | null;
	sourceName: string | null;
	sourceLine: number | null;
	cardIndex: number | null;
	text: string | null;
};

type DebugEvent =
	| { type: "breakpoint"; breakpoint: NormalizedBreakpoint; card: CardSnapshot }
	| { type: "step" | "halt" | "error"; card: CardSnapshot; status: { halted?: boolean; errorDetected?: boolean } };

type StepResult = {
	progressed: boolean;
	event: DebugEvent | null;
	state: DebugState;
};

type RunUntilPauseResult = {
	steps: number;
	event: DebugEvent | null;
	state: DebugState;
};

type MillState = {
	operationString: string;
	runUp: boolean;
	ingress: string[];
	egress: string[];
	currentAxis: string;
};

type StoreColumn = { index: number; value: string };
type StoreState = { columns: StoreColumn[]; columnCount: number };

type EngineState = {
	running: boolean;
	errorDetected: boolean;
	lastStopReason: string | null;
};

type DebugState = {
	engine: EngineState;
	mill: MillState;
	store: StoreState;
	outputs: { attendantLog: string; printer: string; curveDrawingApparatus: string };
};

type AEDebuggerSession = {
	submitProgramAsync(
		cards: string,
		options?: { sourceName?: string; sourceUri?: string },
	): Promise<number>;
	step(): StepResult;
	resume(limit?: number): RunUntilPauseResult;
	start(): void;
	pause(): void;
	getState(): DebugState;
	getCurrentCard(): CardSnapshot | null;
	getNextCard(): CardSnapshot | null;
	getLastDebugEvent(): DebugEvent | null;
	setBreakpoints(breakpoints: Breakpoint[]): NormalizedBreakpoint[];
	addBreakpoint(breakpoint: Breakpoint): NormalizedBreakpoint;
	removeBreakpoint(id: number): void;
	clearBreakpoints(): void;
	getBreakpoints(): NormalizedBreakpoint[];
};

type AEModule = {
	DebuggerSession: new (options?: {
		libraryReader?: (req: LibraryRequest) => Promise<LibraryResponse>;
		executionHooks?: ExecutionHooks;
	}) => AEDebuggerSession;
};

type DAPMessage = {
	type: string;
	seq: number;
	command: string;
	arguments?: unknown;
};

const SCOPE_MILL = 1;
const SCOPE_STORE = 2;

let aeModuleCache: Promise<AEModule> | undefined;

function loadAEModule(): Promise<AEModule> {
	aeModuleCache ??= import("analytical-engine") as Promise<unknown> as Promise<AEModule>;
	return aeModuleCache;
}

export class AEDebugAdapter implements vscode.DebugAdapter {
	private readonly _onDidSendMessage =
		new vscode.EventEmitter<vscode.DebugProtocolMessage>();
	readonly onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage> =
		this._onDidSendMessage.event;

	private readonly _onDidUpdatePlot = new vscode.EventEmitter<string>();
	readonly onDidUpdatePlot: vscode.Event<string> = this._onDidUpdatePlot.event;

	private seq = 0;
	private session: AEDebuggerSession | null = null;
	private programUri: vscode.Uri | null = null;
	private stopOnEntry = false;
	private sourceBreakpoints = new Map<string, number[]>();
	private lastBreakpointFired: NormalizedBreakpoint | null = null;
	private _continueRunning = false;
	private pendingContinue = false;

	constructor(private readonly context: vscode.ExtensionContext) {}

	handleMessage(message: vscode.DebugProtocolMessage): void {
		void this.dispatch(message as DAPMessage);
	}

	private async dispatch(msg: DAPMessage): Promise<void> {
		if (msg.type !== "request") {
			return;
		}
		try {
			await this.handleRequest(msg);
		} catch (e) {
			this.sendError(msg, 1, e instanceof Error ? e.message : String(e));
		}
	}

	private async handleRequest(req: DAPMessage): Promise<void> {
		switch (req.command) {
			case "initialize":
				this.sendResponse(req, { supportsConfigurationDoneRequest: true, supportTerminateDebuggee: true });
				this.sendEvent("initialized");
				break;

			case "launch":
				await this.handleLaunch(req);
				break;

			case "setBreakpoints":
				this.handleSetBreakpoints(req);
				break;

			case "setExceptionBreakpoints":
				this.sendResponse(req, { filters: [] });
				break;

			case "configurationDone":
				this.sendResponse(req);
				if (!this.session) {
					// launch is still loading — remember to continue once it's ready
					this.pendingContinue = true;
				} else if (this.stopOnEntry) {
					this.sendEvent("stopped", { reason: "entry", threadId: 1 });
				} else {
					this.doContinue();
				}
				break;

			case "threads":
				this.sendResponse(req, { threads: [{ id: 1, name: "Main Thread" }] });
				break;

			case "stackTrace":
				this.handleStackTrace(req);
				break;

			case "scopes":
				this.sendResponse(req, {
					scopes: [
						{ name: "Mill", variablesReference: SCOPE_MILL, expensive: false },
						{ name: "Store", variablesReference: SCOPE_STORE, expensive: false },
					],
				});
				break;

			case "variables":
				this.handleVariables(req);
				break;

			case "continue":
				this.sendResponse(req, { allThreadsContinued: true });
				this.doContinue();
				break;

			case "next":
			case "stepIn":
			case "stepOut":
				this.sendResponse(req);
				this.doStep();
				break;

			case "pause": {
				const wasContinuing = this._continueRunning;
				this._continueRunning = false;
				this.sendResponse(req);
				if (!wasContinuing) {
					this.sendEvent("stopped", { reason: "pause", threadId: 1 });
				}
				// If wasContinuing, the stopped event is sent by doContinueAsync
				break;
			}

			case "disconnect":
			case "terminate":
				this._continueRunning = false;
				this.sendResponse(req);
				this.sendEvent("terminated");
				break;

			default:
				this.sendResponse(req);
				break;
		}
	}

	private async handleLaunch(req: DAPMessage): Promise<void> {
		const args = req.arguments as { program?: string; stopOnEntry?: boolean } | undefined;
		this.stopOnEntry = !!args?.stopOnEntry;

		if (!args?.program) {
			throw new Error("No program specified in launch configuration.");
		}

		this.programUri = vscode.Uri.parse(args.program);

		const AE = await loadAEModule();
		const session = new AE.DebuggerSession({
			libraryReader: (req) => this.resolveLibrary(req),
			executionHooks: makeExecutionHooks({
				onBell: () => this.sendEvent("output", { category: "console", output: "[Bell] Ding dong!\n" }),
			}),
		});

		const text = await this.readProgram(this.programUri);
		await session.submitProgramAsync(text, {
			sourceName: this.getSourceName(this.programUri),
			sourceUri: this.programUri.toString(),
		});

		// Assign session only after the program is fully loaded so that
		// configurationDone (which may arrive before the launch response) cannot
		// call resume() on an empty card reader.
		this.session = session;
		this.syncBreakpoints();

		this.sendResponse(req);

		if (this.pendingContinue) {
			this.pendingContinue = false;
			if (this.stopOnEntry) {
				this.sendEvent("stopped", { reason: "entry", threadId: 1 });
			} else {
				this.doContinue();
			}
		}
	}

	private async readProgram(uri: vscode.Uri): Promise<string> {
		const doc = vscode.workspace.textDocuments.find(
			(d) => d.uri.toString() === uri.toString(),
		);
		if (doc) {
			return doc.getText();
		}
		const bytes = await vscode.workspace.fs.readFile(uri);
		return new TextDecoder().decode(bytes);
	}

	private getSourceName(uri: vscode.Uri): string {
		return vscode.workspace.asRelativePath(uri, false);
	}

	private async resolveLibrary(request: LibraryRequest): Promise<LibraryResponse> {
		const resolvedPath =
			request.path ||
			(request.kind === "system"
				? `Library/${request.name}.ae`
				: `${request.name}.ae`);

		let uri: vscode.Uri;
		if (request.kind === "system") {
			uri = vscode.Uri.joinPath(
				this.context.extensionUri,
				"dist",
				"analytical-engine",
				resolvedPath,
			);
		} else {
			if (!request.sourceUri) {
				throw new Error("Cannot resolve relative include without a source URI.");
			}
			const importer = vscode.Uri.parse(request.sourceUri);
			const lastSlash = importer.path.lastIndexOf("/");
			const parentPath =
				lastSlash >= 0 ? importer.path.slice(0, lastSlash + 1) : "/";
			uri = vscode.Uri.joinPath(importer.with({ path: parentPath }), resolvedPath);
		}

		const contents = await vscode.workspace.fs.readFile(uri);
		return {
			text: new TextDecoder().decode(contents),
			sourceName: `${request.name} [Library]`,
			sourceUri: uri.toString(),
		};
	}

	private handleSetBreakpoints(req: DAPMessage): void {
		const args = req.arguments as {
			source: { path?: string };
			breakpoints?: Array<{ line: number }>;
		} | undefined;

		if (!args?.source?.path) {
			this.sendResponse(req, { breakpoints: [] });
			return;
		}

		const sourceUri = vscode.Uri.file(args.source.path).toString();
		const lines = (args.breakpoints ?? []).map((bp) => bp.line);
		this.sourceBreakpoints.set(sourceUri, lines);
		this.syncBreakpoints();

		this.sendResponse(req, {
			breakpoints: lines.map((line, i) => ({ id: i, verified: true, line })),
		});
	}

	private syncBreakpoints(): void {
		if (!this.session) {
			return;
		}
		const all: Breakpoint[] = [];
		for (const [sourceUri, lines] of this.sourceBreakpoints) {
			for (const line of lines) {
				all.push({ sourceUri, sourceLine: line });
			}
		}
		this.session.setBreakpoints(all);
		this.lastBreakpointFired = null;
	}

	private handleStackTrace(req: DAPMessage): void {
		const card = this.getDisplayCard();
		const uri = this.programUri;
		const source =
			uri?.scheme === "file"
				? { path: uri.fsPath, name: this.getSourceName(uri) }
				: uri
					? { name: this.getSourceName(uri) }
					: undefined;

		const frame = {
			id: 1,
			name: card?.text ?? "(program start)",
			line: card?.sourceLine ?? 1,
			column: 0,
			source,
		};

		this.sendResponse(req, { stackFrames: [frame], totalFrames: 1 });
	}

	private getDisplayCard(): CardSnapshot | null {
		if (!this.session) {
			return null;
		}
		const event = this.session.getLastDebugEvent();
		if (event?.card) {
			return event.card;
		}
		return this.session.getNextCard() ?? this.session.getCurrentCard();
	}

	private handleVariables(req: DAPMessage): void {
		const args = req.arguments as { variablesReference: number } | undefined;
		const ref = args?.variablesReference ?? 0;
		const state = this.session?.getState();
		const vars: object[] = [];

		if (ref === SCOPE_MILL && state?.mill) {
			const m = state.mill;
			vars.push(
				v("operation", m.operationString ?? ""),
				v("runUp", String(m.runUp ?? false)),
				v("ingress[0]", String(m.ingress?.[0] ?? "0")),
				v("ingress[1]", String(m.ingress?.[1] ?? "0")),
				v("ingress[2]", String(m.ingress?.[2] ?? "0")),
				v("egress[0]", String(m.egress?.[0] ?? "0")),
				v("egress[1]", String(m.egress?.[1] ?? "0")),
				v("currentAxis", String(m.currentAxis ?? "0")),
			);
		} else if (ref === SCOPE_STORE && state?.store) {
			const cols = state.store.columns;
			if (cols.length === 0) {
				vars.push(v("(empty)", ""));
			} else {
				for (const col of cols) {
					vars.push(v(`V${String(col.index).padStart(3, "0")}`, String(col.value)));
				}
			}
		}

		this.sendResponse(req, { variables: vars });
	}

	private readonly INNER_CHUNK = 200;
	private readonly SLICE_MS = 16;

	private doContinue(): void {
		this.doContinueAsync().catch((error) => {
			const msg = error instanceof Error ? error.message : String(error);
			this.sendEvent("output", { category: "stderr", output: `[Engine error] ${msg}\n` });
			this.sendEvent("terminated");
		});
	}

	private async doContinueAsync(): Promise<void> {
		if (!this.session) {
			return;
		}

		const bp = this.lastBreakpointFired;
		this.lastBreakpointFired = null;
		if (bp) {
			this.session.removeBreakpoint(bp.id);
		}

		this._continueRunning = true;
		try {
			while (this._continueRunning) {
				const deadline = Date.now() + this.SLICE_MS;

				// Run INNER_CHUNK cards at a time until the time slice expires
				while (this._continueRunning) {
					const result = this.session.resume(this.INNER_CHUNK);
					const stopReason = result.state.engine?.lastStopReason;

					if (stopReason !== null || result.steps < this.INNER_CHUNK) {
						this._continueRunning = false;
						this.handleRunResult(result);
						return;
					}

					if (Date.now() >= deadline) {
						break;
					}
				}

				// Yield between slices so VS Code can process pause/disconnect
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
			}

			// _continueRunning was set to false by a pause request
			this.sendEvent("stopped", { reason: "pause", threadId: 1 });
		} finally {
			this._continueRunning = false;
			if (bp && this.session) {
				this.session.addBreakpoint({
					sourceUri: bp.sourceUri,
					sourceName: bp.sourceName,
					sourceLine: bp.sourceLine,
					cardIndex: bp.cardIndex,
					text: bp.text,
					enabled: bp.enabled,
				});
			}
		}
	}

	private doStep(): void {
		if (!this.session) {
			return;
		}
		this.skipLastBreakpointOnce(() => {
			const result = this.session!.step();
			const stopReason = result.state.engine?.lastStopReason;

			if (stopReason === "completed" || stopReason === "halt" || stopReason === "hcf") {
				this.sendEvent("terminated");
			} else if (stopReason === "error") {
				this.sendEvent("stopped", { reason: "exception", threadId: 1 });
			} else if (stopReason === "breakpoint") {
				this.trackBreakpointFired(result.event);
				this.sendEvent("stopped", { reason: "breakpoint", threadId: 1 });
			} else if (!result.progressed) {
				this.sendEvent("terminated");
			} else {
				this.sendEvent("stopped", { reason: "step", threadId: 1 });
			}
		});
	}

	private skipLastBreakpointOnce(fn: () => void): void {
		const bp = this.lastBreakpointFired;
		this.lastBreakpointFired = null;
		if (bp && this.session) {
			this.session.removeBreakpoint(bp.id);
		}
		fn();
		if (bp && this.session) {
			this.session.addBreakpoint({
				sourceUri: bp.sourceUri,
				sourceName: bp.sourceName,
				sourceLine: bp.sourceLine,
				cardIndex: bp.cardIndex,
				text: bp.text,
				enabled: bp.enabled,
			});
		}
	}

	private handleRunResult(result: RunUntilPauseResult): void {
		const stopReason = result.state.engine?.lastStopReason;
		const errorDetected = result.state.engine?.errorDetected;

		if (stopReason === "completed" || stopReason === "halt" || stopReason === "hcf") {
			this.sendEvent("terminated");
		} else if (stopReason === "error" || errorDetected) {
			this.sendEvent("stopped", { reason: "exception", threadId: 1 });
		} else if (stopReason === "breakpoint") {
			this.trackBreakpointFired(result.event);
			const bpIds =
				result.event?.type === "breakpoint" && result.event.breakpoint
					? [result.event.breakpoint.id]
					: [];
			this.sendEvent("stopped", { reason: "breakpoint", threadId: 1, hitBreakpointIds: bpIds });
		} else {
			this.sendEvent("terminated");
		}
	}

	private trackBreakpointFired(event: DebugEvent | null): void {
		if (event?.type === "breakpoint") {
			this.lastBreakpointFired = event.breakpoint;
		}
	}

	private sendResponse(req: DAPMessage, body?: object): void {
		this._onDidSendMessage.fire({
			type: "response",
			seq: ++this.seq,
			request_seq: req.seq,
			success: true,
			command: req.command,
			body,
		} as vscode.DebugProtocolMessage);
	}

	private sendError(req: DAPMessage, code: number, message: string): void {
		this._onDidSendMessage.fire({
			type: "response",
			seq: ++this.seq,
			request_seq: req.seq,
			success: false,
			command: req.command,
			message,
			body: { error: { id: code, format: message } },
		} as vscode.DebugProtocolMessage);
	}

	private sendEvent(event: string, body?: object): void {
		if (event === "stopped" || event === "terminated") {
			this.firePlotUpdate();
		}
		this._onDidSendMessage.fire({
			type: "event",
			seq: ++this.seq,
			event,
			body,
		} as vscode.DebugProtocolMessage);
	}

	private static readonly EMPTY_SVG =
		'<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"></svg>';

	private firePlotUpdate(): void {
		const svg = this.session?.getState().outputs.curveDrawingApparatus;
		if (svg && svg !== AEDebugAdapter.EMPTY_SVG) {
			this._onDidUpdatePlot.fire(svg);
		}
	}

	dispose(): void {
		this._onDidSendMessage.dispose();
		this._onDidUpdatePlot.dispose();
	}
}

function v(name: string, value: string): object {
	return { name, value, variablesReference: 0 };
}

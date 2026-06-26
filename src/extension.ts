import * as vscode from "vscode";
import { AEDebugAdapter } from "./debugAdapter";
import { PlotterPanel, EMPTY_SVG } from "./plotterPanel";

const LANGUAGE_ID = "analytical-engine";

type LibraryRequest = {
	kind: "system" | "user";
	name: string;
	path: string;
	sourceUri?: string;
};

type LibraryResponse = { text: string; sourceName?: string; sourceUri?: string };

type RunResult = {
	steps: number;
	state: { engine: { lastStopReason: string | null } };
};

type AESession = {
	submitProgramAsync(cards: string, options?: { sourceName?: string; sourceUri?: string }): Promise<number>;
	resume(limit: number): RunResult;
	getState(): { outputs: { attendantLog: string; printer: string; curveDrawingApparatus: string } };
};

type AnalyticalEngineModule = {
	DebuggerSession: new (options?: {
		libraryReader?: (request: LibraryRequest) => Promise<LibraryResponse>;
	}) => AESession;
};

let analyticalEngineModulePromise: Promise<AnalyticalEngineModule> | undefined;

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel("Analytical Engine");

	const plotter = new PlotterPanel(context);
	context.subscriptions.push(output, plotter);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"analytical-engine.runCurrentProgram",
			async () => {
				await runCurrentProgram(context, output, plotter);
			},
		),
		vscode.commands.registerCommand(
			"analytical-engine.newProgram",
			async () => {
				await createSampleProgram();
			},
		),
		vscode.debug.registerDebugConfigurationProvider(
			"analytical-engine",
			new AEDebugConfigurationProvider(),
		),
		vscode.debug.registerDebugAdapterDescriptorFactory(
			"analytical-engine",
			new AEDebugAdapterDescriptorFactory(context, plotter),
		),
	);
}

class AEDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
	resolveDebugConfiguration(
		_folder: vscode.WorkspaceFolder | undefined,
		config: vscode.DebugConfiguration,
	): vscode.DebugConfiguration {
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === LANGUAGE_ID) {
				config.type = "analytical-engine";
				config.name = "Debug Analytical Engine Program";
				config.request = "launch";
				config.program = editor.document.uri.toString();
				config.stopOnEntry = false;
			}
		}
		if (!config.program) {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				config.program = editor.document.uri.toString();
			}
		}
		return config;
	}
}

class AEDebugAdapterDescriptorFactory
	implements vscode.DebugAdapterDescriptorFactory
{
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly plotter: PlotterPanel,
	) {}

	createDebugAdapterDescriptor(): vscode.DebugAdapterDescriptor {
		this.plotter.reset();
		const adapter = new AEDebugAdapter(this.context);
		adapter.onDidUpdatePlot((svg) => this.plotter.update(svg));
		return new vscode.DebugAdapterInlineImplementation(adapter);
	}
}

export function deactivate(): void {}

async function runCurrentProgram(
	context: vscode.ExtensionContext,
	output: vscode.OutputChannel,
	plotter: PlotterPanel,
): Promise<void> {
	output.clear();
	output.show(true);

	const document = getRunnableDocument();
	if (!document) {
		void vscode.window.showWarningMessage(
			"Open an .ae file or an Analytical Engine document to run it.",
		);
		return;
	}

	if (document.isUntitled && document.isDirty) {
		const choice = await vscode.window.showWarningMessage(
			"Save this untitled program before running if it uses relative library includes.",
			"Run Anyway",
		);
		if (choice !== "Run Anyway") {
			return;
		}
	}

	plotter.reset();
	const AE = await getAnalyticalEngine();

	const makeLibraryReader = () => async (request: LibraryRequest): Promise<LibraryResponse> => {
		const resolvedLibraryPath = getLibraryPath(request);
		const uri =
			request.kind === "system"
				? vscode.Uri.joinPath(
						context.extensionUri,
						"dist",
						"analytical-engine",
						resolvedLibraryPath,
					)
				: resolveUserLibraryUri(request, resolvedLibraryPath);
		const contents = await vscode.workspace.fs.readFile(uri);
		return {
			text: new TextDecoder().decode(contents),
			sourceName: `${request.name} [Library]`,
			sourceUri: uri.toString(),
		};
	};

	const label = getDocumentLabel(document);

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Running: ${label}`,
			cancellable: true,
		},
		async (_progress, token) => {
			const session = new AE.DebuggerSession({ libraryReader: makeLibraryReader() });

			try {
				await session.submitProgramAsync(document.getText(), {
					sourceName: label,
					sourceUri: document.uri.toString(),
				});

				const INNER_CHUNK = 200;
				const SLICE_MS = 16;
				let done = false;

				token.onCancellationRequested(() => { done = true; });

				while (!done) {
					const deadline = Date.now() + SLICE_MS;
					while (!done) {
						const result = session.resume(INNER_CHUNK);
						const stopReason = result.state.engine?.lastStopReason;
						if (stopReason !== null || result.steps < INNER_CHUNK) {
							done = true;
							break;
						}
						if (Date.now() >= deadline) { break; }
					}
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
				}

				const outputs = session.getState().outputs;

				output.appendLine(`Program: ${label}`);
				output.appendLine("");
				output.appendLine("[Attendant Log]");
				output.appendLine(outputs.attendantLog.trim() || "(empty)");
				output.appendLine("");
				output.appendLine("[Printer]");
				output.appendLine(outputs.printer.trim() || "(empty)");

				if (outputs.curveDrawingApparatus !== EMPTY_SVG) {
					plotter.update(outputs.curveDrawingApparatus);
				}

				if (!token.isCancellationRequested) {
					void vscode.window.showInformationMessage("Analytical Engine program finished.");
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				output.appendLine("");
				output.appendLine("[Runtime Error]");
				output.appendLine(message);
				output.show(true);
				void vscode.window.showErrorMessage(`Analytical Engine run failed: ${message}`);
			}
		},
	);
}

async function getAnalyticalEngine(): Promise<AnalyticalEngineModule> {
	analyticalEngineModulePromise ??= import("analytical-engine") as Promise<unknown> as Promise<AnalyticalEngineModule>;
	return analyticalEngineModulePromise;
}

function getRunnableDocument(): vscode.TextDocument | undefined {
	const activeDocument = vscode.window.activeTextEditor?.document;
	if (!activeDocument) {
		return undefined;
	}

	if (
		activeDocument.languageId === LANGUAGE_ID ||
		activeDocument.uri.path.toLowerCase().endsWith(".ae")
	) {
		return activeDocument;
	}

	return undefined;
}

function getDocumentLabel(document: vscode.TextDocument): string {
	if (document.isUntitled) {
		return document.fileName;
	}

	return vscode.workspace.asRelativePath(document.uri, false);
}

function getLibraryPath(request: LibraryRequest): string {
	if (request.path) {
		return request.path;
	}

	if (!request.name) {
		throw new Error(
			`Library request is missing both "path" and "name" (${JSON.stringify(request)}).`,
		);
	}

	return request.kind === "system"
		? `Library/${request.name}.ae`
		: `${request.name}.ae`;
}

function resolveUserLibraryUri(
	request: LibraryRequest,
	resolvedLibraryPath: string,
): vscode.Uri {
	if (!request.sourceUri) {
		throw new Error(
			"Cannot resolve a relative include without a source URI.",
		);
	}

	const importer = vscode.Uri.parse(request.sourceUri);
	if (importer.scheme === "untitled") {
		throw new Error(
			"Relative user library includes require the program to be saved to disk first.",
		);
	}

	const lastSlash = importer.path.lastIndexOf("/");
	const parentPath =
		lastSlash >= 0 ? importer.path.slice(0, lastSlash + 1) : "/";
	const parent = importer.with({ path: parentPath });
	return vscode.Uri.joinPath(parent, resolvedLibraryPath);
}

async function createSampleProgram(): Promise<void> {
	const document = await vscode.workspace.openTextDocument({
		language: LANGUAGE_ID,
		content: `        Add two numbers and print the result
N000 40
N001 2
+
L000
L001
P`,
	});

	await vscode.window.showTextDocument(document);
}

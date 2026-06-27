import * as vscode from "vscode";
import {
	getSystemLibrarySearchUris,
	resolveUserLibraryUri,
} from "./libraryResolution";

const ESOLANG_REFERENCE_URL =
	"https://esolangs.org/wiki/Analytical_Engine_Programming_Cards";
const WALKER_REFERENCE_URL = "https://www.fourmilab.ch/babbage/cards.html";
const LANGUAGE_ID = "analytical-engine";

type CardHelpEntry = {
	title: string;
	syntax: string;
	summary: string;
	regex: RegExp;
	symbolKind?: vscode.SymbolKind;
};

const CARD_HELP_ENTRIES: CardHelpEntry[] = [
	{
		title: "Number card",
		syntax: "N<number> <value>",
		summary: "Places a literal number into the specified store column.",
		regex: /^N\d+(?:\s+.+)?$/i,
		symbolKind: vscode.SymbolKind.Constant,
	},
	{
		title: "Load card",
		syntax: "L<number>",
		summary: "Loads a value from the store into the mill ingress.",
		regex: /^L\d+'?$/i,
	},
	{
		title: "Store card",
		syntax: "S<number>",
		summary: "Stores the mill result into the specified store column.",
		regex: /^S\d+'?$/i,
	},
	{
		title: "Zero-and-store card",
		syntax: "Z<number>",
		summary: "Stores the mill result and then zeroes the source axis afterward.",
		regex: /^Z\d+'?$/i,
	},
	{
		title: "Add card",
		syntax: "+",
		summary: "Adds the next two values read into the mill.",
		regex: /^\+$/i,
	},
	{
		title: "Subtract card",
		syntax: "-",
		summary: "Subtracts the second mill ingress value from the first.",
		regex: /^(-|\u2212)$/i,
	},
	{
		title: "Multiply card",
		syntax: "*",
		summary: "Multiplies the next two values read into the mill.",
		regex: /^(\*|\u00d7)$/i,
	},
	{
		title: "Divide card",
		syntax: "/",
		summary: "Divides the first mill ingress value by the second.",
		regex: /^(\/|\u00f7)$/i,
	},
	{
		title: "Shift plus card",
		syntax: "<digits>",
		summary: "Shifts the decimal marker in the positive direction.",
		regex: /^<\d+$/i,
	},
	{
		title: "Shift minus card",
		syntax: ">digits",
		summary: "Shifts the decimal marker in the negative direction.",
		regex: /^>\d+$/i,
	},
	{
		title: "Print card",
		syntax: "P",
		summary: "Prints the current mill output using the configured number format.",
		regex: /^P$/i,
	},
	{
		title: "Bell card",
		syntax: "B",
		summary: "Rings the bell output.",
		regex: /^B$/i,
	},
	{
		title: "Halt card",
		syntax: "H <reason>",
		summary: "Halts execution and records the remaining text as a stop message.",
		regex: /^H(?:\s+.*)?$/i,
		symbolKind: vscode.SymbolKind.Event,
	},
	{
		title: "Curve draw card",
		syntax: "D+ | D- | DX | DY",
		summary: "Moves the Curve Drawing Apparatus in the requested direction.",
		regex: /^(D\+|D-|DX|DY)$/i,
	},
	{
		title: "Forward combinatorial card",
		syntax: "CF | CF?",
		summary: "Controls forward branching, with `?` meaning conditional behavior.",
		regex: /^CF\??$/i,
	},
	{
		title: "Backward combinatorial card",
		syntax: "CB | CB?",
		summary: "Controls backward branching, with `?` meaning conditional behavior.",
		regex: /^CB\??$/i,
	},
	{
		title: "Write in columns card",
		syntax: "A write in columns",
		summary: "Switches output so written items continue across the page.",
		regex: /^A write in columns$/i,
	},
	{
		title: "Write in rows card",
		syntax: "A write in rows",
		summary: "Switches output so written items end each item with a newline.",
		regex: /^A write in rows$/i,
	},
	{
		title: "Write new line card",
		syntax: "A write new line",
		summary: "Writes a newline on the output apparatus.",
		regex: /^A write new line$/i,
	},
	{
		title: "Write timing card",
		syntax: "A write timing",
		summary: "Writes timing information to the attendant log.",
		regex: /^A write timing$/i,
	},
	{
		title: "Annotation card",
		syntax: "A write annotation <text>",
		summary: "Writes annotation text to the attendant log output.",
		regex: /^A write annotation(?:\s+.*)?$/i,
		symbolKind: vscode.SymbolKind.String,
	},
	{
		title: "Decimal places card",
		syntax: "A set decimal places to <number>",
		summary: "Changes how many decimal places are shown when numbers are written.",
		regex: /^A set decimal places to\s+[\+\-]?\d+$/i,
	},
	{
		title: "Decimal point picture card",
		syntax: "A write numbers with decimal point",
		summary: "Expands to a number picture using the current decimal-place setting.",
		regex: /^A write numbers with decimal point$/i,
	},
	{
		title: "Number format card",
		syntax: "A write numbers as <format>",
		summary: "Changes the textual format used when numbers are written.",
		regex: /^A write numbers as(?:\s+.*)?$/i,
	},
	{
		title: "Relative include card",
		syntax: "A include cards <path>",
		summary: "Includes another card deck relative to the current source file.",
		regex: /^A include cards\s+.+$/i,
		symbolKind: vscode.SymbolKind.Namespace,
	},
	{
		title: "Library include card",
		syntax: "A include from library cards for <name>",
		summary: "Includes one of the standard library card sets by name.",
		regex: /^A include from library cards for\s+.+$/i,
		symbolKind: vscode.SymbolKind.Namespace,
	},
	{
		title: "Commentary card",
		syntax: "DC <text>",
		summary: "Carries descriptive commentary text for the program listing.",
		regex: /^DC(?:\s+.*)?$/i,
		symbolKind: vscode.SymbolKind.String,
	},
];

const CONTROL_CARD_PATTERN = /^(\(\??|\{\??|\}\{|[)}])$/;
const POSSIBLE_CARD_PREFIX =
	/^(A|B|CB\??|CF\??|D\+|D-|DC|DX|DY|H|L\d*'?|N\d*|P|S\d*'?|Z\d*'?|[+\-*/<>{()}]|\u2212|\u00d7|\u00f7)$/i;
const CARD_LIKE_TOKEN_PATTERN =
	/^(A|B|C|D|H|L|N|P|S|Z|[+\-*/<>{()}]|\u2212|\u00d7|\u00f7)/i;
const VALID_LINE_START_PATTERN = /^[ABCDHLNPSZ+\-*/<>{()\u2212\u00d7\u00f7]/i;
const INDENTED_CARD_PREFIX =
	/^\s+(A|B|C|D\+|D-|DC|DX|DY|H|L\d*'?|N\d*|P|S\d*'?|Z\d*'?|[+\-*/<>{()}])/i;
const VALID_LIBRARY_NAME = /^[abcdefghijklmnopqrstuvwxyz\-_0123456789]+$/;

function trimInstructionLine(line: string): string {
	return line.trimStart().trimEnd();
}

function stripEmulatorInlineComment(line: string): string {
	return line.replace(/\.\s.*$/, "");
}

function getInstructionText(line: string): string {
	return stripEmulatorInlineComment(trimInstructionLine(line)).trimEnd();
}

function hasLeadingWhitespace(line: string): boolean {
	return /^\s+/.test(line);
}

function findCardHelpEntry(line: string): CardHelpEntry | undefined {
	const trimmed = getInstructionText(line);
	return CARD_HELP_ENTRIES.find((entry) => entry.regex.test(trimmed));
}

function isCommentLikeLine(line: string): boolean {
	const trimmed = trimInstructionLine(line);
	return trimmed === "" || trimmed.startsWith(".") || hasLeadingWhitespace(line);
}

function looksLikeMalformedCard(line: string): boolean {
	const trimmed = trimInstructionLine(line);
	if (trimmed === "" || CONTROL_CARD_PATTERN.test(trimmed)) {
		return false;
	}

	const token = trimmed.split(/\s+/, 1)[0] ?? "";
	return POSSIBLE_CARD_PREFIX.test(token) || CARD_LIKE_TOKEN_PATTERN.test(token);
}

function isWellFormedVariableCard(line: string): boolean {
	return /^[LSZ]\d+'?(?:\s+\..*)?$/i.test(trimInstructionLine(line));
}

function isAcceptedByEngine(line: string): boolean {
	const trimmed = trimInstructionLine(line);
	const card = stripEmulatorInlineComment(trimmed);
	if (card === "") {
		return true;
	}

	const operation = card.charAt(0);

	switch (operation) {
		case "+":
		case "-":
		case "\u2212":
		case "*":
		case "x":
		case "\u00d7":
		case "/":
		case "\u00f7":
		case "B":
		case "P":
		case "H":
			return true;
		case "<":
		case ">": {
			const body = card.slice(1).trimEnd();
			if (body === "") {
				return true;
			}
			const count = Number.parseInt(body, 10);
			return !Number.isNaN(count) && count >= 0 && count <= 100;
		}
		case "L":
		case "S":
		case "Z": {
			const match = card.slice(1).match(/\d+/);
			if (!match) {
				return false;
			}
			const column = Number.parseInt(match[0], 10);
			return !Number.isNaN(column) && column >= 0;
		}
		case "N": {
			const match = card.slice(1).match(/(\d+)\s+([\d\+\-\u2212]+)/);
			if (!match) {
				return false;
			}
			const column = Number.parseInt(match[1], 10);
			if (Number.isNaN(column) || column < 0 || column > 999) {
				return false;
			}

			const valueText = match[2].replace(/^\+/, "").replace(/^\u2212/, "-");
			try {
				const value = BigInt(valueText);
				return value > -(10n ** 50n) && value < 10n ** 50n;
			} catch {
				return false;
			}
		}
		case "C":
			return !(
				card.length < 4 ||
				(card.charAt(1) !== "F" && card.charAt(1) !== "B") ||
				(card.charAt(2) !== "?" && card.charAt(2) !== "1" && card.charAt(2) !== "+") ||
				Number.isNaN(Number.parseInt(card.substring(3).replace(/\s+$/, ""), 10))
			);
		case "D":
			return (
				card.length === 1 ||
				["X", "Y", "+", "-", "\u2212", "P", "C"].includes(card.charAt(1))
			);
		default:
			return false;
	}
}

function isAcceptedByAttendant(line: string): boolean {
	const trimmed = trimInstructionLine(line);
	const card = stripEmulatorInlineComment(trimmed).trimEnd();
	const lower = card.toLowerCase();

	if (/^a set decimal places to\s+[+\-]?\d+$/.test(lower)) {
		return true;
	}

	if (/^a write numbers with decimal point$/.test(lower)) {
		return true;
	}

	if (/^a write numbers as(?:\s+.*)?$/.test(lower)) {
		return true;
	}

	if (/^a write annotation(?:\s+.*)?$/.test(lower)) {
		return true;
	}

	if (
		/^a write in columns$/.test(lower) ||
		/^a write in rows$/.test(lower) ||
		/^a write new line$/.test(lower) ||
		/^a write timing$/.test(lower)
	) {
		return true;
	}

	if (/^a include from library cards for\s+.+$/.test(lower)) {
		return true;
	}

	if (/^a include cards\s+.+$/.test(lower)) {
		return true;
	}

	if (CONTROL_CARD_PATTERN.test(card)) {
		return true;
	}

	return false;
}

function createDiagnostic(
	lineNumber: number,
	startCharacter: number,
	endCharacter: number,
	message: string,
	severity: vscode.DiagnosticSeverity,
): vscode.Diagnostic {
	return new vscode.Diagnostic(
		new vscode.Range(lineNumber, startCharacter, lineNumber, endCharacter),
		message,
		severity,
	);
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

async function analyzeLine(
	line: vscode.TextLine,
	seenAbsoluteDecimalSetting: boolean,
	document: vscode.TextDocument,
	extensionUri: vscode.Uri,
): Promise<vscode.Diagnostic[]> {
	const text = line.text;
	const trimmed = getInstructionText(text);
	const diagnostics: vscode.Diagnostic[] = [];
	const firstNonWhitespace = text.search(/\S/);
	const startCharacter = Math.max(firstNonWhitespace, 0);

	if (hasLeadingWhitespace(text)) {
		return diagnostics;
	}

	if (trimmed === "" || trimmed.startsWith(".") || CONTROL_CARD_PATTERN.test(trimmed)) {
		return diagnostics;
	}

	if (!VALID_LINE_START_PATTERN.test(trimmed)) {
		diagnostics.push(
			createDiagnostic(
				line.lineNumber,
				startCharacter,
				text.length,
				"Unrecognized or malformed Analytical Engine card.",
				vscode.DiagnosticSeverity.Warning,
			),
		);
		return diagnostics;
	}

	if (/^[LSZ]/i.test(trimmed) && !isWellFormedVariableCard(text)) {
		diagnostics.push(
			createDiagnostic(
				line.lineNumber,
				startCharacter,
				text.length,
				"Unrecognized or malformed Analytical Engine card.",
				vscode.DiagnosticSeverity.Warning,
			),
		);
		return diagnostics;
	}

	if (/^N\d+$/i.test(trimmed)) {
		diagnostics.push(
			createDiagnostic(
				line.lineNumber,
				startCharacter,
				text.length,
				"Number cards need a store column and a numeric literal, such as `N000 42`.",
				vscode.DiagnosticSeverity.Warning,
			),
		);
		return diagnostics;
	}

	if (/^C/i.test(trimmed) && !/^C[FB](\?|\+|1)\d+\s*(?:\.\s.*)?$/i.test(trimmed)) {
		diagnostics.push(
			createDiagnostic(
				line.lineNumber,
				startCharacter,
				text.length,
				"Combinatorial cards must look like `CF?12`, `CF+12`, `CB112`, or similar.",
				vscode.DiagnosticSeverity.Warning,
			),
		);
		return diagnostics;
	}

	const decimalSetting = trimmed.match(/^A set decimal places to\s+([+\-]?\d+)$/i);
	if (decimalSetting) {
		const value = Number.parseInt(decimalSetting[1], 10);
		if (Number.isNaN(value) || value < -50 || value > 50) {
			diagnostics.push(
				createDiagnostic(
					line.lineNumber,
					startCharacter,
					text.length,
					"Decimal place settings must stay between 0 and 50 after attendant processing.",
					vscode.DiagnosticSeverity.Warning,
				),
			);
		} else if ((decimalSetting[1].startsWith("+") || decimalSetting[1].startsWith("-")) && !seenAbsoluteDecimalSetting) {
			diagnostics.push(
				createDiagnostic(
					line.lineNumber,
					startCharacter,
					text.length,
					"Relative decimal place settings require an earlier absolute `A set decimal places to` instruction.",
					vscode.DiagnosticSeverity.Warning,
				),
			);
		}
		return diagnostics;
	}

	if (/^[<>]\s*(?:\.\s.*)?$/i.test(trimmed) && !seenAbsoluteDecimalSetting) {
		diagnostics.push(
			createDiagnostic(
				line.lineNumber,
				startCharacter,
				text.length,
				"Shift cards without a count rely on a prior absolute decimal-place setting.",
				vscode.DiagnosticSeverity.Warning,
			),
		);
		return diagnostics;
	}

	const libraryInclude = trimmed.match(/^A include from library cards for\s+(.+)$/i);
	if (libraryInclude) {
		const libraryName = libraryInclude[1].trim().toLowerCase();
		if (!VALID_LIBRARY_NAME.test(libraryName)) {
			diagnostics.push(
				createDiagnostic(
					line.lineNumber,
					startCharacter,
					text.length,
					"Library card names may contain only lowercase letters, digits, hyphens, and underscores.",
					vscode.DiagnosticSeverity.Warning,
				),
			);
			return diagnostics;
		}

		const candidateUris = getSystemLibrarySearchUris(
			extensionUri,
			document.uri.toString(),
			`Library/${libraryName}.ae`,
		);
		const found = await Promise.all(candidateUris.map((uri) => uriExists(uri)));
		if (!found.some(Boolean)) {
			diagnostics.push(
				createDiagnostic(
					line.lineNumber,
					startCharacter,
					text.length,
					`Library card set \`${libraryName}\` was not found.`,
					vscode.DiagnosticSeverity.Warning,
				),
			);
		}
		return diagnostics;
	}

	const userInclude = trimmed.match(/^A include cards\s+(.+)$/i);
	if (userInclude) {
		const includePath = userInclude[1].trim();
		let resolvedUri: vscode.Uri | undefined;
		try {
			resolvedUri = resolveUserLibraryUri(document.uri.toString(), `${includePath}.ae`);
		} catch {
			resolvedUri = undefined;
		}

		if (!resolvedUri) {
			diagnostics.push(
				createDiagnostic(
					line.lineNumber,
					startCharacter,
					text.length,
					"Relative includes require the program to be saved to disk first.",
					vscode.DiagnosticSeverity.Warning,
				),
			);
			return diagnostics;
		}

		if (!(await uriExists(resolvedUri))) {
			diagnostics.push(
				createDiagnostic(
					line.lineNumber,
					startCharacter,
					text.length,
					`Included card file was not found: ${includePath}.ae`,
					vscode.DiagnosticSeverity.Warning,
				),
			);
		}
		return diagnostics;
	}

	if (isAcceptedByEngine(text)) {
		return diagnostics;
	}

	if (isAcceptedByAttendant(text)) {
		return diagnostics;
	}

	if (!looksLikeMalformedCard(text)) {
		return diagnostics;
	}

	diagnostics.push(
		createDiagnostic(
			line.lineNumber,
			startCharacter,
			text.length,
			"Unrecognized or malformed Analytical Engine card.",
			vscode.DiagnosticSeverity.Warning,
		),
	);
	return diagnostics;
}

function makeReferenceMarkdown(entry: CardHelpEntry): vscode.MarkdownString {
	const markdown = new vscode.MarkdownString(undefined, true);
	markdown.appendMarkdown(`**${entry.title}**\n\n`);
	markdown.appendCodeblock(entry.syntax, "plaintext");
	markdown.appendMarkdown(`${entry.summary}\n\n`);
	markdown.appendMarkdown(
		`References: [Esolang wiki](${ESOLANG_REFERENCE_URL}) | [Walker notes](${WALKER_REFERENCE_URL})`,
	);
	markdown.isTrusted = true;
	return markdown;
}

function makeHcfMarkdown(): vscode.MarkdownString {
	const markdown = new vscode.MarkdownString(undefined, true);
	markdown.appendMarkdown("**Halt And Catch Fire**\n\n");
	markdown.appendCodeblock("H HCF", "plaintext");
	markdown.appendMarkdown(
		"Causes the engine to halt and catch fire.",
	);
	markdown.isTrusted = true;
	return markdown;
}

export class AEHoverProvider implements vscode.HoverProvider {
	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.ProviderResult<vscode.Hover> {
		const line = document.lineAt(position.line).text;
		if (INDENTED_CARD_PREFIX.test(line)) {
			return new vscode.Hover(
				new vscode.MarkdownString(
					"Indented card-like text is treated as a comment by the emulator.",
				),
			);
		}

		if (isCommentLikeLine(line)) {
			return undefined;
		}

		if (/^H\s+HCF$/.test(getInstructionText(line))) {
			return new vscode.Hover(makeHcfMarkdown());
		}

		const match = findCardHelpEntry(line);
		if (!match) {
			return undefined;
		}

		return new vscode.Hover(makeReferenceMarkdown(match));
	}
}

export class AEDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
		const symbols: vscode.DocumentSymbol[] = [];

		for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
			const line = document.lineAt(lineNumber);
			const entry = findCardHelpEntry(line.text);
			if (!entry?.symbolKind) {
				continue;
			}

			const trimmed = trimInstructionLine(line.text);
			const range = line.range;
			symbols.push(
				new vscode.DocumentSymbol(
					trimmed,
					entry.title,
					entry.symbolKind,
					range,
					range,
				),
			);
		}

		return symbols;
	}
}

async function updateDiagnostics(
	document: vscode.TextDocument,
	collection: vscode.DiagnosticCollection,
	extensionUri: vscode.Uri,
): Promise<void> {
	if (document.languageId !== LANGUAGE_ID && !document.uri.path.toLowerCase().endsWith(".ae")) {
		return;
	}

	const diagnostics: vscode.Diagnostic[] = [];
	let seenAbsoluteDecimalSetting = false;

	for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
		const line = document.lineAt(lineNumber);
		diagnostics.push(
			...(await analyzeLine(
				line,
				seenAbsoluteDecimalSetting,
				document,
				extensionUri,
			)),
		);

		const trimmed = trimInstructionLine(line.text);
		if (/^A set decimal places to\s+\d+$/i.test(trimmed)) {
			seenAbsoluteDecimalSetting = true;
		}
	}

	collection.set(document.uri, diagnostics);
}

export function registerLanguageFeatures(
	context: vscode.ExtensionContext,
): void {
	const diagnostics = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);

	const refresh = (document: vscode.TextDocument) => {
		void updateDiagnostics(document, diagnostics, context.extensionUri);
	};

	context.subscriptions.push(
		diagnostics,
		vscode.languages.registerHoverProvider(LANGUAGE_ID, new AEHoverProvider()),
		vscode.languages.registerDocumentSymbolProvider(
			{ language: LANGUAGE_ID },
			new AEDocumentSymbolProvider(),
		),
		vscode.workspace.onDidOpenTextDocument(refresh),
		vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
		vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
	);

	for (const document of vscode.workspace.textDocuments) {
		refresh(document);
	}
}

import * as vscode from "vscode";

const ESOLANG_REFERENCE_URL =
	"https://esolangs.org/wiki/Analytical_Engine_Programming_Cards";
const WALKER_REFERENCE_URL = "https://www.fourmilab.ch/babbage/cards.html";

type CardHelpEntry = {
	title: string;
	syntax: string;
	summary: string;
	regex: RegExp;
};

const CARD_HELP_ENTRIES: CardHelpEntry[] = [
	{
		title: "Number card",
		syntax: "N<number> <value>",
		summary: "Places a literal number into the specified store column.",
		regex: /^N\d+\s+/i,
	},
	{
		title: "Load card",
		syntax: "L<number>",
		summary: "Loads a value from the store into the mill ingress.",
		regex: /^L\d+'?\b/i,
	},
	{
		title: "Store card",
		syntax: "S<number>",
		summary: "Stores the mill result into the specified store column.",
		regex: /^S\d+'?\b/i,
	},
	{
		title: "Zero-and-store card",
		syntax: "Z<number>",
		summary: "Stores the mill result and then zeroes the source axis afterward.",
		regex: /^Z\d+'?\b/i,
	},
	{
		title: "Add card",
		syntax: "+",
		summary: "Adds the next two values read into the mill.",
		regex: /^\+/,
	},
	{
		title: "Subtract card",
		syntax: "-",
		summary: "Subtracts the second mill ingress value from the first.",
		regex: /^(-|\u2212)/,
	},
	{
		title: "Multiply card",
		syntax: "*",
		summary: "Multiplies the next two values read into the mill.",
		regex: /^(\*|\u00d7)/,
	},
	{
		title: "Divide card",
		syntax: "/",
		summary: "Divides the first mill ingress value by the second.",
		regex: /^(\/|\u00f7)/,
	},
	{
		title: "Shift plus card",
		syntax: "<",
		summary: "Shifts the decimal marker in the positive direction.",
		regex: /^</,
	},
	{
		title: "Shift minus card",
		syntax: ">",
		summary: "Shifts the decimal marker in the negative direction.",
		regex: /^>/,
	},
	{
		title: "Print card",
		syntax: "P",
		summary: "Prints the current mill output using the configured number format.",
		regex: /^P\b/i,
	},
	{
		title: "Bell card",
		syntax: "B",
		summary: "Rings the bell output.",
		regex: /^B\b/i,
	},
	{
		title: "Halt card",
		syntax: "H <reason>",
		summary: "Halts execution and records the remaining text as a stop message.",
		regex: /^H\b/i,
	},
	{
		title: "Trace card",
		syntax: "T0 | T1",
		summary: "Disables or enables emulator trace output.",
		regex: /^T[01]\b/i,
	},
	{
		title: "Curve draw card",
		syntax: "D+ | D- | DX | DY",
		summary: "Moves the Curve Drawing Apparatus in the requested direction.",
		regex: /^(D\+|D-|DX|DY)\b/i,
	},
	{
		title: "Forward combinatorial card",
		syntax: "CF | CF?",
		summary: "Controls forward branching, with `?` meaning conditional behavior.",
		regex: /^CF\??\b/i,
	},
	{
		title: "Backward combinatorial card",
		syntax: "CB | CB?",
		summary: "Controls backward branching, with `?` meaning conditional behavior.",
		regex: /^CB\??\b/i,
	},
	{
		title: "Annotation card",
		syntax: "A write annotation <text>",
		summary: "Writes annotation text to the attendant log output.",
		regex: /^A write annotation\b/i,
	},
	{
		title: "Decimal places card",
		syntax: "A set decimal places to <number>",
		summary: "Changes how many decimal places are shown when numbers are written.",
		regex: /^A set decimal places to\b/i,
	},
	{
		title: "Number format card",
		syntax: "A write numbers as <format>",
		summary: "Changes the textual format used when numbers are written.",
		regex: /^A write numbers as\b/i,
	},
	{
		title: "Relative include card",
		syntax: "A include cards <path>",
		summary: "Includes another card deck relative to the current source file.",
		regex: /^A include cards\b/i,
	},
	{
		title: "Library include card",
		syntax: "A include from library cards for <name>",
		summary: "Includes one of the standard library card sets by name.",
		regex: /^A include from library cards for\b/i,
	},
	{
		title: "Commentary card",
		syntax: "DC <text>",
		summary: "Carries descriptive commentary text for the program listing.",
		regex: /^DC\b/i,
	},
];

export class AEHoverProvider implements vscode.HoverProvider {
	provideHover(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.ProviderResult<vscode.Hover> {
		const line = document.lineAt(position.line).text.trim();
		if (!line || line.startsWith(".") || /^\s/.test(document.lineAt(position.line).text)) {
			return undefined;
		}

		const match = CARD_HELP_ENTRIES.find((entry) => entry.regex.test(line));
		if (!match) {
			return undefined;
		}

		const markdown = new vscode.MarkdownString(undefined, true);
		markdown.appendMarkdown(`**${match.title}**\n\n`);
		markdown.appendCodeblock(match.syntax, "plaintext");
		markdown.appendMarkdown(`${match.summary}\n\n`);
		markdown.appendMarkdown(
			`References: [Esolang wiki](${ESOLANG_REFERENCE_URL}) | [Walker notes](${WALKER_REFERENCE_URL})`,
		);
		markdown.isTrusted = true;

		return new vscode.Hover(markdown);
	}
}

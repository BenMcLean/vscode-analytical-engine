import * as vscode from "vscode";

export type LibraryRequest = {
	kind: "system" | "user";
	name: string;
	path: string;
	sourceUri?: string;
};

export function getLibraryPath(request: LibraryRequest): string {
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

function getParentUri(sourceUri: vscode.Uri): vscode.Uri {
	const lastSlash = sourceUri.path.lastIndexOf("/");
	const parentPath =
		lastSlash >= 0 ? sourceUri.path.slice(0, lastSlash + 1) : "/";
	return sourceUri.with({ path: parentPath });
}

export function resolveUserLibraryUri(
	sourceUri: string,
	resolvedLibraryPath: string,
): vscode.Uri {
	const importer = vscode.Uri.parse(sourceUri);
	if (importer.scheme === "untitled") {
		throw new Error(
			"Relative user library includes require the program to be saved to disk first.",
		);
	}

	return vscode.Uri.joinPath(getParentUri(importer), resolvedLibraryPath);
}

export function getSystemLibrarySearchUris(
	extensionUri: vscode.Uri,
	sourceUri: string | undefined,
	resolvedLibraryPath: string,
): vscode.Uri[] {
	const uris: vscode.Uri[] = [];

	if (sourceUri) {
		try {
			uris.push(resolveUserLibraryUri(sourceUri, resolvedLibraryPath));
		} catch {
			// Unsaved programs cannot provide local Library overrides.
		}
	}

	uris.push(
		vscode.Uri.joinPath(
			extensionUri,
			"dist",
			"analytical-engine",
			resolvedLibraryPath,
		),
	);

	return uris;
}

export async function resolveExistingSystemLibraryUri(
	extensionUri: vscode.Uri,
	sourceUri: string | undefined,
	resolvedLibraryPath: string,
): Promise<vscode.Uri> {
	const candidates = getSystemLibrarySearchUris(
		extensionUri,
		sourceUri,
		resolvedLibraryPath,
	);

	for (const candidate of candidates) {
		try {
			await vscode.workspace.fs.stat(candidate);
			return candidate;
		} catch {
			// Try the next candidate.
		}
	}

	return candidates[candidates.length - 1];
}

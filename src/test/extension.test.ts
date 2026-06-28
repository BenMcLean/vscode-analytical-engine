import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	suiteSetup(async () => {
		const extension = vscode.extensions.getExtension(
			"benmclean.vscode-analytical-engine",
		);
		assert.ok(extension);
		await extension.activate();
	});

	async function waitForDiagnosticCount(
		uri: vscode.Uri,
		expectedCount: number,
	): Promise<readonly vscode.Diagnostic[]> {
		for (let attempt = 0; attempt < 40; attempt += 1) {
			const diagnostics = vscode.languages.getDiagnostics(uri);
			if (diagnostics.length === expectedCount) {
				return diagnostics;
			}
			await new Promise<void>((resolve) => setTimeout(resolve, 25));
		}

		return vscode.languages.getDiagnostics(uri);
	}

	test("Analytical Engine commands are contributed", async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes("analytical-engine.runCurrentProgram"));
		assert.ok(commands.includes("analytical-engine.newProgram"));
	});

	test("Analytical Engine hover help explains that indented card-like lines are comments", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "  N000 40\nP",
		});
		const hoverList = await vscode.commands.executeCommand<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			document.uri,
			new vscode.Position(0, 2),
		);

		assert.ok(hoverList);
		assert.strictEqual(hoverList.length, 1);
		const firstContent = hoverList[0].contents[0];
		const hoverText =
			typeof firstContent === "string"
				? firstContent
				: "value" in firstContent
					? firstContent.value
					: String(firstContent);
		assert.match(hoverText, /treated as a comment by the emulator/);
	});

	test("Analytical Engine diagnostics flag malformed cards", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "CFX\nNq004    0       . Iteration count\nq004\nL0a04\nN000 0\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 4);

		assert.strictEqual(diagnostics.length, 4);
		assert.match(
			diagnostics[0].message,
			/(Unrecognized or malformed Analytical Engine card|Combinatorial cards must look like)/,
		);
		assert.strictEqual(diagnostics[0].range.start.line, 0);
		assert.match(diagnostics[1].message, /Unrecognized or malformed Analytical Engine card/);
		assert.strictEqual(diagnostics[1].range.start.line, 1);
		assert.match(diagnostics[2].message, /Unrecognized or malformed Analytical Engine card/);
		assert.strictEqual(diagnostics[2].range.start.line, 2);
		assert.match(diagnostics[3].message, /Unrecognized or malformed Analytical Engine card/);
		assert.strictEqual(diagnostics[3].range.start.line, 3);
	});

	test("Analytical Engine diagnostics reject junk inserted into variable and number cards", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "Nq004 0\nL0a04\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 2);

		assert.strictEqual(diagnostics.length, 2);
		assert.match(diagnostics[0].message, /Unrecognized or malformed Analytical Engine card/);
		assert.strictEqual(diagnostics[0].range.start.line, 0);
		assert.match(diagnostics[1].message, /Unrecognized or malformed Analytical Engine card/);
		assert.strictEqual(diagnostics[1].range.start.line, 1);
	});

	test("Analytical Engine diagnostics do not flag indented card-like lines as problems", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "  N000 40\nP\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);
	});

	test("Analytical Engine diagnostics treat indented prose as comments", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "    Working variables\nN000 1\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);
	});

	test("Analytical Engine diagnostics allow valid cards followed by inline period comments", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "L002    . temp = current + previous\nP       . Print current term\nL006 .\nL006 .a\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);
	});

	test("Analytical Engine diagnostics follow emulator acceptance for trailing junk on core cards", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "L006 .a\nN000 1 xyz\n+\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);
	});

	test("Analytical Engine diagnostics allow Unicode operator cards", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "\u2212\n\u00f7\n\u00d7\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);
	});

	test("Analytical Engine diagnostics allow valid attendant write cards", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content:
				"A write in columns\n" +
				"A write numbers as 9\n" +
				"A write annotation  \n" +
				"A write new line\n" +
				"A write timing\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);
	});

	test("Analytical Engine diagnostics catch relative decimal settings without a prior absolute setting", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "A set decimal places to +5\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 1);

		assert.strictEqual(diagnostics.length, 1);
		assert.match(diagnostics[0].message, /Relative decimal place settings require/);
	});

	test("Analytical Engine diagnostics flag missing user include files", async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder);

		const programUri = vscode.Uri.joinPath(
			workspaceFolder!.uri,
			".tmp-missing-include-test.ae",
		);
		await vscode.workspace.fs.writeFile(
			programUri,
			new TextEncoder().encode("A include cards does-not-exist\n"),
		);

		const document = await vscode.workspace.openTextDocument(programUri);
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 1);

		assert.strictEqual(diagnostics.length, 1);
		assert.match(diagnostics[0].message, /Included card file was not found/);

		await vscode.workspace.fs.delete(programUri);
	});

	test("Analytical Engine diagnostics allow existing user include files", async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder);

		const includeUri = vscode.Uri.joinPath(
			workspaceFolder!.uri,
			".tmp-existing-include-target.ae",
		);
		const programUri = vscode.Uri.joinPath(
			workspaceFolder!.uri,
			".tmp-existing-include-program.ae",
		);

		await vscode.workspace.fs.writeFile(includeUri, new TextEncoder().encode("N000 1\n"));
		await vscode.workspace.fs.writeFile(
			programUri,
			new TextEncoder().encode("A include cards .tmp-existing-include-target\n"),
		);

		const document = await vscode.workspace.openTextDocument(programUri);
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);

		await vscode.workspace.fs.delete(programUri);
		await vscode.workspace.fs.delete(includeUri);
	});

	test("Analytical Engine diagnostics flag missing library include files", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "A include from library cards for definitely_not_a_real_library\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 1);

		assert.strictEqual(diagnostics.length, 1);
		assert.match(diagnostics[0].message, /was not found/);
	});

	test("Analytical Engine diagnostics allow existing library include files", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "analytical-engine",
			content: "A include from library cards for sqrt\n",
		});
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);
	});

	test("Analytical Engine diagnostics allow user Library overrides before packaged library cards", async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder);

		const libraryDir = vscode.Uri.joinPath(workspaceFolder!.uri, "Library");
		const overrideUri = vscode.Uri.joinPath(libraryDir, "temporary_override.ae");
		const programUri = vscode.Uri.joinPath(
			workspaceFolder!.uri,
			".tmp-library-override-program.ae",
		);

		await vscode.workspace.fs.createDirectory(libraryDir);
		await vscode.workspace.fs.writeFile(overrideUri, new TextEncoder().encode("N000 1\n"));
		await vscode.workspace.fs.writeFile(
			programUri,
			new TextEncoder().encode("A include from library cards for temporary_override\n"),
		);

		const document = await vscode.workspace.openTextDocument(programUri);
		await vscode.window.showTextDocument(document);

		const diagnostics = await waitForDiagnosticCount(document.uri, 0);

		assert.strictEqual(diagnostics.length, 0);

		await vscode.workspace.fs.delete(programUri);
		await vscode.workspace.fs.delete(overrideUri);
	});
});

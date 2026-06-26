import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");

	test("Analytical Engine commands are contributed", async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes("analytical-engine.runCurrentProgram"));
		assert.ok(commands.includes("analytical-engine.newProgram"));
	});
});

import * as vscode from "vscode";

export type ExecutionHooks = {
	afterCard?: (card: { text?: string }, engine: unknown, status: unknown) => void;
};

export function makeExecutionHooks(options?: { onBell?: () => void }): ExecutionHooks {
	return {
		afterCard: (card: { text?: string }) => {
			if (card?.text?.charAt(0) === "B") {
				void vscode.window.showInformationMessage("Ding dong!");
				playBellSound();
				options?.onBell?.();
			}
		},
	};
}

function playBellSound(): void {
	const soundPath = vscode.workspace
		.getConfiguration("analytical-engine")
		.get<string>("bellSound", "")
		.trim();
	if (!soundPath) {
		return;
	}
	try {
		const { spawn } = require("child_process") as typeof import("child_process");
		let child;
		if (process.platform === "darwin") {
			child = spawn("afplay", [soundPath], { stdio: "ignore" });
		} else if (process.platform === "win32") {
			const escaped = soundPath.replace(/'/g, "''");
			child = spawn(
				"powershell.exe",
				["-NoProfile", "-NonInteractive", "-Command",
					`(New-Object Media.SoundPlayer '${escaped}').PlaySync()`],
				{ stdio: "ignore", windowsHide: true },
			);
		} else {
			child = spawn("aplay", [soundPath], { stdio: "ignore" });
		}
		child.on("error", () => {});
		child.unref();
	} catch {
		// Not available in web context or player command not found
	}
}

import * as vscode from "vscode";

export const EMPTY_SVG = '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"></svg>';

export class PlotterPanel {
	private panel: vscode.WebviewPanel | undefined;
	private lastSvg = EMPTY_SVG;

	constructor(private readonly context: vscode.ExtensionContext) {
		context.subscriptions.push(
			vscode.commands.registerCommand("analytical-engine.showPlotter", () =>
				this.show(),
			),
		);
	}

	update(svg: string): void {
		this.lastSvg = svg;
		if (this.panel) {
			void this.panel.webview.postMessage({ type: "update", svg });
		} else if (
			vscode.workspace
				.getConfiguration("analytical-engine")
				.get<boolean>("plotter.autoOpen", true)
		) {
			this.show();
		}
	}

	show(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside, true);
			return;
		}
		this.panel = vscode.window.createWebviewPanel(
			"analytical-engine.plotter",
			"Analytical Engine Plotter",
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		this.panel.webview.html = this.buildHtml(this.lastSvg);
		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});
	}

	reset(): void {
		this.lastSvg = EMPTY_SVG;
		if (this.panel) {
			void this.panel.webview.postMessage({ type: "update", svg: EMPTY_SVG });
		}
	}

	dispose(): void {
		this.panel?.dispose();
	}

	private buildHtml(initialSvg: string): string {
		const nonce = globalThis.crypto.randomUUID().replace(/-/g, "");
		const csp = `default-src 'none'; script-src 'nonce-${nonce}';`;
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Analytical Engine Plotter</title>
<style>
  body {
    margin: 0;
    padding: 12px;
    background: var(--vscode-editor-background, #1e1e1e);
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  #plot svg {
    max-width: 100%;
    height: auto;
    display: block;
  }
  #empty {
    color: var(--vscode-descriptionForeground, #888);
    font-family: var(--vscode-font-family, sans-serif);
    font-size: 13px;
    margin-top: 24px;
  }
</style>
</head>
<body>
<div id="plot">${initialSvg}</div>
<script nonce="${nonce}">
  const plot = document.getElementById('plot');
  const EMPTY = ${JSON.stringify(EMPTY_SVG)};

  function refresh(svg) {
    plot.innerHTML = svg;
  }

  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'update') {
      refresh(e.data.svg);
    }
  });
</script>
</body>
</html>`;
	}
}

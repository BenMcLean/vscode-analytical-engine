import * as vscode from "vscode";

export const EMPTY_SVG =
	'<svg viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"></svg>';

export class PlotterPanel {
	private panel: vscode.WebviewPanel | undefined;
	private lastSvg = EMPTY_SVG;
	private readonly textEncoder = new TextEncoder();

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
		this.panel.webview.onDidReceiveMessage((message: { type?: string }) => {
			if (message.type === "copySvg") {
				void this.copySvg();
			} else if (message.type === "saveSvg") {
				void this.saveSvg();
			}
		});
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

	private async copySvg(): Promise<void> {
		if (this.lastSvg === EMPTY_SVG) {
			void vscode.window.showInformationMessage("There is no plot SVG to copy yet.");
			return;
		}
		await vscode.env.clipboard.writeText(this.lastSvg);
		void vscode.window.showInformationMessage("Plot SVG copied to the clipboard.");
	}

	private async saveSvg(): Promise<void> {
		if (this.lastSvg === EMPTY_SVG) {
			void vscode.window.showInformationMessage("There is no plot SVG to save yet.");
			return;
		}
		const uri = await vscode.window.showSaveDialog({
			defaultUri: vscode.Uri.file("plot.svg"),
			filters: { SVG: ["svg"] },
			saveLabel: "Save Plot SVG",
		});
		if (!uri) {
			return;
		}
		await vscode.workspace.fs.writeFile(
			uri,
			this.textEncoder.encode(this.lastSvg),
		);
		void vscode.window.showInformationMessage(`Plot SVG saved to ${uri.fsPath}.`);
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
  html,
  body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  * {
    box-sizing: border-box;
  }
  body {
    padding: 12px;
    background: var(--vscode-editor-background, #1e1e1e);
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  button {
    border: 1px solid var(--vscode-button-border, transparent);
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    padding: 6px 12px;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  #plot {
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  #plot svg {
    width: auto;
    height: auto;
    display: block;
    overflow: hidden;
  }
  #toolbar {
    display: flex;
    gap: 8px;
    font-family: var(--vscode-font-family, sans-serif);
    justify-content: center;
    align-items: center;
    min-width: 0;
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
<div id="toolbar">
  <button id="copy" type="button">Copy SVG</button>
  <button id="save" type="button">Save SVG</button>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const plot = document.getElementById('plot');
  const copyButton = document.getElementById('copy');
  const saveButton = document.getElementById('save');
  const EMPTY = ${JSON.stringify(EMPTY_SVG)};

  function fitSvg() {
    const svg = plot.querySelector('svg');
    if (!svg) {
      return;
    }

    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      return;
    }

    const bounds = plot.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const svgAspect = viewBox.width / viewBox.height;
    const plotAspect = bounds.width / bounds.height;

    if (plotAspect > svgAspect) {
      svg.style.width = 'auto';
      svg.style.height = '100%';
    } else {
      svg.style.width = '100%';
      svg.style.height = 'auto';
    }
  }

  function updateButtons(svg) {
    const disabled = svg === EMPTY;
    copyButton.disabled = disabled;
    saveButton.disabled = disabled;
  }

  function refresh(svg) {
    plot.innerHTML = svg;
    fitSvg();
    updateButtons(svg);
  }

  copyButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'copySvg' });
  });

  saveButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'saveSvg' });
  });

  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'update') {
      refresh(e.data.svg);
    }
  });

  new ResizeObserver(() => {
    fitSvg();
  }).observe(plot);

  fitSvg();
  updateButtons(${JSON.stringify(initialSvg)});
</script>
</body>
</html>`;
	}
}

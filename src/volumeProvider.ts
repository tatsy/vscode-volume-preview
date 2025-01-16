import * as vscode from "vscode";
import * as path from "path";
import { VolumeDocument } from "./volumeDocument";
import { disposeAll, getNonce } from "./utils";

/**
 * Provider for volume viewer
 */
export class VolumeViewProvider
  implements vscode.CustomReadonlyEditorProvider<VolumeDocument>
{
  // register to subscriptions
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const register = vscode.window.registerCustomEditorProvider(
      VolumeViewProvider.viewType,
      new VolumeViewProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
    return register;
  }

  // view type name
  private static readonly viewType = "volview.viewer";

  // tracks all known webviews
  private readonly webviews = new WebviewCollection();

  constructor(private readonly _context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken
  ): Promise<VolumeDocument> {
    const document = new VolumeDocument(uri);
    const listeners: vscode.Disposable[] = [];

    listeners.push(
      document.onDidChangeDocument((e) => {
        for (const webviewPanel of this.webviews.get(document.uri)) {
          webviewPanel.webview.postMessage({ type: "update" });
        }
      })
    );

    document.onDidDispose(() => {
      disposeAll(listeners);
    });

    return document;
  }

  async resolveCustomEditor(
    document: VolumeDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    // add the webview to our internal set of active webviews
    this.webviews.add(document.uri, webviewPanel);

    // setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      document
    );
    webviewPanel.webview.onDidReceiveMessage((e) =>
      this.onMessage(document, e)
    );

    if (
      document.uri.scheme == "file" &&
      vscode.workspace.getConfiguration("volview").get("hotReload", true)
    ) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        document.uri.fsPath,
        true,
        false,
        true
      );
      watcher.onDidChange(() => {
        webviewPanel.webview.postMessage("modelRefresh");
      });
    }

    webviewPanel.webview.onDidReceiveMessage((e) => {
      if (e.type == "ready") {
        this.postMessage(webviewPanel, "init", {});
      }
    });
  }

  private getMediaWebviewUri(
    webview: vscode.Webview,
    mediaPath: string
  ): vscode.Uri {
    return webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "media", mediaPath)
    );
  }

  private getSettings(uri: vscode.Uri): string {
    const config = vscode.workspace.getConfiguration("volview");
    const initData = {
      fileToLoad: uri.toString(),
      backgroundColor: config.get("backgroundColor", "#0b1447"),
      fogDensity: config.get("fogDensity", 0.01),
    };
    const data = JSON.stringify(initData).replace(/"/g, "&quot;");
    return `<meta id="vscode-volume-data" data-settings="${data}">`;
  }

  private getScripts(webview: vscode.Webview, nonce: string): string {
    const scripts = [
      // this.getMediaWebviewUri(webview, "three/three.module.min.js"),
      // this.getMediaWebviewUri(webview, "three/dat.gui.module.js"),
      // this.getMediaWebviewUri(webview, "three/stats.min.js"),
      // this.getMediaWebviewUri(webview, "three/BufferGeometryUtils.js"),
      // this.getMediaWebviewUri(webview, "three/three.module.min.js"),
      // this.getMediaWebviewUri(webview, "three/controls/OrbitControls.js"),
      // this.getMediaWebviewUri(webview, "three/controls/TrackballControls.js"),
      // this.getMediaWebviewUri(webview, "three/misc/VolumeSlice.js"),
      // this.getMediaWebviewUri(webview, "three/misc/Volume.js"),
      // this.getMediaWebviewUri(webview, "three/loaders/NRRDLoader.js"),
      // this.getMediaWebviewUri(webview, "three/shaders/VolumeShader.js"),
      // this.getMediaWebviewUri(webview, "utils.js"),
      this.getMediaWebviewUri(webview, "viewer.js"),
    ];
    return scripts
      .map(
        (source) =>
          `<script nonce="${nonce}" type="module" src="${source}"></script>`
      )
      .join("\n");
  }

  /**
   * get the static HTML used in our webviews.
   */
  private getHtmlForWebview(
    webview: vscode.Webview,
    document: VolumeDocument
  ): string {
    const fileToLoad =
      document.uri.scheme === "file"
        ? webview.asWebviewUri(vscode.Uri.file(document.uri.fsPath))
        : document.uri;

    const threeUri = this.getMediaWebviewUri(
      webview,
      "three/three.module.min.js"
    );
    const styleUri = this.getMediaWebviewUri(webview, "viewer.css");
    const mediaUri = this.getMediaWebviewUri(webview, "");
    const nonce = getNonce();
    console.log(threeUri);

    // prettier-ignore
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src ${webview.cspSource} 'self' 'unsafe-eval' blob: data:; img-src ${webview.cspSource} 'self' 'unsafe-eval' blob: data:; style-src ${webview.cspSource} 'unsafe-inline' blob: data:; script-src ${webview.cspSource} 'self' 'unsafe-inline' blob: data:;">
        <meta name="viewport" content="width=device-width,initial-scale=1.0">

        <base href="${mediaUri}/">
        <link href="${styleUri}" rel="stylesheet"/>
        ${this.getSettings(fileToLoad)}
        <title>VSCode Volume Viewer</title>
      </head>
      <body>
        <script nonce="${nonce}" type="importmap">
          {
            "imports": {
              "three": "${threeUri}"
            }
          }
        </script>
        ${this.getScripts(webview, nonce)}
      </body>
      </html>`;

    console.log(html);
    return html;
  }

  private readonly _callbacks = new Map<number, (response: any) => void>();

  private postMessage(
    panel: vscode.WebviewPanel,
    type: string,
    body: any
  ): void {
    panel.webview.postMessage({ type, body });
  }

  private onMessage(document: VolumeDocument, message: any) {
    switch (message.type) {
      case "response":
        const callback = this._callbacks.get(message.requestId);
        callback?.(message.body);
        return;
    }
  }
}

class WebviewCollection {
  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vscode.WebviewPanel;
  }>();

  /**
   * Get all known webviews for a given uri.
   */
  public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString();
    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  /**
   * Add a new webview to the collection.
   */
  public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}

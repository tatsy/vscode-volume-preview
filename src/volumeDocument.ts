import * as vscode from 'vscode';
import { disposeAll } from './utils';

export class VolumeDocument implements vscode.CustomDocument {
  private isDisposed = false;
  private disposables: vscode.Disposable[] = [];

  public constructor(public uri: vscode.Uri) {}

  private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
  public readonly onDidDispose = this._onDidDispose.event;

  private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<void>());
  public readonly onDidChangeDocument = this._onDidChangeDocument.event;

  dispose(): void {
    this._onDidDispose.fire();
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    disposeAll(this.disposables);
  }

  private _register<T extends vscode.Disposable>(disposable: T): T {
    if (!this.isDisposed) {
      this.disposables.push(disposable);
    } else {
      disposable.dispose();
    }
    return disposable;
  }
}

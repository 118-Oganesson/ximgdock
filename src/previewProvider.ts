import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Returns a random string to be used as a nonce in a webview's content security policy.
 * This is used to allow inline scripts to run.
 * @returns A nonce string.
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export class PreviewProvider {
    private _panel: vscode.WebviewPanel | null = null;
    private readonly _extensionUri: vscode.Uri;
    private _sourceEditor: vscode.TextEditor | undefined;

    // 👈 --- ハイライトに関するプロパティを追加 ---
    private _highlightDecoration: vscode.TextEditorDecorationType;
    private _highlightTimeout: NodeJS.Timeout | undefined;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;

        // 👈 --- ハイライトのスタイルを定義 ---
        this._highlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.selectionHighlightBackground'),
            isWholeLine: true,
        });
    }

    public createOrShow(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found to preview.');
            return;
        }

        this._sourceEditor = editor; // 👈 プレビュー対象のエディタを記憶
        const documentUri = editor.document.uri;
        const column = vscode.ViewColumn.Beside;

        if (this._panel) {
            this._panel.reveal(column);
        } else {
            this._panel = vscode.window.createWebviewPanel(
                'xhtmlPreview',
                'XHTML Preview',
                column,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.dirname(documentUri.fsPath)),
                        this._extensionUri
                    ]
                }
            );

            this._panel.onDidDispose(() => {
                this._panel = null;
                this._sourceEditor = undefined;
                // 👈 パネルが閉じたらハイライトもクリア
                if (this._highlightTimeout) {
                    clearTimeout(this._highlightTimeout);
                }
            }, null, []);

            this._panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'revealLine':
                            const line = message.line;
                            const editorToReveal = this._sourceEditor;
                            if (editorToReveal) {
                                const position = new vscode.Position(line - 1, 0);
                                const range = new vscode.Range(position, position);

                                // スクロール処理
                                editorToReveal.revealRange(range, vscode.TextEditorRevealType.AtTop);

                                // 👈 --- ここからハイライト処理を追加 ---
                                // 既存のタイムアウトがあればクリア
                                if (this._highlightTimeout) {
                                    clearTimeout(this._highlightTimeout);
                                }
                                // 新しいハイライトを設定
                                editorToReveal.setDecorations(this._highlightDecoration, [range]);
                                // 1秒後にハイライトを解除するタイマーを設定
                                this._highlightTimeout = setTimeout(() => {
                                    editorToReveal.setDecorations(this._highlightDecoration, []);
                                }, 1000);
                                // 👆 --- ここまで追加 ---
                            }
                            return;
                    }
                },
                undefined,
                []
            );
        }
        this.update(editor.document);
    }
    public update(document: vscode.TextDocument) {
        if (!this._panel) {
            return;
        }
        this._panel.webview.html = this._getHtmlForWebview(document);
    }

    public scrollToLine(line: number) {
        if (this._panel) {
            this._panel.webview.postMessage({ command: 'scrollTo', line: line });
        }
    }

    private _getHtmlForWebview(document: vscode.TextDocument): string {
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'preview.html');
        let html = fs.readFileSync(htmlPath, 'utf8');
        const nonce = getNonce();

        html = html.replace(/your-nonce-here/g, nonce);

        const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'main.js');
        const scriptUri = this._panel!.webview.asWebviewUri(scriptPath);
        html = html.replace('{{scriptUri}}', scriptUri.toString());

        const docDir = path.dirname(document.uri.fsPath);
        let content = document.getText();

        const lines = content.split('\n');
        content = lines.map((line, index) => {
            if (line.trim() === '') {
                return '<br>';
            }
            return `<div data-line="${index + 1}">${line}</div>`;
        }).join('');

        content = content.replace(/(<img[^>]+src=")(?!https?:\/\/)([^"]+)"/g, (match, p1, p2) => {
            const imagePath = path.resolve(docDir, p2);
            const imageUri = vscode.Uri.file(imagePath);
            const webviewUri = this._panel!.webview.asWebviewUri(imageUri);
            return p1 + webviewUri + '"';
        });

        return html.replace('', content);
    }
}
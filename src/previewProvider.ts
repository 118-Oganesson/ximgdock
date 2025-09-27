import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * WebviewのContent Security Policyで使用する一意な文字列（nonce）を生成します。
 * @returns {string} 32文字のランダムな英数字からなるnonce文字列。
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * テキストエディタの内容をXHTMLとしてプレビューするWebviewパネルを管理するクラス。
 */
export class PreviewProvider {
    // --- プロパティ定義 ---
    private _panel: vscode.WebviewPanel | null = null;
    private readonly _extensionUri: vscode.Uri;
    private _sourceEditor: vscode.TextEditor | undefined;
    /** エディタ上の行を一時的にハイライトするためのデコレーション。 */
    private _highlightDecoration: vscode.TextEditorDecorationType;
    /** ハイライトを解除するためのタイマーID。 */
    private _highlightTimeout: NodeJS.Timeout | undefined;

    /**
     * PreviewProviderのインスタンスを生成します。
     * @param extensionUri 拡張機能のルートディレクトリのURI。
     */
    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
        // エディタの行をハイライトするためのスタイルを定義
        this._highlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.selectionHighlightBackground'),
            isWholeLine: true,
        });
    }

    /**
     * プレビューパネルを作成または既存のパネルを表示します。
     * @param editor プレビュー対象のテキストエディタ。
     */
    public createOrShow(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found to preview.');
            return;
        }

        // プレビュー対象のエディタをインスタンス変数に保持
        this._sourceEditor = editor;
        const column = vscode.ViewColumn.Two; // プレビューはエディタの右側に表示

        // パネルが既に存在する場合は、それをアクティブにする
        if (this._panel) {
            this._panel.reveal(column);
            this.update(editor.document); // コンテンツを更新
            return;
        }

        // ワークスペースフォルダのURIを取得。なければ編集中ファイルのディレクトリをルートとする
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        const rootPath = workspaceFolder ? workspaceFolder.uri : vscode.Uri.file(path.dirname(editor.document.uri.fsPath));

        // パネルが存在しない場合は、新規に作成
        this._panel = vscode.window.createWebviewPanel(
            'xhtmlPreview',
            'XHTML Preview',
            column,
            {
                enableScripts: true, // Webview内でJavaScriptを有効化
                localResourceRoots: [ // Webviewからアクセス可能なローカルリソースのルートパス
                    rootPath, // ワークスペースのルートを許可
                    this._extensionUri
                ]
            }
        );

        // --- イベントリスナーの設定 ---

        // パネルが破棄された際の処理
        this._panel.onDidDispose(() => {
            this._panel = null;
            this._sourceEditor = undefined;
            if (this._highlightTimeout) {
                clearTimeout(this._highlightTimeout);
            }
        }, null, []);

        // Webviewからのメッセージを受信した際の処理
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'revealLine':
                    this.handleRevealLine(message.line);
                    return;
            }
        }, undefined, []);

        // 初回のコンテンツ更新
        this.update(editor.document);
    }

    /**
     * Webviewからの 'revealLine' メッセージを処理し、
     * エディタの指定行へスクロールして一時的にハイライトします。
     * @param line ハイライトする行番号。
     */
    private handleRevealLine(line: number) {
        const editor = this._sourceEditor;
        if (!editor) { return; }

        const position = new vscode.Position(line - 1, 0);
        const range = new vscode.Range(position, position);

        // 指定行が画面内に表示されるようにスクロール
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        // --- 一時的なハイライト処理 ---
        // 既存のハイライト解除タイマーがあればクリア
        if (this._highlightTimeout) {
            clearTimeout(this._highlightTimeout);
        }
        // 指定行にデコレーションを適用してハイライト
        editor.setDecorations(this._highlightDecoration, [range]);

        // 1秒後にハイライトを解除
        this._highlightTimeout = setTimeout(() => {
            editor.setDecorations(this._highlightDecoration, []);
        }, 1000);
    }

    /**
     * プレビューのコンテンツを最新の状態に更新します。
     * @param document 更新対象のテキストドキュメント。
     */
    public update(document: vscode.TextDocument) {
        if (this._panel) {
            this._panel.webview.html = this._getHtmlForWebview(document);
        }
    }

    /**
     * Webview内の指定された行までスクロールするようメッセージを送信します。
     * @param line スクロール先の行番号。
     */
    public scrollToLine(line: number) {
        if (this._panel) {
            this._panel.webview.postMessage({ command: 'scrollTo', line: line });
        }
    }

    /**
     * Webviewに表示するためのHTMLコンテンツを生成します。
     * @param document 表示するテキストドキュメント。
     * @returns {string} Webview用の完全なHTML文字列。
     */
    private _getHtmlForWebview(document: vscode.TextDocument): string {
        // HTMLテンプレートを読み込む
        const htmlPath = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'preview.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // nonceを生成し、HTMLに埋め込む
        const nonce = getNonce();
        html = html.replace(/your-nonce-here/g, nonce);

        // Webview用のスクリプトURIを生成し、HTMLに埋め込む
        const scriptPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js');
        const scriptUri = this._panel!.webview.asWebviewUri(scriptPath);
        html = html.replace('{{scriptUri}}', scriptUri.toString());

        // ドキュメントのテキストを取得し、プレビュー用に変換
        const docDir = path.dirname(document.uri.fsPath);
        let content = document.getText();

        // 各行を `data-line` 属性を持つ `div` タグで囲む
        const lines = content.split('\n');
        content = lines.map((line, index) => {
            // 空行は改行として表示
            if (line.trim() === '') {
                return '<br>';
            }
            return `<div data-line="${index + 1}">${line}</div>`;
        }).join('');

        // ローカル画像のパスをWebviewで表示可能なURIに変換
        content = content.replace(/(<img[^>]+src=")(?!https?:\/\/)([^"]+)"/g, (match, p1, p2) => {
            const imagePath = path.resolve(docDir, p2);
            const imageUri = vscode.Uri.file(imagePath);
            const webviewUri = this._panel!.webview.asWebviewUri(imageUri);
            return p1 + webviewUri + '"';
        });

        // テンプレート内のプレースホルダーを、変換したコンテンツで置換する
        return html.replace('</body>', `${content}</body>`);
    }
}
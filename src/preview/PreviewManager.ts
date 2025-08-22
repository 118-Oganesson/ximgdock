import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class PreviewManager {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private updateTimer: NodeJS.Timeout | undefined;
    private currentDocument: vscode.TextDocument | undefined;
    private currentEditor: vscode.TextEditor | undefined;
    private isUpdatingFromWebview = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.setupEditorEventHandlers();
    }

    private setupEditorEventHandlers() {
        // エディタでダブルクリックされた時の処理
        vscode.window.onDidChangeTextEditorSelection((event) => {
            if (this.isUpdatingFromWebview) {
                return;
            }

            if (this.panel && event.textEditor.document === this.currentDocument) {
                const line = event.selections[0].start.line;
                this.panel.webview.postMessage({
                    command: 'scrollToLine',
                    line: line
                });
            }
        });
    }

    // サポートする言語IDをチェックするヘルパーメソッド
    private isSupportedLanguage(languageId: string): boolean {
        return ['html', 'xhtml', 'xml'].includes(languageId);
    }

    public showPreview() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('アクティブなエディターがありません');
            return;
        }

        if (!this.isSupportedLanguage(editor.document.languageId)) {
            vscode.window.showWarningMessage('HTML/XHTMLファイルを開いてください');
            return;
        }

        if (this.panel) {
            this.panel.reveal();
        } else {
            this.createWebviewPanel();
        }

        this.currentEditor = editor;
        this.updatePreview(editor.document);
    }

    public updatePreview(document: vscode.TextDocument) {
        if (!this.panel || !this.isSupportedLanguage(document.languageId)) {
            return;
        }

        this.currentDocument = document;

        // デバウンス処理
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }

        const config = vscode.workspace.getConfiguration('ximgdock');
        const debounceDelay = config.get<number>('previewDebounceDelay', 300);

        this.updateTimer = setTimeout(() => {
            this.doUpdatePreview();
        }, debounceDelay);
    }

    private createWebviewPanel() {
        this.panel = vscode.window.createWebviewPanel(
            'ximgdockPreview',
            'XImgDock Preview',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'src', 'preview', 'webview'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                    // ワークスペース全体を許可（画像ファイルアクセス用）
                    ...(vscode.workspace.workspaceFolders || []).map(folder => folder.uri)
                ],
                retainContextWhenHidden: true
            }
        );

        // WebViewのHTMLを設定
        this.panel.webview.html = this.getWebviewContent();

        // メッセージハンドラーの設定
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'scrollToLine':
                        this.scrollToLine(message.line);
                        break;
                    case 'ready':
                        // WebViewが準備完了したら初期コンテンツを送信
                        if (this.currentDocument) {
                            this.doUpdatePreview();
                        }
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // パネルが閉じられたときの処理
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.currentEditor = undefined;
        }, null, this.context.subscriptions);
    }

    private doUpdatePreview() {
        if (!this.panel || !this.currentDocument) {
            return;
        }

        const content = this.currentDocument.getText();
        const processedContent = this.processXHTMLContent(content);

        this.panel.webview.postMessage({
            command: 'updateContent',
            content: processedContent,
            baseUri: this.getDocumentBaseUri()
        });
    }

    private getDocumentBaseUri(): string {
        if (!this.currentDocument) {
            return '';
        }

        const documentDir = path.dirname(this.currentDocument.uri.fsPath);
        const documentDirUri = vscode.Uri.file(documentDir);
        return this.panel!.webview.asWebviewUri(documentDirUri).toString();
    }

    private processXHTMLContent(content: string): string {
        // 各行にdata-line属性を追加
        const lines = content.split('\n');
        const processedLines = lines.map((line, index) => {
            // HTMLタグがある場合、data-line属性を追加
            if (line.trim().startsWith('<') && !line.trim().startsWith('<!--')) {
                const tagMatch = line.match(/^(\s*)(<[^>]+?)(\/?>.*)/);
                if (tagMatch) {
                    const [, indent, tag, rest] = tagMatch;
                    // 自己終了タグや終了タグでない場合のみdata-line属性を追加
                    if (!tag.startsWith('</') && !tag.includes('data-line')) {
                        return `${indent}${tag} data-line="${index}"${rest}`;
                    }
                }
            }
            return line;
        });

        // 画像パスを修正
        let processedContent = processedLines.join('\n');
        processedContent = this.fixImagePaths(processedContent);

        return processedContent;
    }

    private fixImagePaths(content: string): string {
        if (!this.currentDocument) {
            return content;
        }

        const documentDir = path.dirname(this.currentDocument.uri.fsPath);

        // img タグの src 属性を修正
        return content.replace(/<img([^>]*?)src=["']([^"']+?)["']([^>]*?)>/g, (match, before, src, after) => {
            // 絶対パスやHTTP URLの場合はそのまま
            if (src.startsWith('http') || src.startsWith('https') || src.startsWith('data:') || path.isAbsolute(src)) {
                return match;
            }

            // 相対パスの場合、webview用のURIに変換
            const fullPath = path.resolve(documentDir, src);
            try {
                const fileUri = vscode.Uri.file(fullPath);
                const webviewUri = this.panel!.webview.asWebviewUri(fileUri);
                return `<img${before}src="${webviewUri.toString()}"${after}>`;
            } catch (error) {
                console.error('Failed to convert image path:', error);
                return match;
            }
        });
    }

    private scrollToLine(line: number) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== this.currentDocument) {
            return;
        }

        this.isUpdatingFromWebview = true;

        const range = new vscode.Range(line, 0, line, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        // カーソルも移動
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);

        // フラグをリセット
        setTimeout(() => {
            this.isUpdatingFromWebview = false;
        }, 100);
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XImgDock Preview</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            overflow-x: auto;
        }

        /* データライン属性を持つ要素のスタイル */
        [data-line] {
            border-left: 3px solid transparent;
            padding-left: 8px;
            margin-left: -11px;
            cursor: pointer;
            transition: all 0.2s ease;
            border-radius: 2px;
        }

        [data-line]:hover {
            border-left-color: var(--vscode-editor-lineHighlightBorder, #3794ff);
            background-color: var(--vscode-editor-lineHighlightBackground, rgba(55, 148, 255, 0.1));
        }

        .line-highlight {
            border-left-color: var(--vscode-editor-selectionBackground, #264f78) !important;
            background-color: var(--vscode-editor-selectionBackground, rgba(38, 79, 120, 0.3)) !important;
        }

        /* 画像のスタイリング */
        img {
            max-width: 100%;
            height: auto;
            border: 1px solid var(--vscode-editor-lineHighlightBorder, #3794ff);
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        img:hover {
            transform: scale(1.02);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }

        img.error {
            border-color: var(--vscode-errorForeground, #f14c4c);
            background: var(--vscode-inputValidation-errorBackground, rgba(241, 76, 76, 0.1));
            padding: 10px;
        }

        /* エラー表示のスタイル */
        .error {
            color: var(--vscode-errorForeground, #f14c4c);
            background-color: var(--vscode-inputValidation-errorBackground, rgba(241, 76, 76, 0.1));
            border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c);
            padding: 15px;
            margin: 15px 0;
            border-radius: 6px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        }

        .error h3 {
            margin-top: 0;
            margin-bottom: 10px;
            color: var(--vscode-errorForeground, #f14c4c);
        }

        .error pre {
            background-color: var(--vscode-editor-background, #1e1e1e);
            border: 1px solid var(--vscode-editor-lineHighlightBorder, #3794ff);
            border-radius: 4px;
            padding: 10px;
            overflow-x: auto;
            font-size: 12px;
        }

        /* 読み込み中のスタイル */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 200px;
            color: var(--vscode-foreground, #cccccc);
            font-size: 16px;
        }

        .loading::before {
            content: '';
            width: 20px;
            height: 20px;
            border: 2px solid var(--vscode-editor-lineHighlightBorder, #3794ff);
            border-top: 2px solid transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="content" class="loading">
        プレビューを読み込み中...
    </div>
    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            let currentHighlightLine = -1;
            let baseUri = '';

            // VS Code拡張からのメッセージを受信
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'updateContent':
                        baseUri = message.baseUri || '';
                        updateContent(message.content);
                        break;
                    case 'scrollToLine':
                        scrollToLine(message.line);
                        break;
                }
            });

            function updateContent(content) {
                const contentDiv = document.getElementById('content');
                
                try {
                    // XHTMLコンテンツをレンダリング
                    contentDiv.innerHTML = content;
                    contentDiv.classList.remove('loading');

                    // data-line属性を持つ要素にイベントリスナーを追加
                    const elementsWithLine = contentDiv.querySelectorAll('[data-line]');
                    elementsWithLine.forEach(element => {
                        element.addEventListener('dblclick', (e) => {
                            e.stopPropagation();
                            const line = parseInt(element.getAttribute('data-line'));
                            vscode.postMessage({
                                command: 'scrollToLine',
                                line: line
                            });
                        });
                    });

                    // 画像の読み込みエラーハンドリング
                    const images = contentDiv.querySelectorAll('img');
                    images.forEach(img => {
                        img.addEventListener('error', (e) => {
                            img.classList.add('error');
                            img.alt = \`画像を読み込めませんでした: \${img.src}\`;
                            console.error('Image load error:', img.src);
                        });
                    });
                    
                } catch (error) {
                    contentDiv.innerHTML = \`
                        <div class="error">
                            <h3>プレビューエラー</h3>
                            <p>XHTMLコンテンツの表示中にエラーが発生しました:</p>
                            <pre>\${error.message}</pre>
                        </div>
                    \`;
                    contentDiv.classList.remove('loading');
                }
            }

            function scrollToLine(line) {
                // 現在のハイライトを削除
                const prevElement = document.querySelector('.line-highlight');
                if (prevElement) {
                    prevElement.classList.remove('line-highlight');
                }
                
                // 新しいハイライトを設定
                const element = document.querySelector(\`[data-line="\${line}"]\`);
                if (element) {
                    element.classList.add('line-highlight');
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                    currentHighlightLine = line;
                }
            }

            // 初期化完了を通知
            vscode.postMessage({
                command: 'ready'
            });
        })();
    </script>
</body>
</html>`;
    }

    public dispose() {
        if (this.panel) {
            this.panel.dispose();
        }

        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
    }
}
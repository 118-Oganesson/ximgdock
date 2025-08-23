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
    private lastClickTime = 0;
    private lastClickLine = -1;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.setupEditorEventHandlers();
    }

    private setupEditorEventHandlers() {
        // エディタでマウスクリックを検出するための処理
        vscode.window.onDidChangeTextEditorSelection((event) => {
            if (this.isUpdatingFromWebview) {
                return;
            }

            if (this.panel && event.textEditor.document === this.currentDocument) {
                // ダブルクリックの検出（簡易版）
                const currentTime = Date.now();
                const line = event.selections[0].start.line;

                // 同じ行を短時間で2回クリックした場合をダブルクリックとみなす
                if (currentTime - this.lastClickTime < 500 && line === this.lastClickLine) {
                    this.panel.webview.postMessage({
                        command: 'scrollToLine',
                        line: line
                    });
                }

                this.lastClickTime = currentTime;
                this.lastClickLine = line;
            }
        });

        // テキストエディタの変更も監視
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (this.panel && event.document === this.currentDocument) {
                this.updatePreview(event.document);
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
                console.log('Received message from webview:', message);
                switch (message.command) {
                    case 'scrollToLine':
                        console.log('PreviewManager: scrollToLine called with line:', message.line);
                        this.scrollToLine(message.line);
                        break;
                    case 'ready':
                        console.log('PreviewManager: webview ready');
                        // WebViewが準備完了したら初期コンテンツを送信
                        if (this.currentDocument) {
                            this.doUpdatePreview();
                        }
                        break;
                    case 'elementClicked':
                        console.log('PreviewManager: elementClicked with line:', message.line);
                        this.scrollToLine(message.line);
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

        console.log('PreviewManager: sending content to webview');
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
        // 各行にdata-line属性を追加（改良版）
        const lines = content.split('\n');
        const processedLines = lines.map((line, index) => {
            const trimmedLine = line.trim();

            // 空行やコメント行はスキップ
            if (!trimmedLine || trimmedLine.startsWith('<!--') || trimmedLine.startsWith('<?xml') || trimmedLine.startsWith('<!DOCTYPE')) {
                return line;
            }

            // HTMLタグがある場合、data-line属性を追加
            if (trimmedLine.includes('<') && trimmedLine.includes('>')) {
                // 複数のタグが含まれる場合も考慮
                let processedLine = line;

                // 開始タグを検索して data-line 属性を追加
                const tagRegex = /<(\w+)(\s[^>]*?)?(\s*\/?>)/g;
                let match;
                let offset = 0;

                while ((match = tagRegex.exec(line)) !== null) {
                    const [fullMatch, tagName, attributes = '', ending] = match;
                    const isClosingTag = fullMatch.startsWith('</');

                    // 終了タグでない場合のみ data-line 属性を追加
                    if (!isClosingTag && !fullMatch.includes('data-line')) {
                        const newTag = `<${tagName}${attributes} data-line="${index}"${ending}`;
                        processedLine = processedLine.substring(0, match.index + offset) +
                            newTag +
                            processedLine.substring(match.index + offset + fullMatch.length);
                        offset += newTag.length - fullMatch.length;
                    }
                }

                return processedLine;
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
        console.log('PreviewManager: scrollToLine called with line:', line);
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== this.currentDocument) {
            console.log('PreviewManager: no active editor or document mismatch');
            return;
        }

        this.isUpdatingFromWebview = true;
        console.log('PreviewManager: setting isUpdatingFromWebview to true');

        const range = new vscode.Range(line, 0, line, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        // カーソルも移動
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);

        console.log('PreviewManager: scrolled to line', line);

        // フラグをリセット
        setTimeout(() => {
            this.isUpdatingFromWebview = false;
            console.log('PreviewManager: reset isUpdatingFromWebview to false');
        }, 100);
    }

    private getWebviewContent(): string {
        // 外部ファイルのパスを取得
        const htmlUri = vscode.Uri.joinPath(this.context.extensionUri, 'src', 'preview', 'webview', 'index.html');
        const scriptUri = vscode.Uri.joinPath(this.context.extensionUri, 'src', 'preview', 'webview', 'script.js');

        const htmlWebviewUri = this.panel!.webview.asWebviewUri(htmlUri);
        const scriptWebviewUri = this.panel!.webview.asWebviewUri(scriptUri);

        // HTMLファイルの内容を読み込んで、スクリプトのパスを動的に設定
        try {
            let htmlContent = fs.readFileSync(htmlUri.fsPath, 'utf8');
            // スクリプトのsrcを正しいWebview URIに置き換え
            htmlContent = htmlContent.replace(
                '<script src="script.js"></script>',
                `<script src="${scriptWebviewUri.toString()}"></script>`
            );
            return htmlContent;
        } catch (error) {
            console.error('Failed to load HTML content:', error);
            // フォールバック: インライン版を返す
            return this.getFallbackWebviewContent();
        }
    }

    private getFallbackWebviewContent(): string {
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

        [data-line] {
            border-left: 3px solid transparent;
            padding-left: 8px;
            margin-left: -11px;
            cursor: pointer;
            transition: all 0.2s ease;
            border-radius: 2px;
            position: relative;
        }

        [data-line]:hover {
            border-left-color: var(--vscode-editor-lineHighlightBorder, #3794ff);
            background-color: var(--vscode-editor-lineHighlightBackground, rgba(55, 148, 255, 0.1));
        }

        [data-line]:hover::before {
            content: "Line " attr(data-line);
            position: absolute;
            left: -60px;
            top: 50%;
            transform: translateY(-50%);
            background: var(--vscode-editor-background);
            color: var(--vscode-editorLineNumber-foreground);
            font-size: 11px;
            padding: 2px 4px;
            border-radius: 2px;
            border: 1px solid var(--vscode-editor-lineHighlightBorder);
            z-index: 100;
            white-space: nowrap;
        }

        .line-highlight {
            border-left-color: var(--vscode-editor-selectionBackground, #264f78) !important;
            background-color: var(--vscode-editor-selectionBackground, rgba(38, 79, 120, 0.3)) !important;
        }

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

        br[data-line] {
            display: inline-block;
            width: 100%;
            height: 1px;
            margin: 2px 0;
            border-bottom: 1px dotted var(--vscode-editor-lineHighlightBorder, rgba(55, 148, 255, 0.3));
        }

        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 200px;
            color: var(--vscode-foreground, #cccccc);
            font-size: 16px;
        }
    </style>
</head>
<body>
    <div id="content" class="loading">
        プレビューを読み込み中...
    </div>
    <script>
        console.log('Fallback script loading');
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            console.log('Fallback: received message', message.command);
            
            switch (message.command) {
                case 'updateContent':
                    updateContent(message.content);
                    break;
                case 'scrollToLine':
                    scrollToLine(message.line);
                    break;
            }
        });

        function updateContent(content) {
            console.log('Fallback: updating content');
            const contentDiv = document.getElementById('content');
            contentDiv.innerHTML = content;
            contentDiv.classList.remove('loading');

            const elementsWithLine = contentDiv.querySelectorAll('[data-line]');
            console.log('Fallback: found', elementsWithLine.length, 'elements with data-line');
            
            elementsWithLine.forEach(element => {
                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const line = parseInt(element.getAttribute('data-line'));
                    console.log('Fallback: element clicked, line:', line);
                    vscode.postMessage({
                        command: 'elementClicked',
                        line: line
                    });
                });
            });
        }

        function scrollToLine(line) {
            console.log('Fallback: scrolling to line:', line);
            const element = document.querySelector(\`[data-line="\${line}"]\`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('line-highlight');
            }
        }

        vscode.postMessage({ command: 'ready' });
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
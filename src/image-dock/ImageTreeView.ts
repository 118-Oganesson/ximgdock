import * as vscode from 'vscode';
import * as path from 'path';
import { ImageDockProvider, ImageItem } from './ImageDockProvider';

export class ImageTreeView {
    private webviewPanel: vscode.WebviewPanel | undefined;
    private images: ImageItem[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private provider: ImageDockProvider
    ) { }

    public async createWebviewTreeView() {
        if (this.webviewPanel) {
            this.webviewPanel.reveal();
            return;
        }

        this.webviewPanel = vscode.window.createWebviewPanel(
            'imageTreeView',
            'Image Gallery',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file(''),
                    this.context.extensionUri
                ],
                retainContextWhenHidden: true
            }
        );

        this.webviewPanel.webview.html = await this.getWebviewContent();

        // メッセージハンドリング
        this.webviewPanel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'insertImage':
                        this.insertImage(message.imagePath, message.fileName);
                        break;

                    case 'showPreview':
                        this.showImagePreview(message.imagePath, message.fileName);
                        break;

                    // ▼▼▼ 以下を追加 ▼▼▼
                    case 'selectFolder':
                        // フォルダ選択を実行するコマンドを呼び出す
                        vscode.commands.executeCommand('ximgdock.selectImageFolder');
                        break;

                    case 'refresh':
                        // 画像一覧の更新を実行するコマンドを呼び出す
                        vscode.commands.executeCommand('ximgdock.refresh');
                        break;

                    case 'changeSort':
                        // ソート順の変更を実行するコマンドを呼び出す
                        vscode.commands.executeCommand('ximgdock.changeSortOrder');
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.webviewPanel.onDidDispose(() => {
            this.webviewPanel = undefined;
        });
    }

    public async updateImages(images: ImageItem[]) {
        this.images = images;
        if (this.webviewPanel) {
            this.webviewPanel.webview.postMessage({
                command: 'updateImages',
                images: await this.serializeImages(images)
            });
        }
    }

    private async serializeImages(images: ImageItem[]): Promise<any[]> {
        const serializedImages = [];

        for (const image of images) {
            try {
                const webviewUri = this.webviewPanel!.webview.asWebviewUri(image.filePath);
                serializedImages.push({
                    fileName: image.fileName,
                    filePath: image.filePath.fsPath,
                    webviewUri: webviewUri.toString(),
                    size: image.size,
                    modifiedDate: image.modifiedDate.toISOString(),
                    sizeKB: (image.size / 1024).toFixed(1)
                });
            } catch (error) {
                console.error(`Failed to process image ${image.fileName}:`, error);
            }
        }

        return serializedImages;
    }

    private insertImage(imagePath: string, fileName: string) {
        // extension.ts の insertImageTag 関数を呼び出し
        vscode.commands.executeCommand('ximgdock.insertImage', {
            filePath: vscode.Uri.file(imagePath),
            fileName: fileName
        });
    }

    private showImagePreview(imagePath: string, fileName: string) {
        vscode.commands.executeCommand('ximgdock.showImagePreview', {
            filePath: vscode.Uri.file(imagePath),
            fileName: fileName
        });
    }

    private async getWebviewContent(): Promise<string> {
        const config = vscode.workspace.getConfiguration('ximgdock');
        const thumbnailSize = config.get<number>('thumbnailSize', 128);

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Gallery</title>
    <style>
        body {
            margin: 0;
            padding: 10px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .gallery {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(${thumbnailSize + 40}px, 1fr));
            gap: 15px;
            padding: 10px;
        }
        
        .image-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
        }
        
        .image-item:hover {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-hoverBackground);
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        
        .thumbnail {
            width: ${thumbnailSize}px;
            height: ${thumbnailSize}px;
            object-fit: cover;
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
        }
        
        .image-info {
            margin-top: 8px;
            text-align: center;
            width: 100%;
        }
        
        .filename {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 4px;
            word-break: break-word;
            line-height: 1.2;
        }
        
        .file-details {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.2;
        }
        
        .controls {
            position: sticky;
            top: 0;
            background-color: var(--vscode-editor-background);
            padding: 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
            margin-bottom: 10px;
            z-index: 100;
        }
        
        .control-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 8px;
            font-size: 12px;
        }
        
        .control-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        
        .context-menu {
            position: fixed;
            background-color: var(--vscode-menu-background);
            border: 1px solid var(--vscode-menu-border);
            border-radius: 4px;
            padding: 4px 0;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            display: none;
        }
        
        .context-menu-item {
            padding: 6px 16px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.1s;
        }
        
        .context-menu-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="controls">
        <button class="control-button" onclick="selectFolder()">📁 フォルダ選択</button>
        <button class="control-button" onclick="refreshImages()">🔄 更新</button>
        <button class="control-button" onclick="changeSort()">📊 ソート</button>
    </div>
    
    <div id="gallery" class="gallery">
        <div class="empty-state">
            画像フォルダを選択してください
        </div>
    </div>
    
    <div id="contextMenu" class="context-menu">
        <div class="context-menu-item" onclick="contextInsert()">📄 画像を挿入</div>
        <div class="context-menu-item" onclick="contextPreview()">👁️ プレビュー表示</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentContextImage = null;
        
        // VS Codeからのメッセージを受信
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateImages':
                    updateImageGallery(message.images);
                    break;
            }
        });
        
        function updateImageGallery(images) {
            const gallery = document.getElementById('gallery');
            
            if (!images || images.length === 0) {
                gallery.innerHTML = '<div class="empty-state">画像が見つかりませんでした</div>';
                return;
            }
            
            gallery.innerHTML = '';
            
            images.forEach(image => {
                const item = document.createElement('div');
                item.className = 'image-item';
                item.addEventListener('click', () => insertImage(image.filePath, image.fileName));
                item.addEventListener('contextmenu', (e) => showContextMenu(e, image));
                
                item.innerHTML = \`
                    <img src="\${image.webviewUri}" alt="\${image.fileName}" class="thumbnail"
                         onerror="this.style.display='none';">
                    <div class="image-info">
                        <div class="filename">\${image.fileName}</div>
                        <div class="file-details">\${image.sizeKB} KB</div>
                    </div>
                \`;
                
                gallery.appendChild(item);
            });
        }
        
        function insertImage(imagePath, fileName) {
            vscode.postMessage({
                command: 'insertImage',
                imagePath: imagePath,
                fileName: fileName
            });
        }
        
        function showPreview(imagePath, fileName) {
            vscode.postMessage({
                command: 'showPreview',
                imagePath: imagePath,
                fileName: fileName
            });
        }
        
        function showContextMenu(event, image) {
            event.preventDefault();
            currentContextImage = image;
            
            const menu = document.getElementById('contextMenu');
            menu.style.display = 'block';
            menu.style.left = event.pageX + 'px';
            menu.style.top = event.pageY + 'px';
        }
        
        function contextInsert() {
            if (currentContextImage) {
                insertImage(currentContextImage.filePath, currentContextImage.fileName);
            }
            hideContextMenu();
        }
        
        function contextPreview() {
            if (currentContextImage) {
                showPreview(currentContextImage.filePath, currentContextImage.fileName);
            }
            hideContextMenu();
        }
        
        function hideContextMenu() {
            document.getElementById('contextMenu').style.display = 'none';
            currentContextImage = null;
        }
        
        // クリックでコンテキストメニューを隠す
        document.addEventListener('click', hideContextMenu);
        
        function selectFolder() {
            vscode.postMessage({ command: 'selectFolder' });
        }
        
        function refreshImages() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function changeSort() {
            vscode.postMessage({ command: 'changeSort' });
        }
    </script>
</body>
</html>`;
    }

    public dispose() {
        if (this.webviewPanel) {
            this.webviewPanel.dispose();
        }
    }
}
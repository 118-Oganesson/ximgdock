import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ThumbnailManager } from './ThumbnailManager';

export class ImageDockProvider implements vscode.TreeDataProvider<ImageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ImageItem | undefined | null | void> = new vscode.EventEmitter<ImageItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ImageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private imageFolder: vscode.Uri | undefined;
    private images: ImageItem[] = [];
    private thumbnailManager: ThumbnailManager;
    private sortOrder: 'name' | 'size' | 'date' = 'name';
    private hoverWebviewPanel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {
        this.thumbnailManager = new ThumbnailManager(context);
        this.registerHoverProvider();
    }

    private registerHoverProvider() {
        // Tree View のホバー処理
        const disposable = vscode.commands.registerCommand('ximgdock.showImagePreview', (imageItem: ImageItem) => {
            this.showImagePreview(imageItem);
        });
        this.context.subscriptions.push(disposable);
    }

    private showImagePreview(imageItem: ImageItem) {
        if (this.hoverWebviewPanel) {
            this.hoverWebviewPanel.dispose();
        }

        this.hoverWebviewPanel = vscode.window.createWebviewPanel(
            'imagePreview',
            `プレビュー: ${imageItem.fileName}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: false,
                localResourceRoots: [
                    vscode.Uri.file(path.dirname(imageItem.filePath.fsPath)),
                    this.context.extensionUri
                ]
            }
        );

        const webviewUri = this.hoverWebviewPanel.webview.asWebviewUri(imageItem.filePath);
        const sizeKB = (imageItem.size / 1024).toFixed(1);
        const dateStr = imageItem.modifiedDate.toLocaleDateString();

        this.hoverWebviewPanel.webview.html = this.getPreviewHtml(
            webviewUri.toString(),
            imageItem.fileName,
            sizeKB,
            dateStr,
            imageItem.filePath.fsPath
        );

        this.hoverWebviewPanel.onDidDispose(() => {
            this.hoverWebviewPanel = undefined;
        });
    }

    private getPreviewHtml(imageUri: string, fileName: string, sizeKB: string, dateStr: string, fullPath: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>画像プレビュー</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .container {
            max-width: 100%;
            text-align: center;
        }
        .image-container {
            margin-bottom: 20px;
            display: inline-block;
            border: 2px solid var(--vscode-widget-border);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .preview-image {
            max-width: 80vw;
            max-height: 80vh;
            width: auto;
            height: auto;
            display: block;
            background: white;
        }
        .info {
            text-align: left;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 4px;
            margin-top: 10px;
        }
        .info-item {
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
        }
        .info-label {
            font-weight: bold;
            color: var(--vscode-symbolIcon-keywordForeground);
        }
        .info-value {
            color: var(--vscode-editor-foreground);
            font-family: monospace;
        }
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="image-container">
            <img src="${imageUri}" alt="${fileName}" class="preview-image" 
                 onerror="this.style.display='none'; document.getElementById('error').style.display='block';">
        </div>
        <div id="error" class="error" style="display: none;">
            画像の読み込みに失敗しました
        </div>
        <div class="info">
            <div class="info-item">
                <span class="info-label">ファイル名:</span>
                <span class="info-value">${fileName}</span>
            </div>
            <div class="info-item">
                <span class="info-label">サイズ:</span>
                <span class="info-value">${sizeKB} KB</span>
            </div>
            <div class="info-item">
                <span class="info-label">更新日:</span>
                <span class="info-value">${dateStr}</span>
            </div>
            <div class="info-item">
                <span class="info-label">パス:</span>
                <span class="info-value">${fullPath}</span>
            </div>
        </div>
    </div>
</body>
</html>`;
    }

    public async setImageFolder(folderUri: vscode.Uri) {
        this.imageFolder = folderUri;
        await this.loadImages();
        this.refresh();
    }

    public setSortOrder(order: 'name' | 'size' | 'date') {
        this.sortOrder = order;
        this.sortImages();
        this.refresh();
    }

    public refresh(): void {
        if (this.imageFolder) {
            this.loadImages();
        }
        this._onDidChangeTreeData.fire();
    }

    public clearThumbnailCache(): void {
        this.thumbnailManager.clearCache();
        this.refresh();
    }

    public onConfigurationChanged(): void {
        const config = vscode.workspace.getConfiguration('ximgdock');
        const newThumbnailSize = config.get<number>('thumbnailSize', 128);
        this.thumbnailManager.updateThumbnailSize(newThumbnailSize);
        this.refresh();
    }

    public dispose(): void {
        if (this.hoverWebviewPanel) {
            this.hoverWebviewPanel.dispose();
        }
        this.thumbnailManager.dispose();
    }

    getTreeItem(element: ImageItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ImageItem): Thenable<ImageItem[]> {
        if (!this.imageFolder) {
            return Promise.resolve([]);
        }

        if (!element) {
            return Promise.resolve(this.images);
        }

        return Promise.resolve([]);
    }

    private async loadImages() {
        if (!this.imageFolder) {
            this.images = [];
            return;
        }

        try {
            const files = await vscode.workspace.fs.readDirectory(this.imageFolder);
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];

            const imagePromises = files
                .filter(([name, type]) =>
                    type === vscode.FileType.File &&
                    imageExtensions.some(ext => name.toLowerCase().endsWith(ext))
                )
                .map(async ([name, type]) => {
                    const filePath = vscode.Uri.joinPath(this.imageFolder!, name);
                    const stats = await vscode.workspace.fs.stat(filePath);

                    return new ImageItem(
                        name,
                        filePath,
                        stats.size,
                        new Date(stats.mtime),
                        this.thumbnailManager,
                        this.context
                    );
                });

            this.images = await Promise.all(imagePromises);
            this.sortImages();

        } catch (error) {
            console.error('Failed to load images:', error);
            this.images = [];
        }
    }

    private sortImages() {
        this.images.sort((a, b) => {
            switch (this.sortOrder) {
                case 'name':
                    return a.fileName.localeCompare(b.fileName);
                case 'size':
                    return b.size - a.size;
                case 'date':
                    return b.modifiedDate.getTime() - a.modifiedDate.getTime();
                default:
                    return 0;
            }
        });
    }
}

export class ImageItem extends vscode.TreeItem {
    constructor(
        public readonly fileName: string,
        public readonly filePath: vscode.Uri,
        public readonly size: number,
        public readonly modifiedDate: Date,
        private thumbnailManager: ThumbnailManager,
        private context?: vscode.ExtensionContext
    ) {
        super(fileName, vscode.TreeItemCollapsibleState.None);

        this.tooltip = this.createTooltip();
        this.contextValue = 'imageItem';

        // サムネイルアイコンを設定
        this.setIcon();

        // ダブルクリックでの画像挿入コマンド
        this.command = {
            command: 'ximgdock.insertImage',
            title: '画像を挿入',
            arguments: [this]
        };

        // 右クリックメニューにプレビュー追加
        this.contextValue = 'imageItem';
    }

    private createTooltip(): string {
        const sizeKB = (this.size / 1024).toFixed(1);
        const dateStr = this.modifiedDate.toLocaleDateString();
        return `${this.fileName}\nサイズ: ${sizeKB} KB\n更新日: ${dateStr}`;
    }

    private async setIcon() {
        try {
            const thumbnailUri = await this.thumbnailManager.getThumbnail(this.filePath);
            this.iconPath = thumbnailUri;

            // アイテムの表示を更新
            this.resourceUri = this.filePath;
        } catch (error) {
            console.error('Failed to generate thumbnail:', error);
            // フォールバック用のアイコン
            this.iconPath = new vscode.ThemeIcon('file-media');
        }
    }
}
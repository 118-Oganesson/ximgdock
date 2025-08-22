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

    constructor(private context: vscode.ExtensionContext) {
        this.thumbnailManager = new ThumbnailManager(context);
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
                        this.thumbnailManager
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
        private thumbnailManager: ThumbnailManager
    ) {
        super(fileName, vscode.TreeItemCollapsibleState.None);
        
        this.tooltip = this.getTooltip();
        this.contextValue = 'imageItem';
        
        // サムネイルアイコンを設定
        this.setIcon();
        
        // ダブルクリックでの画像挿入コマンド
        this.command = {
            command: 'ximgdock.insertImage',
            title: '画像を挿入',
            arguments: [this]
        };
    }

    private getTooltip(): string {
        const sizeKB = (this.size / 1024).toFixed(1);
        const dateStr = this.modifiedDate.toLocaleDateString();
        return `${this.fileName}\nサイズ: ${sizeKB} KB\n更新日: ${dateStr}`;
    }

    private async setIcon() {
        try {
            const thumbnailUri = await this.thumbnailManager.getThumbnail(this.filePath);
            this.iconPath = thumbnailUri;
        } catch (error) {
            console.error('Failed to generate thumbnail:', error);
            // フォールバック用のアイコン
            this.iconPath = new vscode.ThemeIcon('file-media');
        }
    }
}
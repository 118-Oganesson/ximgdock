// src/imageGalleryPanel.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PreviewProvider } from './previewProvider';

// Image file information type
type ImageFile = {
    name: string;
    mtime: number; // Modification date
};

export class ImageGalleryPanel {
    public static currentPanel: ImageGalleryPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private _sourceEditor: vscode.TextEditor | undefined;
    private _folderPath: string | undefined;
    private _previewProvider: PreviewProvider;

    private _sortBy: 'name' | 'date' = 'name';
    private _watcher: fs.FSWatcher | undefined;

    public static createOrShow(extensionUri: vscode.Uri, editor: vscode.TextEditor | undefined, previewProvider: PreviewProvider) {
        const column = vscode.ViewColumn.Three;

        if (ImageGalleryPanel.currentPanel) {
            ImageGalleryPanel.currentPanel._panel.reveal(column);
            ImageGalleryPanel.currentPanel._sourceEditor = editor;
            ImageGalleryPanel.currentPanel._previewProvider = previewProvider;
            return;
        }
        const panel = vscode.window.createWebviewPanel('imageGallery', 'Image Gallery', column, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file('/')]
        });
        ImageGalleryPanel.currentPanel = new ImageGalleryPanel(panel, extensionUri, editor, previewProvider);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, editor: vscode.TextEditor | undefined, previewProvider: PreviewProvider) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._sourceEditor = editor;
        this._previewProvider = previewProvider;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'selectFolder':
                        await this._selectFolderAndUpdateImages();
                        return;
                    case 'insertImage':
                        this._insertImageTag(message.fileName);
                        return;
                    case 'refresh':
                        this._update();
                        return;
                    case 'sort':
                        this._sortBy = message.sortBy;
                        this._update();
                        return;
                }
            }, null, this._disposables);
    }

    private _setupWatcher(folderPath: string) {
        if (this._watcher) {
            this._watcher.close();
        }
        try {
            this._watcher = fs.watch(folderPath, (event, filename) => {
                setTimeout(() => this._update(), 100);
            });
            this._disposables.push({ dispose: () => this._watcher?.close() });
        } catch (e) {
            console.error(`Failed to watch folder: ${folderPath}`, e);
            vscode.window.showErrorMessage(`Could not watch folder: ${folderPath}`);
        }
    }

    private async _selectFolderAndUpdateImages() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false, openLabel: 'Select Image Folder',
            canSelectFiles: false, canSelectFolders: true
        };
        const folderUri = await vscode.window.showOpenDialog(options);
        if (folderUri && folderUri[0]) {
            this._folderPath = folderUri[0].fsPath;
            this._setupWatcher(this._folderPath);
            this._update();
        }
    }

    private _insertImageTag(fileName: string) {
        // 👇 Here is the corrected block
        if (!this._sourceEditor || !this._folderPath) {
            return;
        }

        const editor = this._sourceEditor;
        const imagePath = path.join(this._folderPath, fileName);
        const docDir = path.dirname(editor.document.uri.fsPath);
        let relativePath = path.relative(docDir, imagePath).replace(/\\/g, '/');
        if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
            relativePath = './' + relativePath;
        }
        const altText = path.basename(fileName, path.extname(fileName));

        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, `<img src="${relativePath}" alt="${altText}" />`);
        }).then(success => {
            if (success) {
                this._previewProvider.update(editor.document);
            }
        });
    }

    public dispose() {
        ImageGalleryPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._getHtmlForWebview().then(html => {
            this._panel.webview.html = html;
        });
    }

    private async _getHtmlForWebview(): Promise<string> {
        const galleryHtmlPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'gallery.html');
        let html = fs.readFileSync(galleryHtmlPath.fsPath, 'utf8');

        let imageGridHtml = '<p>Please select a folder to display images.</p>';

        if (this._folderPath) {
            const supportedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
            try {
                const files = fs.readdirSync(this._folderPath);

                let imageFiles: ImageFile[] = files
                    .map(file => {
                        const filePath = path.join(this._folderPath!, file);
                        try {
                            const stat = fs.statSync(filePath);
                            if (stat.isFile() && supportedExtensions.includes(path.extname(file).toLowerCase())) {
                                return { name: file, mtime: stat.mtime.getTime() };
                            }
                        } catch { return null; }
                        return null;
                    })
                    .filter((file): file is ImageFile => file !== null);

                imageFiles.sort((a, b) => {
                    if (this._sortBy === 'date') {
                        return b.mtime - a.mtime;
                    }
                    return a.name.localeCompare(b.name);
                });

                const imageItems = imageFiles.map(file => {
                    const filePath = path.join(this._folderPath!, file.name);
                    const webviewUri = this._panel.webview.asWebviewUri(vscode.Uri.file(filePath));
                    return `
                        <div class="image-item" data-filename="${file.name}">
                            <img src="${webviewUri}" alt="${file.name}" />
                            <div class="filename">${file.name}</div>
                        </div>
                    `;
                });

                if (imageItems.length > 0) {
                    imageGridHtml = imageItems.join('');
                } else {
                    imageGridHtml = '<p>No supported images found in the selected folder.</p>';
                }
            } catch (error) {
                imageGridHtml = '<p>Error reading the selected folder.</p>';
            }
        }

        html = html.replace('{{imageGrid}}', imageGridHtml);
        return html;
    }
}
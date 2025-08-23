import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewManager } from './preview/PreviewManager';
import { ImageDockProvider } from './image-dock/ImageDockProvider';
import { DiagnosticManager } from './diagnostics/DiagnosticManager';
import { ImageTreeView } from './image-dock/ImageTreeView';

let previewManager: PreviewManager;
let imageDockProvider: ImageDockProvider;
let diagnosticManager: DiagnosticManager;
let imageTreeView: ImageTreeView;

// サポートする言語IDをチェックするヘルパー関数
function isSupportedLanguage(languageId: string): boolean {
    return ['html', 'xhtml', 'xml'].includes(languageId);
}

// 画像プレビューHTML生成関数
function getImagePreviewHtml(
    imageUri: string,
    fileName: string,
    sizeKB: string,
    dateStr: string,
    fullPath: string
): string {
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

export function activate(context: vscode.ExtensionContext) {
    console.log('XImgDock extension is now active!');

    // プレビューマネージャーの初期化
    previewManager = new PreviewManager(context);

    // 画像ドックプロバイダーの初期化
    imageDockProvider = new ImageDockProvider(context);
    vscode.window.createTreeView('ximgdock-images', {
        treeDataProvider: imageDockProvider,
        showCollapseAll: true
    });

    // カスタム画像ギャラリービューの初期化
    imageTreeView = new ImageTreeView(context, imageDockProvider);

    // 診断マネージャーの初期化
    diagnosticManager = new DiagnosticManager();

    // コマンドの登録
    context.subscriptions.push(
        vscode.commands.registerCommand('ximgdock.showPreview', () => {
            previewManager.showPreview();
        }),

        vscode.commands.registerCommand('ximgdock.selectImageFolder', async () => {
            const options: vscode.OpenDialogOptions = {
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                openLabel: '画像フォルダを選択'
            };
            const folderUri = await vscode.window.showOpenDialog(options);
            if (folderUri && folderUri[0]) {
                await imageDockProvider.setImageFolder(folderUri[0]);
                vscode.window.showInformationMessage(`画像フォルダを設定しました: ${folderUri[0].fsPath}`);
            }
        }),

        vscode.commands.registerCommand('ximgdock.refreshImages', () => {
            imageDockProvider.refresh();
            vscode.window.showInformationMessage('画像一覧を更新しました');
        }),

        vscode.commands.registerCommand('ximgdock.insertImage', (imageItem) => {
            if (imageItem && imageItem.filePath) {
                insertImageTag(imageItem.filePath, imageItem.fileName);
            }
        }),

        vscode.commands.registerCommand('ximgdock.changeSortOrder', async () => {
            const options = ['ファイル名', 'サイズ', '更新日時'];
            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: 'ソート順を選択してください'
            });
            if (selected) {
                let sortOrder: 'name' | 'size' | 'date' = 'name';
                switch (selected) {
                    case 'サイズ': sortOrder = 'size'; break;
                    case '更新日時': sortOrder = 'date'; break;
                }
                imageDockProvider.setSortOrder(sortOrder);
                vscode.window.showInformationMessage(`ソート順を ${selected} に変更しました`);
            }
        }),

        vscode.commands.registerCommand('ximgdock.clearThumbnailCache', () => {
            imageDockProvider.clearThumbnailCache();
            vscode.window.showInformationMessage('サムネイルキャッシュをクリアしました');
        }),

        vscode.commands.registerCommand('ximgdock.showImageGallery', () => {
            imageTreeView.createWebviewTreeView();
        }),

        vscode.commands.registerCommand('ximgdock.showImagePreview', (imageItem) => {
            const panel = vscode.window.createWebviewPanel(
                'imagePreview',
                `プレビュー: ${imageItem.fileName}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: false,
                    localResourceRoots: [
                        vscode.Uri.file(path.dirname(imageItem.filePath.fsPath)),
                        context.extensionUri
                    ]
                }
            );
            const webviewUri = panel.webview.asWebviewUri(imageItem.filePath);
            const sizeKB = (imageItem.size / 1024).toFixed(1);
            const dateStr = imageItem.modifiedDate ? imageItem.modifiedDate.toLocaleDateString() : 'Unknown';
            panel.webview.html = getImagePreviewHtml(
                webviewUri.toString(),
                imageItem.fileName,
                sizeKB,
                dateStr,
                imageItem.filePath.fsPath
            );
        })
    );

    // ファイル変更監視など...
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const document = event.document;
            if (isSupportedLanguage(document.languageId)) {
                previewManager.updatePreview(document);
                diagnosticManager.updateDiagnostics(document);
            }
        }),
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (isSupportedLanguage(document.languageId)) {
                previewManager.updatePreview(document);
                diagnosticManager.updateDiagnostics(document);
            }
        }),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && isSupportedLanguage(editor.document.languageId)) {
                previewManager.updatePreview(editor.document);
                diagnosticManager.updateDiagnostics(editor.document);
            }
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ximgdock')) {
                imageDockProvider.onConfigurationChanged();
            }
        })
    );
}

export function deactivate() {
    console.log('XImgDock extension is now deactivated');
    previewManager?.dispose();
    diagnosticManager?.dispose();
    imageDockProvider?.dispose();
    imageTreeView?.dispose();
}

function insertImageTag(imagePath: vscode.Uri, fileName: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('アクティブなエディターがありません');
        return;
    }
    const config = vscode.workspace.getConfiguration('ximgdock');
    const useRelativePath = config.get<boolean>('useRelativePath', true);

    let relativePath = imagePath.fsPath;
    if (useRelativePath) {
        const currentDocumentPath = editor.document.uri.fsPath;
        const currentDir = path.dirname(currentDocumentPath);
        relativePath = path.relative(currentDir, imagePath.fsPath);
        relativePath = relativePath.replace(/\\/g, '/');
        if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
            relativePath = './' + relativePath;
        }
    }
    const altText = path.basename(fileName, path.extname(fileName));
    const imageTag = `<img src="${relativePath}" alt="${altText}" />`;

    editor.edit(editBuilder => {
        const position = editor.selection.active;
        editBuilder.insert(position, imageTag);
    });
}

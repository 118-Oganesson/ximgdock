import * as vscode from 'vscode';
import * as path from 'path';
import { PreviewManager } from './preview/PreviewManager';
import { ImageDockProvider } from './image-dock/ImageDockProvider';
import { DiagnosticManager } from './diagnostics/DiagnosticManager';

let previewManager: PreviewManager;
let imageDockProvider: ImageDockProvider;
let diagnosticManager: DiagnosticManager;

// サポートする言語IDをチェックするヘルパー関数
function isSupportedLanguage(languageId: string): boolean {
    return ['html', 'xhtml', 'xml'].includes(languageId);
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
                    default: sortOrder = 'name'; break;
                }
                imageDockProvider.setSortOrder(sortOrder);
                vscode.window.showInformationMessage(`ソート順を ${selected} に変更しました`);
            }
        })
    );

    // ファイル変更監視の設定
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const document = event.document;
            if (isSupportedLanguage(document.languageId)) {
                // プレビューの更新
                previewManager.updatePreview(document);

                // 診断の更新
                diagnosticManager.updateDiagnostics(document);
            }
        }),

        vscode.workspace.onDidSaveTextDocument((document) => {
            if (isSupportedLanguage(document.languageId)) {
                previewManager.updatePreview(document);
                diagnosticManager.updateDiagnostics(document);
            }
        })
    );

    // アクティブエディターの監視
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && isSupportedLanguage(editor.document.languageId)) {
                previewManager.updatePreview(editor.document);
                diagnosticManager.updateDiagnostics(editor.document);
            }
        })
    );
}

export function deactivate() {
    console.log('XImgDock extension is now deactivated');

    if (previewManager) {
        previewManager.dispose();
    }

    if (diagnosticManager) {
        diagnosticManager.dispose();
    }
}

function insertImageTag(imagePath: string, fileName: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('アクティブなエディターがありません');
        return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('ワークスペースが開かれていません');
        return;
    }

    // 相対パスを計算
    let relativePath = imagePath;

    if (workspaceFolder) {
        relativePath = path.posix.relative(
            path.posix.dirname(editor.document.uri.path),
            vscode.workspace.asRelativePath(imagePath, false)
        );

        // 相対パスが空の場合は現在のディレクトリを示す
        if (!relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
        }
    }

    // 拡張子を除いたファイル名をalt属性に使用
    const altText = fileName.replace(/\.[^/.]+$/, '');

    const imageTag = `<img src="${relativePath}" alt="${altText}" />`;

    editor.edit(editBuilder => {
        const position = editor.selection.active;
        editBuilder.insert(position, imageTag);
    });
}
// src/extension.ts
import * as vscode from 'vscode';
import { PreviewProvider } from './previewProvider';
import { ImageGalleryPanel } from './imageGalleryPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('XImgDock is now active!');

    // PreviewProviderのインスタンスを作成
    const previewProvider = new PreviewProvider(context.extensionUri);

    // コマンドを登録
    context.subscriptions.push(
        vscode.commands.registerCommand('ximgdock.showPreview', () => {
            // 現在アクティブなエディタを対象にプレビューを表示
            previewProvider.createOrShow(vscode.window.activeTextEditor);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ximgdock.showImageGallery', () => {
            ImageGalleryPanel.createOrShow(
                context.extensionUri,
                vscode.window.activeTextEditor,
                previewProvider
            );
        })
    );

    // ドキュメントが変更されたときにプレビューを更新
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
                previewProvider.update(event.document);
            }
        })
    );


    // 👇 カーソル移動のイベントリスナーを追加
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === vscode.window.activeTextEditor) {
                // アクティブな行番号を渡す
                const line = event.selections[0].active.line + 1;
                previewProvider.scrollToLine(line);
            }
        })
    );
}


export function deactivate() { }
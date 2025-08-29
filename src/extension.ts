/**
 * @file 拡張機能のエントリーポイントです。
 * 拡張機能が有効化されたときに実行される`activate`関数と、
 * 無効化されたときに実行される`deactivate`関数を定義します。
 */
import * as vscode from 'vscode';
import { PreviewProvider } from './previewProvider';
import { ImageGalleryPanel } from './imageGalleryPanel';

/**
 * 拡張機能が有効化されたときに一度だけ実行される関数です。
 * コマンドの登録やイベントリスナーの設定など、拡張機能の初期化処理を行います。
 * @param context 拡張機能のコンテキスト。コマンドの登録や状態の保存に使用します。
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('XImgDock is now active!');

    // --- プロバイダーとパネルのインスタンス化 ---
    // プレビュー機能を提供するPreviewProviderのインスタンスを作成
    const previewProvider = new PreviewProvider(context.extensionUri);

    // --- コマンドの登録 ---
    // プレビュー表示コマンド `ximgdock.showPreview` を登録
    context.subscriptions.push(
        vscode.commands.registerCommand('ximgdock.showPreview', () => {
            // 現在アクティブなテキストエディタを対象にプレビューパネルを生成または表示
            previewProvider.createOrShow(vscode.window.activeTextEditor);
        })
    );

    // 画像ギャラリー表示コマンド `ximgdock.showImageGallery` を登録
    context.subscriptions.push(
        vscode.commands.registerCommand('ximgdock.showImageGallery', () => {
            // 画像ギャラリーパネルを生成または表示
            ImageGalleryPanel.createOrShow(
                context.extensionUri,
                vscode.window.activeTextEditor,
                previewProvider
            );
        })
    );

    // --- イベントリスナーの登録 ---
    // テキストドキュメントが変更された際のイベントリスナー
    // アクティブなエディタのドキュメントが変更された場合、プレビューを自動更新します。
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
                previewProvider.update(event.document);
            }
        })
    );

    // エディタのカーソル選択範囲が変更された際のイベントリスナー
    // カーソル移動に追従して、プレビューパネルの表示位置をスクロールさせます。
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === vscode.window.activeTextEditor) {
                // アクティブな行番号（1基点）を取得してプレビューに通知
                const line = event.selections[0].active.line + 1;
                previewProvider.scrollToLine(line);
            }
        })
    );
}

/**
 * 拡張機能が無効化されるときに実行される関数です。
 * リソースの解放など、クリーンアップ処理を行います。
 */
export function deactivate() { }
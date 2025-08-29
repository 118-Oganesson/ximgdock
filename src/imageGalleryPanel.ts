import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PreviewProvider } from './previewProvider';

/**
 * 画像ファイルの情報を格納するための型定義。
 * @property {string} name - ファイル名。
 * @property {number} mtime - ファイルの最終更新日時 (ミリ秒)。
 */
type ImageFile = {
    name: string;
    mtime: number;
};

/**
 * 画像ギャラリー機能を提供するWebviewパネルを管理するクラス。
 * ユーザーがフォルダを選択し、中の画像を一覧表示して、エディタに挿入する機能を提供します。
 */
export class ImageGalleryPanel {
    public static currentPanel: ImageGalleryPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private _sourceEditor: vscode.TextEditor | undefined;
    private _folderPath: string | undefined;
    private _previewProvider: PreviewProvider;

    private _sortBy: 'name' | 'date' = 'name';
    private _watcher: fs.FSWatcher | undefined; // フォルダ監視用のウォッチャー

    /**
     * ギャラリーパネルを生成、または既存のパネルを表示します (シングルトンパターン)。
     * @param extensionUri 拡張機能のルートURI。
     * @param editor 操作対象のテキストエディタ。
     * @param previewProvider プレビューパネルのプロバイダー。
     */
    public static createOrShow(extensionUri: vscode.Uri, editor: vscode.TextEditor | undefined, previewProvider: PreviewProvider) {
        const column = vscode.ViewColumn.Three; // パネルを表示するカラム

        // パネルが既に存在すれば、それを表示してフォーカスする
        if (ImageGalleryPanel.currentPanel) {
            ImageGalleryPanel.currentPanel._panel.reveal(column);
            ImageGalleryPanel.currentPanel._sourceEditor = editor;
            ImageGalleryPanel.currentPanel._previewProvider = previewProvider;
            return;
        }

        // パネルが存在しなければ、新規に作成
        const panel = vscode.window.createWebviewPanel(
            'imageGallery',
            'Image Gallery',
            column,
            {
                enableScripts: true,
                // Webviewからアクセス可能なローカルリソースのルートパスをシステムのルートに設定
                // これにより、ユーザーが選択した任意のフォルダの画像を表示できる
                localResourceRoots: [vscode.Uri.file('/')]
            }
        );
        ImageGalleryPanel.currentPanel = new ImageGalleryPanel(panel, extensionUri, editor, previewProvider);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, editor: vscode.TextEditor | undefined, previewProvider: PreviewProvider) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._sourceEditor = editor;
        this._previewProvider = previewProvider;

        // パネルの初期化処理
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Webviewからのメッセージ受信時の処理
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'selectFolder': // フォルダ選択
                        await this._selectFolderAndUpdateImages();
                        return;
                    case 'insertImage': // 画像タグ挿入
                        this._insertImageTag(message.fileName, message.format);
                        return;
                    case 'refresh': // 表示更新
                        this._update();
                        return;
                    case 'sort': // 並び替え
                        this._sortBy = message.sortBy;
                        this._update();
                        return;
                }
            }, null, this._disposables);
    }

    /**
     * 指定されたフォルダの変更を監視するウォッチャーを設定します。
     * @param folderPath 監視対象のフォルダパス。
     */
    private _setupWatcher(folderPath: string) {
        // 既存のウォッチャーがあれば閉じる
        if (this._watcher) {
            this._watcher.close();
        }
        try {
            // fs.watchでフォルダの変更を監視し、変更があればWebviewを更新
            this._watcher = fs.watch(folderPath, (event, filename) => {
                // 短時間に複数イベントが発生する場合を考慮し、少し遅延させて更新
                setTimeout(() => this._update(), 100);
            });
            this._disposables.push({ dispose: () => this._watcher?.close() });
        } catch (e) {
            console.error(`Failed to watch folder: ${folderPath}`, e);
            vscode.window.showErrorMessage(`Could not watch folder: ${folderPath}`);
        }
    }

    /**
     * フォルダ選択ダイアログを表示し、選択されたフォルダの画像でWebviewを更新します。
     */
    private async _selectFolderAndUpdateImages() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Image Folder',
            canSelectFiles: false,
            canSelectFolders: true
        };
        const folderUri = await vscode.window.showOpenDialog(options);

        if (folderUri && folderUri[0]) {
            this._folderPath = folderUri[0].fsPath;
            this._setupWatcher(this._folderPath); // フォルダ監視を開始
            this._update(); // Webviewを更新
        }
    }

    /**
     * アクティブなエディタに画像タグを挿入します。
     * Webviewから渡されたフォーマット文字列を元にタグを動的に生成します。
     * @param fileName 挿入する画像のファイル名。
     * @param format Webviewから指定されたタグのフォーマット文字列。
     */
    private _insertImageTag(fileName: string, format?: string) {
        if (!this._sourceEditor || !this._folderPath) {
            vscode.window.showWarningMessage('No active editor or folder selected.');
            return;
        }

        const editor = this._sourceEditor;
        const imagePath = path.join(this._folderPath, fileName);
        const docDir = path.dirname(editor.document.uri.fsPath);

        // 編集中のファイルから画像ファイルへの相対パスを計算
        let relativePath = path.relative(docDir, imagePath).replace(/\\/g, '/');
        if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
            relativePath = './' + relativePath; // カレントディレクトリを示す `.` を補完
        }

        // ファイル名から拡張子を除いた部分をaltテキストとして使用
        const altText = path.basename(fileName, path.extname(fileName));

        // フォーマットが指定されていない場合のデフォルト値を設定
        const defaultFormat = `<img src="$src" alt="$alt" />`;
        // 受け取ったフォーマット、またはデフォルト値を使用
        const formatString = format || defaultFormat;

        // プレースホルダー ($src, $alt) を実際の値に置換して最終的なHTMLタグを生成
        let imageTag = formatString
            .replace(/\$src/g, relativePath)
            .replace(/\$alt/g, altText);

        // フォーマット内の `\n` という文字列を実際の改行コードに変換する
        imageTag = imageTag.replace(/\\n/g, '\n');

        // エディタのカーソル位置に画像タグを挿入
        editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, imageTag);
        }).then(success => {
            // 挿入成功後、プレビューパネルも更新
            if (success) {
                this._previewProvider.update(editor.document);
            }
        });
    }

    /**
     * パネルと関連リソースを破棄します。
     */
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

    /**
     * Webviewのコンテンツを最新の状態に更新します。
     */
    private _update() {
        this._getHtmlForWebview().then(html => {
            this._panel.webview.html = html;
        });
    }

    /**
     * Webviewに表示するためのHTMLコンテンツを生成します。
     * @returns {Promise<string>} 生成されたHTML文字列。
     */
    private async _getHtmlForWebview(): Promise<string> {
        const galleryHtmlPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'gallery.html');
        let html = fs.readFileSync(galleryHtmlPath.fsPath, 'utf8');

        let imageGridHtml: string;

        // フォルダパスが設定されているかどうかで処理を分岐
        if (this._folderPath) {
            const supportedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
            try {
                const files = fs.readdirSync(this._folderPath);

                // フォルダ内のファイルをフィルタリングし、画像ファイル情報（名前と更新日時）の配列を作成
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
                    .filter((file): file is ImageFile => file !== null); // nullを除外

                // 設定に基づいてソート
                imageFiles.sort((a, b) => {
                    if (this._sortBy === 'date') {
                        return b.mtime - a.mtime; // 日付順（降順）
                    }
                    return a.name.localeCompare(b.name); // 名前順（昇順）
                });

                // 各画像ファイルに対応するHTML要素を生成
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
        } else {
            // ★ フォルダが選択されていない場合、グリッド領域を空にする
            imageGridHtml = '';
        }

        // `{{imageGrid}}` プレースホルダーを生成したHTMLで置換
        return html.replace('{{imageGrid}}', imageGridHtml);
    }
}
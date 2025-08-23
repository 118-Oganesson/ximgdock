## XImgDock 拡張機能 仕様書（詳細版）

本仕様書は、開発者がこの文書のみを参照して **XImgDock** を実装できるレベルの詳細さを意図しています。

---

## 1. 概要

**XImgDock** は、VS Code 上で XHTML ファイルの編集を支援する拡張機能です。以下の機能を提供します。

1. **ライブプレビュー**: XHTML の編集内容をリアルタイムにプレビュー
2. **構文診断**: XHTML のパースエラーを自動検出
3. **画像ドック**: サイドバーに画像一覧を表示し、クリックで `<img>` タグを挿入

想定ユーザーは Web 小説編集者や電子書籍制作者です。

---

## 2. UI/UX 要件

### 2.1. プレビュー

* エディタ右側に Webview パネルとして表示。
* エディタとプレビューは双方向にスクロール同期する。
* エディタの行番号とプレビュー内の要素に `data-line` 属性を対応付ける。
* プレビュー内要素をダブルクリックすると、対応する行にエディタがスクロールする。
* エディタ内要素をダブルクリックすると、対応する行にプレビューがスクロールする。

### 2.2. 画像ドック

* アクティビティバーに `XImgDock` アイコンを追加。
* サイドバーに `Image Dock` ビューを表示。
* 画像フォルダを選択し、サムネイル付きで一覧表示。
* 上部アクション:

  * フォルダ選択
  * 再読み込み
  * ソート切替（ファイル名・サイズ・更新日時）
* サムネイルは `media/cache` に PNG として保存。
* ユーザー操作:

  * ダブルクリックまたは右クリックメニューから `<img>` タグを挿入

### 2.3. 診断

* 編集中の XHTML を `fast-xml-parser` でパース。
* エラーがある場合、VS Code Diagnostics API を利用して赤波線で強調。
* 「問題」パネルに詳細を表示。

---

## 3. 機能仕様

### 3.1. プレビュー機能

* 使用 API: `window.createWebviewPanel`
* Webview 側の HTML テンプレート: `/src/preview/webview/index.html`
* 通信: `webview.postMessage` / `vscode.postMessage`
* 更新タイミング:

  * ファイル保存時
  * 入力から 300ms デバウンス後（設定可能）

### 3.2. 画像ドック

* 使用 API: `window.createTreeView`, `TreeDataProvider`
* サムネイル生成: `sharp`
* サムネイルキャッシュ: 一時ディレクトリ `media/cache`
* TreeItem:

  * label: ファイル名
  * iconPath: サムネイル画像
  * command: `ximgdock.insertImage`

### 3.3. XHTML 構文診断

* 使用 API: `languages.createDiagnosticCollection`
* 使用ライブラリ: `fast-xml-parser`
* 更新タイミング:

  * 入力変更イベントごとに 300ms デバウンスして解析
* エラー形式:

  * `DiagnosticSeverity.Error`
  * 範囲: 行・列番号をパーサー結果から算出

### 3.4. 画像挿入ロジック

* 使用 API: `window.activeTextEditor.edit`
* 挿入内容:

```html
<img src="./relative/path/to/image.png" alt="filename" />
```

* `alt`: デフォルトはファイル名（拡張子除去）
* 将来的に `width` / `height` オプションを設定可能にする

---

## 4. ディレクトリ構成

```
ximgdock/
├── src/
│   ├── extension.ts              // activate, deactivate
│   ├── preview/
│   │   ├── PreviewManager.ts     // Webview 管理
│   │   └── webview/
│   │       ├── index.html        // プレビュー用 HTML
│   │       └── script.js         // Webview 側 JS
│   ├── image-dock/
│   │   ├── ImageDockProvider.ts  // TreeView Provider
│   │   ├── ImageTreeView.ts      // 
│   │   └── ThumbnailManager.ts   // sharp によるサムネイル生成
│   ├── parser/
│   │   └── Parser.ts             // fast-xml-parser による解析
│   └── diagnostics/
│       └── DiagnosticManager.ts  // Diagnostics 制御
├── media/
│   └── cache/                    // サムネイルキャッシュ
├── package.json                  // マニフェスト
├── tsconfig.json                 // TypeScript 設定
└── webpack.config.js             // ビルド設定
```

---

## 5. package.json コントリビューション

```json
"contributes": {
  "commands": [
    {
      "command": "ximgdock.showPreview",
      "title": "XImgDock: プレビューを開く"
    },
    {
      "command": "ximgdock.selectImageFolder",
      "title": "画像フォルダを選択"
    },
    {
      "command": "ximgdock.refreshImages",
      "title": "画像を再読み込み"
    },
    {
      "command": "ximgdock.insertImage",
      "title": "画像を挿入"
    }
  ],
  "viewsContainers": {
    "activitybar": [
      {
        "id": "ximgdock-view-container",
        "title": "XImgDock",
        "icon": "$(device-camera)"
      }
    ]
  },
  "views": {
    "ximgdock-view-container": [
      {
        "id": "ximgdock-images",
        "name": "Image Dock",
        "type": "tree"
      }
    ]
  }
}
```

---

## 6. 開発タスク一覧

1. `extension.ts` で activate/deactivate 実装
2. `PreviewManager.ts` を実装し、Webview パネル作成
3. `ImageDockProvider.ts` を実装し、画像ツリー表示
4. `ThumbnailManager.ts` で sharp によるキャッシュ生成
5. `Parser.ts` で fast-xml-parser をラップ
6. `DiagnosticManager.ts` で Diagnostics API 実装
7. 各機能をコマンドにバインド (`package.json` の commands と一致させる)

---


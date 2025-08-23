# VS Code 拡張機能へようこそ

## フォルダ内の内容

* このフォルダには、拡張機能に必要なすべてのファイルが含まれています。
* `package.json` - 拡張機能やコマンドを定義するマニフェストファイルです。

  * サンプルプラグインではコマンドを登録し、そのタイトルとコマンド名を定義しています。これによって VS Code はコマンドパレットにそのコマンドを表示できます。この時点ではまだプラグインを読み込む必要はありません。
* `src/extension.ts` - コマンドの実装を提供するメインファイルです。

  * このファイルは `activate` という関数をエクスポートしています。この関数は拡張機能が最初にアクティブ化されたときに呼び出されます（この例ではコマンド実行時）。`activate` 内で `registerCommand` を呼び出しています。
  * `registerCommand` の第2引数には、コマンドの実装を含む関数を渡しています。

## セットアップ

* 推奨拡張機能をインストールしてください（`amodio.tsl-problem-matcher`、`ms-vscode.extension-test-runner`、`dbaeumer.vscode-eslint`）。

## すぐに使い始める

* `F5` を押して、拡張機能が読み込まれた新しいウィンドウを開きます。
* コマンドパレットを開き（`Ctrl+Shift+P` または Mac では `Cmd+Shift+P`）、`Hello World` と入力してコマンドを実行します。
* `src/extension.ts` 内にブレークポイントを設定して、拡張機能をデバッグできます。
* 拡張機能の出力はデバッグコンソールに表示されます。

## 変更を加える

* `src/extension.ts` のコードを変更した後、デバッグツールバーから拡張機能を再起動できます。
* または、VS Code ウィンドウをリロードすることで（`Ctrl+R`、Mac では `Cmd+R`）、変更を反映できます。

## API を探る

* `node_modules/@types/vscode/index.d.ts` を開くと、API 全体を確認できます。

## テストを実行する

* [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner) をインストールしてください。
* **Tasks: Run Task** コマンドから "watch" タスクを実行します。これが実行中でないと、テストが検出されない可能性があります。
* アクティビティバーから **Testing ビュー** を開き、「Run Test」ボタンをクリックするか、ショートカット `Ctrl/Cmd + ; A` を使用してください。
* テスト結果は **Test Results ビュー** に表示されます。
* `src/test/extension.test.ts` を変更するか、`test` フォルダ内に新しいテストファイルを作成できます。

  * テストランナーは `**.test.ts` という名前パターンに一致するファイルのみを対象とします。
  * `test` フォルダ内にサブフォルダを作成して自由にテストを整理できます。

## さらに進める

* [拡張機能をバンドル](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) してサイズを減らし、起動時間を改善しましょう。
* [拡張機能を公開](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) して、VS Code Marketplace に配布できます。
* [継続的インテグレーション](https://code.visualstudio.com/api/working-with-extensions/continuous-integration) を設定してビルドを自動化できます。

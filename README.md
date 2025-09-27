# XImgDock 🖼️

XImgDock は、XHTML編集の体験を一新する VS Code 拡張機能です。コードを変更すると即座にライブプレビューへ反映され、デザインをリアルタイムで確認可能。さらに、画像ドックからワンクリックで画像を挿入できるため、わずらわしいウィンドウ切り替えや手動でのパス入力はもう不要です。直感的でスピーディーな制作フローを実現し、あなたのクリエイティブを加速します。

XImgDock revolutionizes XHTML editing in VS Code. Changes in code are instantly reflected in a live preview, allowing real-time design verification. Additionally, images can be inserted with a single click from the image dock, eliminating the need for cumbersome window switching or manual path input. Experience an intuitive and speedy workflow that accelerates your creativity.

-----

## 🌟 主な機能 (Features)

* **ライブプレビュー (Live Preview)**

  * XHTML ファイルを編集すると、変更がリアルタイムでプレビューに反映されます。
  * Changes are reflected in the preview in real-time as you edit your XHTML file.

* **画像ギャラリー (Image Gallery)**

  * 指定したフォルダ内の画像を一覧表示します。
  * Displays a list of images in the specified folder.

* **ワンクリック画像挿入 (One-Click Image Insert)**

  * 画像をクリックするだけで、カーソル位置に`<img>`タグを簡単に追加できます。
  * Simply click an image to insert an `<img>` tag at the cursor's position.

* **柔軟なカスタマイズ (Flexible Customization)**

  * 挿入するタグのフォーマットや、ギャラリーの表示方法（ソート順、サムネイルサイズ）を自由に設定できます。
  * Freely configure the format of the inserted tag and the gallery's display options (sort order, thumbnail size).

-----

## 🚀 使い方 (Usage)

1. **HTML/XHTMLファイルを開く (Open an HTML/XHTML file)**

      * エディタで `.html` または `.xhtml` ファイルを開きます。
      * Open a `.html` or `.xhtml` file in the editor.

2. **プレビューを起動 (Open Preview)**

      * エディタ右上の **プレビューアイコン** をクリックします。
      * Click the **preview icon** in the editor's top-right corner.
      * 現在のファイルのライブプレビューが、画面の横に新しいパネルとして表示されます。
      * A live preview of the current file will open in a new panel next to your editor.

3. **画像ギャラリーを表示 (Show Image Gallery)**

      * エディタの右上（タブバー）に表示される **カメラアイコン** をクリックします。
      * Click the **camera icon** located in the top-right corner of the editor's tab bar.
      * プレビューの横に画像ギャラリーが開きます。`Select Folder` ボタンで画像フォルダを選択してください。
      * The image gallery opens next to the preview. Use the `Select Folder` button to select an image folder.

4. **画像を挿入 (Insert Image)**

      * ギャラリーに表示された画像をクリックすると、アクティブなエディタのカーソル位置に画像タグが挿入され、ライブプレビューにも即座に反映されます。
      * Click an image in the gallery to insert its tag at the current cursor position, which will be instantly reflected in the live preview.

-----

## リリースノート (Release Notes)

### 0.0.5 (2025-09-28)

* **修正**: ライブプレビューで相対パス（`../`など）を使用して指定された画像が表示されない問題を修正しました。
* **Fixed**: Resolved an issue where images referenced with relative paths (e.g., `../`) would not display in the live preview pane.
* **修正**: プレビューパネルのコンテンツセキュリティポリシー（CSP）を更新し、ワークスペース内のローカル画像が確実に表示されるようにしました。
* **Fixed**: Updated the preview panel's Content Security Policy (CSP) to ensure local images within the workspace are reliably displayed.
* **改善**: ライブプレビューのレンダリング安定性を向上させ、表示の信頼性を高めました。
* **Improved**: Enhanced the rendering stability and reliability of the live preview.

### 0.0.4 (2025-09-24)

* **追加**: 画像ギャラリーでのホバー時プレビュー機能を追加しました。サムネイルにマウスを乗せると、ビュー内に収まる大きな画像が表示されます。
* **Added**: Image hover preview in the gallery. Hovering over a thumbnail shows a larger version that automatically stays within the viewport.
* **追加**: ファイル名による検索バーを追加しました。
* **Added**: Search bar to quickly find images by file name.
* **追加**: ファイル形式（PNG, JPG, SVG）によるフィルター機能を追加しました。
* **Added**: Filter dropdown to sort images by file type (PNG, JPG, SVG).
* **改善**: 画像挿入のワークフローを効率化し、ギャラリー管理を直感的かつ強力にしました。
* **Improved**: Streamlined the image insertion workflow, making gallery management more intuitive and efficient.

### 0.0.3 (2025-09-23)

* **修正**: Windowsを含むすべての環境で、画像ギャラリーにサムネイル画像が正しく表示されない問題を修正しました。
* **Fixed**: Resolved a bug where image thumbnails in the gallery were not displayed correctly on Windows and other environments.
* **改善**: フォルダ選択時に発生していた、ギャラリーが画像を正しく読み込めなくなる不具合を修正し、表示の安定性を向上させました。
* **Improved**: Increased stability when selecting folders; fixed an issue where the gallery would fail to load images properly, ensuring reliable image display.

### 0.0.2 (2025-09-23)

* **修正**: Windows環境で画像ギャラリーパネルのサムネイルが表示されない問題を修正しました。
* **Fixed**: Corrected an issue where image thumbnails would not display in the Image Gallery panel on Windows due to file path format incompatibility.
* **改善**: ファイルパスの処理をより堅牢にし、様々なオペレーティングシステムでの互換性を向上させました。
* **Improved**: Enhanced file path handling in the Image Gallery to be more robust across different operating systems.

### 0.0.1

* Initial release of XImgDock.
* ライブプレビューと画像ギャラリー機能を搭載。
* Features live preview and image gallery functionality.

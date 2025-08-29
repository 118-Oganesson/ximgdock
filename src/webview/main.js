// src/webview/main.js (ハイライト一時表示版)
(function () {
    const vscode = acquireVsCodeApi();
    let currentHighlightedElement = null; // 👈 変数名を変更して分かりやすくしました

    // --- メッセージ受信: 拡張機能 -> Webview ---
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'scrollTo') {
            const line = message.line;
            const element = document.querySelector(`[data-line="${line}"]`);

            if (element) {
                // 既存のハイライトがあれば即座に削除
                if (currentHighlightedElement) {
                    currentHighlightedElement.classList.remove('highlight');
                }

                // 新しい要素をハイライト
                element.classList.add('highlight');
                currentHighlightedElement = element;

                // 👈 --- ここからハイライト解除タイマーを追加 ---
                // 1秒後にハイライトを削除する
                setTimeout(() => {
                    // タイムアウト実行時に、現在ハイライトされている要素が同じものであれば削除
                    if (currentHighlightedElement === element) {
                        currentHighlightedElement.classList.remove('highlight');
                        currentHighlightedElement = null;
                    }
                }, 1000);
                // 👆 --- ここまで追加 ---

                // スクロール処理は変更なし
                element.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }
        }
    });

    // --- クリックイベント送信: Webview -> 拡張機能 ---
    // この部分は変更なし
    document.addEventListener('click', event => {
        const targetElement = event.target.closest('[data-line]');
        if (targetElement) {
            const line = parseInt(targetElement.dataset.line);
            if (!isNaN(line)) {
                vscode.postMessage({
                    command: 'revealLine',
                    line: line
                });
            }
        }
    });
}());
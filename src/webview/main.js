/**
 * @file Webview側で動作し、VS Code拡張機能との間の通信を処理するスクリプト。
 * 主な機能：
 * 1. 拡張機能からのメッセージに応じて、指定行へスクロールし一時的にハイライトする。
 * 2. Webview内の要素がクリックされた際に、対応する行番号を拡張機能に通知する。
 */
(function () {
    // グローバルスコープの汚染を防ぐための即時実行関数

    /**
     * Webviewから拡張機能へメッセージを送信するためのVS Code APIオブジェクト。
     */
    const vscode = acquireVsCodeApi();

    /**
     * 現在ハイライトされているHTML要素を保持する変数。
     * @type {HTMLElement | null}
     */
    let currentHighlightedElement = null;

    // --- イベントリスナー：拡張機能からのメッセージを受信 ---
    window.addEventListener('message', event => {
        const message = event.data; // event.data にメッセージオブジェクトが含まれる

        if (message.command === 'scrollTo') {
            const line = message.line;
            const element = document.querySelector(`[data-line="${line}"]`);

            if (element) {
                // 既存のハイライトがあれば、新しいハイライトを適用する前に即座に削除
                if (currentHighlightedElement) {
                    currentHighlightedElement.classList.remove('highlight');
                }

                // 新しい要素に 'highlight' クラスを追加してハイライト
                element.classList.add('highlight');
                currentHighlightedElement = element;

                // --- 一時的なハイライトのためのタイマー処理 ---
                // 1秒後にハイライトを自動的に解除する
                setTimeout(() => {
                    // タイムアウトが実行された時点で、ハイライト対象が同じ要素である場合のみ解除
                    // (ユーザーが素早く別の行をクリックした場合の競合を防ぐため)
                    if (currentHighlightedElement === element) {
                        currentHighlightedElement.classList.remove('highlight');
                        currentHighlightedElement = null;
                    }
                }, 1000);

                // --- スクロール処理 ---
                // ハイライトされた要素が画面中央に来るようにスクロール
                element.scrollIntoView({
                    behavior: 'smooth', // スムーズスクロール
                    block: 'center',   // 垂直方向の中央
                    inline: 'nearest'
                });
            }
        }
    });

    // --- イベントリスナー：Webview内のクリックイベントを拡張機能に送信 ---
    document.addEventListener('click', event => {
        // クリックされた要素、またはその親要素から `data-line` 属性を持つ要素を検索
        const targetElement = event.target.closest('[data-line]');

        if (targetElement) {
            // `data-line` 属性から行番号を取得
            const line = parseInt(targetElement.dataset.line);
            if (!isNaN(line)) {
                // 取得した行番号を 'revealLine' コマンドとして拡張機能に送信
                vscode.postMessage({
                    command: 'revealLine',
                    line: line
                });
            }
        }
    });
}());
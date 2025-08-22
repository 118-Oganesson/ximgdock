(function() {
    const vscode = acquireVsCodeApi();
    let currentHighlightLine = -1;

    // VS Code拡張からのメッセージを受信
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'updateContent':
                updateContent(message.content);
                break;
            case 'scrollToLine':
                scrollToLine(message.line);
                break;
        }
    });

    function updateContent(content) {
        const contentDiv = document.getElementById('content');
        
        try {
            // XHTMLコンテンツをレンダリング
            contentDiv.innerHTML = content;
            
            // data-line属性を持つ要素にイベントリスナーを追加
            const elementsWithLine = contentDiv.querySelectorAll('[data-line]');
            elementsWithLine.forEach(element => {
                element.addEventListener('dblclick', (e) => {
                    const line = parseInt(element.getAttribute('data-line'));
                    vscode.postMessage({
                        command: 'scrollToLine',
                        line: line
                    });
                });
                
                // ホバー効果
                element.addEventListener('mouseenter', (e) => {
                    element.style.backgroundColor = 'var(--vscode-editor-hoverHighlightBackground)';
                });
                
                element.addEventListener('mouseleave', (e) => {
                    if (!element.classList.contains('line-highlight')) {
                        element.style.backgroundColor = '';
                    }
                });
            });
            
        } catch (error) {
            contentDiv.innerHTML = `
                <div class="error">
                    <h3>プレビューエラー</h3>
                    <p>XHTMLコンテンツの表示中にエラーが発生しました:</p>
                    <pre>${error.message}</pre>
                </div>
            `;
        }
    }

    function scrollToLine(line) {
        // 現在のハイライトを削除
        if (currentHighlightLine >= 0) {
            const prevElement = document.querySelector(`[data-line="${currentHighlightLine}"]`);
            if (prevElement) {
                prevElement.classList.remove('line-highlight');
            }
        }
        
        // 新しいハイライトを設定
        const element = document.querySelector(`[data-line="${line}"]`);
        if (element) {
            element.classList.add('line-highlight');
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            currentHighlightLine = line;
        }
    }

    // スクロール同期
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = setTimeout(() => {
            const elements = document.querySelectorAll('[data-line]');
            const viewportHeight = window.innerHeight;
            const scrollTop = window.scrollY;
            
            // 画面中央に最も近い要素を見つける
            let closestElement = null;
            let closestDistance = Infinity;
            
            elements.forEach(element => {
                const rect = element.getBoundingClientRect();
                const elementCenter = rect.top + rect.height / 2;
                const viewportCenter = viewportHeight / 2;
                const distance = Math.abs(elementCenter - viewportCenter);
                
                if (distance < closestDistance && rect.top < viewportHeight && rect.bottom > 0) {
                    closestDistance = distance;
                    closestElement = element;
                }
            });
            
            if (closestElement) {
                const line = parseInt(closestElement.getAttribute('data-line'));
                vscode.postMessage({
                    command: 'scrollToLine',
                    line: line
                });
            }
        }, 100);
    });

    // 初期化完了を通知
    vscode.postMessage({
        command: 'ready'
    });
})();
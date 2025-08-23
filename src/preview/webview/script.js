(function () {
    'use strict';

    console.log('XImgDock script.js loading...');

    const vscode = acquireVsCodeApi();
    let currentHighlightLine = -1;
    let baseUri = '';

    // VS Code拡張からのメッセージを受信
    window.addEventListener('message', event => {
        const message = event.data;
        console.log('Script: received message:', message.command, message);

        switch (message.command) {
            case 'updateContent':
                baseUri = message.baseUri || '';
                updateContent(message.content);
                break;
            case 'scrollToLine':
                scrollToLine(message.line);
                break;
        }
    });

    function updateContent(content) {
        console.log('Script: updating content');
        const contentDiv = document.getElementById('content');

        try {
            // XHTMLコンテンツをレンダリング
            contentDiv.innerHTML = content;
            contentDiv.classList.remove('loading');

            // data-line属性を持つ要素にイベントリスナーを追加
            const elementsWithLine = contentDiv.querySelectorAll('[data-line]');
            console.log('Script: found elements with data-line:', elementsWithLine.length);

            elementsWithLine.forEach(element => {
                const line = parseInt(element.getAttribute('data-line'));
                console.log(`Script: adding event listener to element at line ${line}:`, element.tagName);

                // クリックイベント（より確実に動作させるため複数のイベントを設定）
                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Script: element clicked, line:', line);

                    // 視覚的フィードバック
                    element.style.backgroundColor = 'var(--vscode-editor-selectionBackground, rgba(38, 79, 120, 0.5))';
                    setTimeout(() => {
                        element.style.backgroundColor = '';
                    }, 200);

                    vscode.postMessage({
                        command: 'elementClicked',
                        line: line
                    });
                });

                // mousedownとmouseupでも試す
                element.addEventListener('mousedown', (e) => {
                    console.log('Script: mousedown on element at line:', line);
                });

                element.addEventListener('mouseup', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Script: mouseup on element at line:', line);

                    vscode.postMessage({
                        command: 'scrollToLine',
                        line: line
                    });
                });

                // ホバー効果
                element.addEventListener('mouseenter', (e) => {
                    if (!element.classList.contains('line-highlight')) {
                        element.style.borderLeftColor = 'var(--vscode-editor-lineHighlightBorder, #3794ff)';
                        element.style.backgroundColor = 'var(--vscode-editor-lineHighlightBackground, rgba(55, 148, 255, 0.1))';
                    }
                });

                element.addEventListener('mouseleave', (e) => {
                    if (!element.classList.contains('line-highlight')) {
                        element.style.borderLeftColor = '';
                        element.style.backgroundColor = '';
                    }
                });
            });

            // 画像の読み込みエラーハンドリング
            const images = contentDiv.querySelectorAll('img');
            images.forEach(img => {
                img.addEventListener('error', (e) => {
                    img.classList.add('error');
                    img.alt = `画像を読み込めませんでした: ${img.src}`;
                    console.error('Image load error:', img.src);
                });

                // 画像の読み込み完了
                img.addEventListener('load', (e) => {
                    console.log('Image loaded:', img.src);
                });
            });

        } catch (error) {
            console.error('Script: error updating content:', error);
            contentDiv.innerHTML = `
                <div class="error">
                    <h3>プレビューエラー</h3>
                    <p>XHTMLコンテンツの表示中にエラーが発生しました:</p>
                    <pre>${error.message}</pre>
                </div>
            `;
            contentDiv.classList.remove('loading');
        }
    }

    function scrollToLine(line) {
        console.log('Script: scrolling to line:', line);

        // 現在のハイライトを削除
        const prevElement = document.querySelector('.line-highlight');
        if (prevElement) {
            prevElement.classList.remove('line-highlight');
            prevElement.style.borderLeftColor = '';
            prevElement.style.backgroundColor = '';
            console.log('Script: removed previous highlight from line:', prevElement.getAttribute('data-line'));
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
            console.log('Script: highlighted element at line:', line, element.tagName);

            // ハイライトのフラッシュ効果
            element.style.transition = 'all 0.3s ease';
            element.style.transform = 'scale(1.02)';
            setTimeout(() => {
                element.style.transform = '';
            }, 300);
        } else {
            console.warn('Script: element not found for line:', line);
            // デバッグ: 利用可能な要素を表示
            const allElements = document.querySelectorAll('[data-line]');
            console.log('Script: available elements:', Array.from(allElements).map(el => ({
                line: el.getAttribute('data-line'),
                tag: el.tagName,
                text: el.textContent?.substring(0, 50)
            })));
        }
    }

    // 全体クリックのデバッグ用
    document.addEventListener('click', (e) => {
        console.log('Script: document click detected on:', e.target.tagName, e.target);

        // data-line属性を持つ要素がクリックされたかチェック
        let target = e.target;
        while (target && target !== document) {
            if (target.hasAttribute && target.hasAttribute('data-line')) {
                const line = parseInt(target.getAttribute('data-line'));
                console.log('Script: clicked element has data-line:', line);
                break;
            }
            target = target.parentElement;
        }
    });

    // スクロール同期（オプション）
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
                // スクロール同期は控えめに（無限ループ防止）
                if (Math.abs(line - currentHighlightLine) > 2) {
                    console.log('Script: scroll sync to line:', line);
                    vscode.postMessage({
                        command: 'scrollToLine',
                        line: line
                    });
                }
            }
        }, 150);
    });

    // 初期化完了を通知
    console.log('Script: sending ready message');
    vscode.postMessage({
        command: 'ready'
    });

    console.log('XImgDock script.js loaded successfully');
})();
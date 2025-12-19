// ==UserScript==
// @name         Download JS files helper
// @namespace    https://example.com
// @version      1.0
// @description  给页面里所有 .js 链接追加一个“下载”按钮
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 创建下载按钮
    function makeBtn(href, fileName) {
        const a = document.createElement('a');
        a.textContent = '⬇ JS';
        a.href = '#';
        a.style.marginLeft = '6px';
        a.style.fontSize = '12px';
        a.style.color = '#fff';
        a.style.background = '#007bff';
        a.style.padding = '2px 6px';
        a.style.borderRadius = '3px';
        a.style.textDecoration = 'none';
        a.title = '下载 ' + fileName;

        a.onclick = e => {
            e.preventDefault();
            fetch(href)
                .then(r => r.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    const tmp = document.createElement('a');
                    tmp.href = url;
                    tmp.download = fileName;
                    document.body.appendChild(tmp);
                    tmp.click();
                    tmp.remove();
                    URL.revokeObjectURL(url);
                })
                .catch(err => alert('下载失败: ' + err));
        };
        return a;
    }

    // 扫描并追加按钮
    function scan() {
        document.querySelectorAll('a[href$=".js"]').forEach(el => {
            if (el.dataset.downloadBtn) return;   // 已处理过
            el.dataset.downloadBtn = '1';

            const href = el.href;
            const fileName = href.split('/').pop();
            el.parentNode.insertBefore(makeBtn(href, fileName), el.nextSibling);
        });
    }

    // 首次执行
    scan();

    // 对 SPA / Ajax 页面也有效
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
})();

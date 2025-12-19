// ==UserScript==
// @name         Download JS – 零配置版（不 fetch）
// @namespace    https://example.com
// @version      1.1
// @description  给页面所有 .js 链接加一个“下载”按钮，不 fetch，无 CORS 问题
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* 创建下载按钮 */
    function addDownloadBtn(linkElem) {
        if (linkElem.dataset.dlBtn) return;          // 已处理过
        linkElem.dataset.dlBtn = '1';

        const fileName = linkElem.href.split('/').pop() || 'file.js';

        const btn = document.createElement('a');
        btn.textContent = '⬇ JS';
        btn.href = '#';
        btn.style.marginLeft = '6px';
        btn.style.fontSize = '12px';
        btn.style.color = '#fff';
        btn.style.background = '#007bff';
        btn.style.padding = '2px 6px';
        btn.style.borderRadius = '3px';
        btn.style.textDecoration = 'none';
        btn.title = '零配置下载 ' + fileName;

        btn.onclick = ev => {
            ev.preventDefault();

            // 核心：新建一个带 download 属性的 <a>，指向原链接
            const dummy = document.createElement('a');
            dummy.href = linkElem.href;
            dummy.download = fileName;   // 告诉浏览器“这是附件”
            dummy.style.display = 'none';
            document.body.appendChild(dummy);
            dummy.click();
            dummy.remove();
        };

        linkElem.parentNode.insertBefore(btn, linkElem.nextSibling);
    }

    /* 扫描并补按钮 */
    function scan() {
        document.querySelectorAll('a[href$=".js"]').forEach(addDownloadBtn);
    }

    /* 首次 + 动态内容 */
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();

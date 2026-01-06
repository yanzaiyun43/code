// ==UserScript==
// @name         xuexi365 图片链接复制器
// @namespace    https://github.com/yourname
// @version      1.0
// @description  在回帖图片上增加“复制原图链接”按钮
// @author       you
// @match        *://*.xuexi365.com/*
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  /* 把按钮插到图片容器里 */
  function addCopyBtn(imgBox, url) {
    if (imgBox.dataset.copyBtn) return;          // 防止重复
    const btn = document.createElement('span');
    btn.style.cssText = `
      position:absolute; top:4px; left:4px;
      background:#06f; color:#fff; font-size:12px;
      padding:2px 6px; border-radius:3px; cursor:pointer;
      z-index:9999; user-select:none; opacity:.85;
    `;
    btn.textContent = '复制';
    btn.title = '复制原图链接';
    btn.dataset.copyBtn = '1';
    btn.onclick = e => {
      e.stopPropagation();
      GM_setClipboard(url, 'text');
      btn.textContent = '✓ 已复制';
      setTimeout(() => (btn.textContent = '复制'), 1200);
    };
    imgBox.style.position = 'relative';
    imgBox.appendChild(btn);
  }

  /* 轮询 + MutationObserver 双保险 */
  function scan() {
    // 1. 已经渲染在页面里的图片
    document.querySelectorAll('img').forEach(img => {
      const url = img.src;
      if (!url || !/\.(jpg|jpeg|png|gif|webp)/i.test(url)) return;
      const box = img.parentElement;
      if (box) addCopyBtn(box, url);
    });

    // 2. 接口返回的 JSON 里 imgUrl 字段（动态插入的）
    const textNodes = document.querySelectorAll('body *');
    textNodes.forEach(n => {
      if (n.tagName === 'IMG') return;
      const txt = n.textContent || '';
      let m;
      try {
        // 简单提取 imgUrl
        const reg = /"imgUrl"\s*:\s*"([^"]+)"/g;
        while ((m = reg.exec(txt))) {
          const url = m[1];
          // 找到离这段文字最近的图片元素，把按钮插到它容器上
          let el = n;
          while (el && el.tagName !== 'IMG') el = el.nextElementSibling;
          if (el && el.tagName === 'IMG') {
            addCopyBtn(el.parentElement, url);
          }
        }
      } catch (_) {}
    });
  }

  // 初次执行
  scan();

  // 后续 DOM 变动再扫一遍
  const ob = new MutationObserver(() => scan());
  ob.observe(document.body, { childList: true, subtree: true });
})();

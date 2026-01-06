// ==UserScript==
// @name         xuexi365 图片链接复制器（轻量版）
// @namespace    https://github.com/yourname
// @version      1.1
// @description  在回帖图片左上角增加“复制原图链接”按钮，不卡页面
// @author       you
// @match        *://*.xuexi365.com/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const added = new WeakSet();          // 防止重复按钮

  /* 真正插入按钮 */
  function attachBtn(img) {
    if (added.has(img)) return;
    const box = img.parentElement;
    if (!box) return;
    const url = img.src;
    if (!url || !/\.(jpg|jpeg|png|gif|webp)/i.test(url)) return;

    const btn = document.createElement('span');
    btn.style.cssText = `
      position:absolute; top:2px; left:2px; background:rgba(0,102,255,.9);
      color:#fff; font-size:11px; padding:2px 5px; border-radius:2px;
      cursor:pointer; z-index:9999; line-height:1;
    `;
    btn.textContent = '复制';
    box.style.position = 'relative';
    box.appendChild(btn);
    added.add(img);

    btn.onclick = e => {
      e.stopPropagation();
      GM_setClipboard(url, 'text');
      btn.textContent = '✓';
      setTimeout(() => (btn.textContent = '复制'), 1000);
    };
  }

  /* 防抖扫描 */
  let timer;
  function debounceScan() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.querySelectorAll('img').forEach(attachBtn);
    }, 300);
  }

  /* 等 DOM Ready 后扫一次 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', debounceScan);
  } else {
    debounceScan();
  }

  /* 只监听新增节点，不遍历整个 body */
  new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;        // 只处理 ELEMENT_NODE
        if (n.tagName === 'IMG') attachBtn(n);
        else n.querySelectorAll?.('img').forEach(attachBtn);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
})();

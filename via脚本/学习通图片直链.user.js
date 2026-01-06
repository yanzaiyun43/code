// ==UserScript==
// @name         xuexi365 复制原图（3.2 修复版）
// @namespace    https://github.com/yourname
// @version      3.2
// @description  真正的 img 节点一出现就挂按钮
// @author       you
// @match        *://*.xuexi365.com/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const map = new Map();   // 压缩图 → 原图
  const done = new WeakSet();

  /* 1. 提取映射 */
  function extractPairs(body) {
    if (typeof body !== 'string') return;
    try {
      const obj = JSON.parse(body);
      const datas = obj?.data?.datas || [];
      datas.forEach(post => {
        (post.img_data || []).forEach(item => {
          if (item.litimg && item.imgUrl) map.set(item.litimg, item.imgUrl);
        });
      });
    } catch (_) {}
  }

  /* 2. 给 <img> 挂按钮 */
  function attachBtn(img) {
    if (done.has(img)) return;
    const origin = map.get(img.src);   // 用压缩图反查原图
    if (!origin) return;
    const box = img.parentElement;
    if (!box) return;
    const btn = document.createElement('span');
    btn.style.cssText = `
      position:absolute; top:2px; left:2px; background:rgba(0,102,255,.9);
      color:#fff; font-size:11px; padding:2px 5px; border-radius:2px;
      cursor:pointer; z-index:9999; line-height:1;
    `;
    btn.textContent = '复制原图';
    box.style.position = 'relative';
    box.appendChild(btn);
    done.add(img);
    btn.onclick = e => {
      e.stopPropagation();
      GM_setClipboard(origin, 'text');
      btn.textContent = '✓';
      setTimeout(() => (btn.textContent = '复制原图'), 1000);
    };
  }

  /* 3. 拦截 XHR / fetch */
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function () {
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => extractPairs(this.responseText));
    return send.apply(this, arguments);
  };
  const _fetch = window.fetch;
  window.fetch = async (...args) => {
    const r = await _fetch(...args);
    try { extractPairs(await r.clone().text()); } catch (_) {}
    return r;
  };

  /* 4. 监听真正的 <img> 节点 */
  const ob = new MutationObserver(ms =>
    ms.forEach(m =>
      (m.addedNodes || []).forEach(n => {
        if (n.tagName === 'IMG') attachBtn(n);
        if (n.nodeType === 1) n.querySelectorAll?.('img').forEach(attachBtn);
      })
    )
  );

  /* 5. 启动 */
  function start() {
    ob.observe(document.body, { childList: true, subtree: true });
    /* 已经存在于 DOM 的也扫一遍 */
    document.querySelectorAll('img').forEach(attachBtn);
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();

// ==UserScript==
// @name         xuexi365 复制原图（即时显示按钮）
// @namespace    https://github.com/yourname
// @version      3.1
// @description  图片一出现就挂按钮，无需点击
// @author       you
// @match        *://*.xuexi365.com/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const map = new Map();   // 压缩图 → 原图
  const done = new WeakSet();

  /* 提取成对地址 */
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

  /* 挂按钮核心逻辑 */
  function attachBtn(img) {
    if (done.has(img)) return;
    const origin = map.get(img.src);
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

  /* 拦截 XHR / fetch 拿响应 */
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

  /* 关键：拦截 img.src 赋值 */
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  const rawSet = desc.set;
  desc.set = function (v) {
    rawSet.call(this, v);
    // 异步一帧，确保 DOM 已更新
    requestAnimationFrame(() => attachBtn(this));
  };
  Object.defineProperty(HTMLImageElement.prototype, 'src', desc);

  /* 兜底：DOM 增量监听（针对骨架屏等） */
  const ob = new MutationObserver(ms =>
    ms.forEach(m =>
      (m.addedNodes || []).forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'IMG') attachBtn(n);
        n.querySelectorAll?.('img').forEach(attachBtn);
      })
    )
  );
  if (document.body) ob.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', () =>
    ob.observe(document.body, { childList: true, subtree: true })
  );
})();

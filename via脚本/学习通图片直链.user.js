// ==UserScript==
// @name         xuexi365 复制原图链接（origin.jpg）
// @namespace    https://github.com/yourname
// @version      2.0
// @description  复制接口返回的 origin.jpg 原图地址，而非压缩图
// @author       you
// @match        *://*.xuexi365.com/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const map = new Map();            // key: 压缩图url → value: 原图url
  const done = new WeakSet();       // 已挂按钮的<img>

  /* 从响应文本里提取原图地址 */
  function extractOrigin(body) {
    if (typeof body !== 'string') return;
    let m;
    // 匹配 "imgUrl":"https://...../origin.jpg?..."
    const reg = /"imgUrl"\s*:\s*"([^"]+\/origin\.jpg[^"]*)"/g;
    while ((m = reg.exec(body))) {
      const origin = m[1];
      // 同时生成对应的压缩图地址（简单替换）
      const thumb = origin.replace(/\/origin\.jpg/, '/778_778Q50.jpg');
      map.set(thumb, origin);
    }
  }

  /* 给单张图挂按钮 */
  function addBtn(img) {
    if (done.has(img)) return;
    const thumb = img.src;
    const origin = map.get(thumb);
    if (!origin) return;          // 还没拿到对应原图
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

  /* 1. 拦截 XHR */
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this._url = u;
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      try { extractOrigin(this.responseText); } catch (_) {}
    });
    return send.apply(this, arguments);
  };

  /* 2. 拦截 fetch */
  const _fetch = window.fetch;
  window.fetch = async (...args) => {
    const r = await _fetch(...args);
    try {
      const clone = r.clone();
      const txt = await clone.text();
      extractOrigin(txt);
    } catch (_) {}
    return r;
  };

  /* 3. DOM 监听 */
  const ob = new MutationObserver(() => {
    document.querySelectorAll('img').forEach(addBtn);
  });
  if (document.body) {
    ob.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () =>
      ob.observe(document.body, { childList: true, subtree: true })
    );
  }
})();

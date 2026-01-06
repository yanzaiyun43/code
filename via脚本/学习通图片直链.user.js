// ==UserScript==
// @name         图片直链
// @namespace    https://github.com/yourname
// @version      3.1
// @description  无需点击图片！首次加载即显示复制按钮，完美适配懒加载
// @author       Qwen (based on yourname's script)
// @match        *://*.xuexi365.com/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  // ===== 核心存储 =====
  const originMap = new Map();      // 缩略图URL → 原图URL (精确匹配)
  const dirMap = new Map();         // 目录路径 → 原图URL (兜底匹配)
  const processed = new WeakSet();  // 已处理的图片
  const pendingChecks = new WeakMap(); // 待检查的图片 (解决懒加载问题)

  // ===== 智能URL处理 =====
  const getCleanUrl = (url) => url.split('?')[0].split('#')[0];
  const getDirectory = (url) => {
    const clean = getCleanUrl(url);
    const lastSlash = clean.lastIndexOf('/');
    return lastSlash > 0 ? clean.slice(0, lastSlash + 1) : clean;
  };

  // ===== 从JSON提取映射关系 =====
  const extractPairs = (body) => {
    if (typeof body !== 'string') return;
    try {
      const obj = JSON.parse(body);
      const datas = obj?.data?.datas || [];
      
      datas.forEach(post => {
        (post.img_data || []).forEach(item => {
          if (!item.litimg || !item.imgUrl) return;
          
          // 1. 存储精确映射
          const cleanThumb = getCleanUrl(item.litimg);
          originMap.set(cleanThumb, item.imgUrl);
          
          // 2. 存储目录映射 (核心！解决懒加载问题)
          const dirPath = getDirectory(item.litimg);
          dirMap.set(dirPath, item.imgUrl);
          
          console.debug(`[原图助手] 新增映射: ${cleanThumb} → ${item.imgUrl.slice(0, 30)}...`);
        });
      });
      
      // 3. 新增映射后立即检查所有待处理图片
      checkPendingImages();
    } catch (_) {}
  };

  // ===== 按钮创建 (优化样式) =====
  const createButton = (img, originUrl) => {
    if (processed.has(img)) return;
    
    // 确保容器可定位
    let container = img.closest('.discuss-item-content, .work-content, .topic-content') || img.parentElement;
    if (!container) return;
    
    // 创建样式更美观的按钮
    const btn = document.createElement('button');
    btn.className = 'qwen-copy-btn';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 2v6"/></svg> 原图';
    
    Object.assign(btn.style, {
      position: 'absolute',
      bottom: '6px',
      right: '6px',
      background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '3px 8px',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      zIndex: '99999',
      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      backdropFilter: 'blur(3px)',
      transition: 'all 0.2s ease',
      lineHeight: 1,
    });
    
    // 交互反馈
    btn.onmouseenter = () => btn.style.transform = 'scale(1.08)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    
    btn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      try {
        await GM_setClipboard(originUrl, 'text');
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 复制成功';
        btn.style.background = '#00c853';
        setTimeout(() => {
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 2v6"/></svg> 原图';
          btn.style.background = 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)';
        }, 1200);
      } catch (err) {
        console.error('[原图助手] 复制失败:', err);
        btn.innerHTML = '✗ 失败';
        btn.style.background = '#ff5252';
        setTimeout(() => {
          btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 2v6"/></svg> 原图';
          btn.style.background = 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)';
        }, 1500);
      }
    };
    
    // 确保容器定位
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    
    // 防止重复添加
    const existingBtn = container.querySelector('.qwen-copy-btn');
    if (existingBtn) container.removeChild(existingBtn);
    
    container.appendChild(btn);
    processed.add(img);
  };

  // ===== 智能图片匹配 (三重保障) =====
  const matchOriginal = (imgSrc) => {
    if (!imgSrc || imgSrc.startsWith('data:')) return null;
    
    // 1. 精确匹配 (去除参数)
    const cleanSrc = getCleanUrl(imgSrc);
    if (originMap.has(cleanSrc)) return originMap.get(cleanSrc);
    
    // 2. 目录路径匹配 (核心！解决懒加载)
    const dirPath = getDirectory(imgSrc);
    if (dirMap.has(dirPath)) return dirMap.get(dirPath);
    
    // 3. 模糊文件名匹配 (极端情况)
    const fileName = cleanSrc.split('/').pop() || '';
    for (const [thumb, origin] of originMap) {
      if (thumb.includes(fileName)) return origin;
    }
    
    return null;
  };

  // ===== 处理单张图片 =====
  const handleImage = (img) => {
    if (processed.has(img)) return;
    
    // 1. 立即尝试匹配
    const originUrl = matchOriginal(img.src);
    if (originUrl) {
      createButton(img, originUrl);
      return;
    }
    
    // 2. 图片未加载完成？等待加载
    if (!img.complete) {
      img.addEventListener('load', () => handleImage(img), { once: true });
      return;
    }
    
    // 3. 未匹配到？加入待检查队列 (解决懒加载)
    if (!pendingChecks.has(img)) {
      pendingChecks.set(img, setTimeout(() => {
        pendingChecks.delete(img);
        handleImage(img); // 600ms后重试
      }, 600));
    }
  };

  // ===== 检查待处理图片 =====
  const checkPendingImages = () => {
    pendingChecks.forEach((timerId, img) => {
      clearTimeout(timerId);
      pendingChecks.delete(img);
      handleImage(img);
    });
  };

  // ===== 网络监听 (全覆盖) =====
  const initNetworkHooks = () => {
    // 拦截XHR
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u) {
      this._url = u;
      return open.apply(this, arguments);
    };
    
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener('load', () => {
        if (this.status === 200 && this.responseText) {
          extractPairs(this.responseText);
        }
      });
      return send.apply(this, arguments);
    };
    
    // 拦截Fetch
    const _fetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await _fetch(...args);
      if (response.ok) {
        try {
          const text = await response.clone().text();
          extractPairs(text);
        } catch (_) {}
      }
      return response;
    };
  };

  // ===== DOM 监听 (双保险) =====
  const initDOMObserver = () => {
    // 1. 子节点变化 (新图片)
    const childObserver = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          
          if (node.tagName === 'IMG') {
            handleImage(node);
          } else {
            node.querySelectorAll('img').forEach(handleImage);
          }
        });
      });
    });
    
    // 2. 属性变化 (src更新 - 懒加载关键!)
    const attrObserver = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type === 'attributes' && m.attributeName === 'src') {
          const img = m.target;
          if (img.tagName === 'IMG') {
            handleImage(img);
          }
        }
      });
    });
    
    // 启动观察
    childObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    
    attrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['src'],
      subtree: true
    });
    
    // 3. 首次扫描
    document.querySelectorAll('img').forEach(handleImage);
  };

  // ===== 初始化 =====
  const init = () => {
    console.log(`%c[学习通原图助手] %cv3.1 激活！首次加载即显示按钮`, 
      'color:#6a11cb;font-weight:bold;background:rgba(106,17,203,0.1);padding:2px 6px;border-radius:4px;', 
      'color:#2575fc');
    
    initNetworkHooks();
    
    if (document.documentElement) {
      initDOMObserver();
    } else {
      document.addEventListener('DOMContentLoaded', initDOMObserver, { once: true });
    }
    
    // 兜底定时检查 (防止任何遗漏)
    setInterval(checkPendingImages, 2000);
  };

  // 尽早启动
  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();

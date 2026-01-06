// ==UserScript==
// @name         图片直链
// @namespace    https://github.com/yanzaiyun43
// @version      4.1.1
// @description  专为学习通设计：直接解析JSON数据，精准匹配原图链接
// @author       Qwen
// @match        *://*.xuexi365.com/*
// @match        *://*.chaoxing.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  // ===== 核心映射表（关键改进）=====
  const directoryMap = new Map(); // 目录路径 → 原图完整URL
  const processedImages = new WeakSet(); // 防止重复处理
  
  // 清理URL：移除参数，只保留核心路径
  const cleanUrl = (url) => {
    try {
      const u = new URL(url, location.href);
      return u.origin + u.pathname;
    } catch {
      return url.split('?')[0];
    }
  };
  
  // 提取目录路径（核心！）
  const extractDirectory = (url) => {
    const clean = cleanUrl(url);
    const lastSlash = clean.lastIndexOf('/');
    return lastSlash > 0 ? clean.slice(0, lastSlash + 1) : clean;
  };

  // ===== 智能JSON解析（精准提取）=====
  const processJsonData = (text) => {
    try {
      const data = JSON.parse(text);
      const posts = data?.data?.datas || [];
      let found = 0;
      
      posts.forEach(post => {
        (post.img_data || []).forEach(img => {
          if (!img.litimg || !img.imgUrl) return;
          
          // 1. 提取目录路径（关键！）
          const dirPath = extractDirectory(img.litimg);
          
          // 2. 存储原图完整URL（带参数！）
          if (!directoryMap.has(dirPath)) {
            directoryMap.set(dirPath, img.imgUrl);
            found++;
          }
          
          // 3. 同时存储缩略图路径映射（备用）
          const cleanThumb = cleanUrl(img.litimg);
          if (!directoryMap.has(cleanThumb)) {
            directoryMap.set(cleanThumb, img.imgUrl);
          }
        });
      });
      
      if (found > 0) {
        console.log(`[原图助手] 新增 ${found} 个目录映射`, directoryMap);
        checkAllImages(); // 立即检查所有图片
      }
    } catch (e) {
      console.debug('[原图助手] JSON解析失败', e);
    }
  };

  // ===== 原图匹配引擎 =====
  const findOriginalUrl = (imgSrc) => {
    // 1. 尝试目录路径匹配（最可靠！）
    const dirPath = extractDirectory(imgSrc);
    if (directoryMap.has(dirPath)) {
      return directoryMap.get(dirPath);
    }
    
    // 2. 尝试完整路径匹配
    const cleanSrc = cleanUrl(imgSrc);
    if (directoryMap.has(cleanSrc)) {
      return directoryMap.get(cleanSrc);
    }
    
    // 3. 暴力匹配（处理CDN变体）
    for (const [path, url] of directoryMap) {
      if (imgSrc.includes(path.split('/').pop() || '')) {
        return url;
      }
    }
    
    return null;
  };

  // ===== 按钮创建（优化位置）=====
  const createButton = (img, originUrl) => {
    // 确保容器定位
    let container = img.closest('.discuss-item-content, .work-content') || img.parentElement;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    
    // 防止重复
    if (container.querySelector('.qwen-origin-btn')) return;
    
    const btn = document.createElement('button');
    btn.className = 'qwen-origin-btn';
    btn.innerHTML = '🖼️ 原图';
    Object.assign(btn.style, {
      position: 'absolute',
      bottom: '8px',
      right: '8px',
      background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '3px 10px',
      fontSize: '13px',
      fontWeight: 'bold',
      cursor: 'pointer',
      zIndex: '99999',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(4px)',
      transition: 'all 0.2s'
    });
    
    // 交互效果
    btn.onmouseenter = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    
    btn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      try {
        await GM_setClipboard(originUrl, 'text');
        btn.innerHTML = '✓ COPIED!';
        btn.style.background = '#00c853';
        setTimeout(() => {
          btn.innerHTML = '🖼️ 原图';
          btn.style.background = 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)';
        }, 1000);
      } catch (err) {
        console.error('[原图助手] 复制失败:', err);
        btn.innerHTML = '✗ 失败';
        btn.style.background = '#ff5252';
        setTimeout(() => {
          btn.innerHTML = '🖼️ 原图';
          btn.style.background = 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)';
        }, 1500);
      }
    };
    
    container.appendChild(btn);
    processedImages.add(img);
  };

  // ===== 图片处理器 =====
  const handleImage = (img) => {
    if (processedImages.has(img) || !img.src) return;
    
    const originUrl = findOriginalUrl(img.src);
    if (originUrl) {
      createButton(img, originUrl);
    }
  };

  // 全量检查
  const checkAllImages = () => {
    document.querySelectorAll('img[src*="cldisk.com"], img[src*="chaoxing.com"]').forEach(handleImage);
  };

  // ===== 网络监听（全覆盖）=====
  const initNetworkHooks = () => {
    // 拦截XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      return originalOpen.apply(this, arguments);
    };
    
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener('load', function() {
        if (this.status === 200 && this.responseText) {
          // 仅处理包含图片数据的JSON
          if (this._url.includes('replys.json') || this.responseText.includes('img_data')) {
            processJsonData(this.responseText);
          }
        }
      });
      return originalSend.apply(this, arguments);
    };
    
    // 拦截Fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('json') || contentType.includes('text')) {
          try {
            const text = await response.clone().text();
            if (text.includes('img_data') || text.includes('imgUrl')) {
              processJsonData(text);
            }
          } catch (e) {
            console.debug('[原图助手] Fetch解析异常', e);
          }
        }
      }
      return response;
    };
  };

  // ===== DOM 监听 =====
  const initDOMObserver = () => {
    // 首次扫描
    checkAllImages();
    
    // 监听新图片
    const observer = new MutationObserver(mutations => {
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
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  // ===== 初始化 =====
  const init = () => {
    console.log(`%c[学习通原图助手] %cv6.0 激活！专注目录路径映射`, 
      'color:#6a11cb;font-weight:bold;background:rgba(106,17,203,0.1);padding:2px 6px;border-radius:4px;', 
      'color:#2575fc');
    
    initNetworkHooks();
    initDOMObserver();
    
    // 每10秒兜底扫描
    setInterval(checkAllImages, 10000);
  };

  // 启动
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init, { once: true });
  }
})();

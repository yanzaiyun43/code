// ==UserScript==
// @name         图片直链
// @namespace    https://github.com/yanzaiyun43
// @version      4.0.3
// @description  智能识别所有原图链接，动态添加复制按钮
// @author       Qwen (enhanced by ailmel's base)
// @match        *://*.xuexi365.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  // ===== 核心存储 =====
  const urlMap = new Map(); // 存储所有已发现的缩略图→原图映射
  const processedImages = new WeakSet(); // 防止重复处理
  const pendingChecks = new WeakMap(); // 存储待检查的图片
  
  // ===== 智能数据提取 =====
  const extractImagePairs = (text) => {
    try {
      const data = JSON.parse(text);
      const posts = data?.data?.datas || [];
      let newMappings = 0;
      
      posts.forEach(post => {
        (post.img_data || []).forEach(img => {
          if (!img.litimg || !img.imgUrl) return;
          
          // 存储多种匹配模式
          const patterns = [
            img.litimg, // 完整URL
            new URL(img.litimg).pathname, // 仅路径
            img.litimg.split('?')[0], // 无参数
            img.imgUrl.split('/origin.')[0] // CDN基础路径
          ];
          
          patterns.forEach(pattern => {
            if (!urlMap.has(pattern)) {
              urlMap.set(pattern, img.imgUrl);
              newMappings++;
            }
          });
        });
      });
      
      // 有新数据时触发全量检查
      if (newMappings > 0) {
        console.log(`[原图助手] 发现 ${newMappings} 个新映射，触发全量检查`);
        checkAllImages();
      }
    } catch (e) {
      console.debug('[原图助手] 非图片数据或解析失败', e);
    }
  };

  // ===== 图片匹配引擎 =====
  const matchOriginalUrl = (img) => {
    if (!img.src) return null;
    
    // 1. 尝试精确匹配
    if (urlMap.has(img.src)) return urlMap.get(img.src);
    
    // 2. 尝试路径匹配
    const path = new URL(img.src, location.href).pathname;
    if (urlMap.has(path)) return urlMap.get(path);
    
    // 3. 模糊匹配 (处理CDN参数变化)
    for (const [pattern, originUrl] of urlMap) {
      if (typeof pattern === 'string' && img.src.includes(pattern)) {
        return originUrl;
      }
    }
    
    // 4. 尝试父容器数据 (学习通特有)
    const parent = img.closest('[data-imgdata]');
    if (parent) {
      try {
        const imgData = JSON.parse(parent.dataset.imgdata);
        if (imgData.imgUrl) return imgData.imgUrl;
      } catch (e) {}
    }
    
    return null;
  };

  // ===== 按钮创建与管理 =====
  const createCopyButton = (img, originalUrl) => {
    // 创建/复用容器
    let container = img.parentElement;
    if (!container || getComputedStyle(container).position === 'static') {
      if (!img.dataset.originalParent) {
        img.dataset.originalParent = 'relative-container';
        container = document.createElement('div');
        container.style.cssText = `
          position: relative; 
          display: inline-block;
          max-width: 100%;
        `;
        img.parentNode.insertBefore(container, img);
        container.appendChild(img);
      } else {
        container = img.parentElement;
      }
    }

    // 防止重复创建
    if (container.querySelector('.qwen-copy-btn')) return;
    
    // 创建按钮
    const btn = document.createElement('button');
    btn.className = 'qwen-copy-btn';
    Object.assign(btn.style, {
      position: 'absolute',
      top: '4px',
      right: '4px',
      background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      padding: '2px 8px',
      fontSize: '12px',
      fontWeight: 'bold',
      cursor: 'pointer',
      zIndex: '9999',
      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      transition: 'all 0.3s ease',
      backdropFilter: 'blur(2px)',
    });
    btn.innerHTML = '🔗 GET URL';
    btn.title = '复制高清原图链接';
    
    // 交互效果
    btn.onmouseenter = () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 3px 8px rgba(0,0,0,0.35)';
    };
    btn.onmouseleave = () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
    };
    
    // 复制逻辑 (带反馈)
    btn.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      try {
        await GM_setClipboard(originalUrl, 'text');
        showFeedback(btn, '✓ COPIED!', '#00c853');
      } catch (err) {
        console.error('[原图助手] 复制失败:', err);
        showFeedback(btn, '✗ FAILED', '#ff1744');
      }
    };
    
    container.appendChild(btn);
    processedImages.add(img);
    return btn;
  };
  
  // 按钮反馈动画
  const showFeedback = (btn, text, color) => {
    const originalHTML = btn.innerHTML;
    const originalBg = btn.style.background;
    
    btn.innerHTML = text;
    btn.style.background = color;
    btn.style.transform = 'scale(1.1)';
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = originalBg;
      btn.style.transform = 'scale(1)';
    }, 1200);
  };

  // ===== 图片处理核心 =====
  const processImage = (img) => {
    if (processedImages.has(img) || !img.isConnected) return;
    
    // 1. 优先尝试直接匹配
    const originalUrl = matchOriginalUrl(img);
    if (originalUrl) {
      createCopyButton(img, originalUrl);
      return;
    }
    
    // 2. 图片未加载完成时等待
    if (!img.complete) {
      if (!pendingChecks.has(img)) {
        pendingChecks.set(img, setTimeout(() => {
          pendingChecks.delete(img);
          processImage(img);
        }, 800)); // 800ms后重试
      }
      return;
    }
    
    // 3. 尝试备用方案（父容器数据）
    const parent = img.closest('.discuss-item, .work-content');
    if (parent && !parent.dataset.checked) {
      parent.dataset.checked = 'true';
      const scriptData = parent.querySelector('script[type="application/json"]');
      if (scriptData) {
        try {
          const data = JSON.parse(scriptData.textContent);
          (data.img_data || []).forEach(imgData => {
            urlMap.set(imgData.litimg, imgData.imgUrl);
          });
          processImage(img); // 重试
        } catch (e) {}
      }
    }
  };
  
  // 全量检查（当新数据到达时触发）
  const checkAllImages = () => {
    document.querySelectorAll('img[src*="chaoxing.com"], img[src*="cldisk.com"]').forEach(img => {
      if (!processedImages.has(img)) {
        processImage(img);
      }
    });
  };

  // ===== 网络监听增强 =====
  const initNetworkHooks = () => {
    // 拦截所有XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      return originalOpen.apply(this, arguments);
    };
    
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      this.addEventListener('load', function() {
        if (this.status === 200 && this.responseText) {
          extractImagePairs(this.responseText);
        }
      });
      return originalSend.apply(this, arguments);
    };

    // 拦截所有Fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response ok && response.headers.get('content-type')?.includes('json')) {
        try {
          const text = await response.clone().text();
          extractImagePairs(text);
        } catch (e) {
          console.debug('[原图助手] Fetch解析失败', e);
        }
      }
      return response;
    };
  };

  // ===== DOM 监听优化 =====
  const initDOMObserver = () => {
    // 处理初始图片
    document.querySelectorAll('img').forEach(processImage);
    
    // 监听新元素
    const domObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          
          // 处理单个图片
          if (node.tagName === 'IMG') {
            processImage(node);
          } 
          // 处理包含图片的容器
          else {
            node.querySelectorAll('img').forEach(processImage);
          }
        });
      });
    });
    
    domObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 监听src变化 (懒加载)
    const attrObserver = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type === 'attributes' && m.attributeName === 'src') {
          processImage(m.target);
        }
      });
    });
    
    // 初始监听所有图片
    document.querySelectorAll('img').forEach(img => {
      attrObserver.observe(img, { attributes: true, attributeFilter: ['src'] });
    });
  };

  // ===== 初始化 =====
  const init = () => {
    console.log('[原图助手] 已激活，监控所有图片数据');
    initNetworkHooks();
    initDOMObserver();
    
    // 每30秒全量检查 (兜底策略)
    setInterval(checkAllImages, 30000);
  };

  // 启动脚本
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

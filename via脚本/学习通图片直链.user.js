// ==UserScript==
// @name         图片直链
// @namespace    https://github.com/yanzaiyun43
// @version      4.0.2
// @description  自动显示复制按钮，一键获取学习通原图链接
// @author       ailmel
// @match        *://*.xuexi365.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const urlMap = new Map();  // 缩略图URL → 原图URL
  const processedImages = new WeakSet(); // 已处理的图片元素

  // 从网络响应中提取图片映射关系
  const extractImagePairs = (responseText) => {
    if (typeof responseText !== 'string') return;
    try {
      const data = JSON.parse(responseText);
      const posts = data?.data?.datas || [];
      
      posts.forEach(post => {
        (post.img_data || []).forEach(img => {
          if (img.litimg && img.imgUrl) {
            // 存储多种可能的缩略图变体
            urlMap.set(new URL(img.litimg).pathname, img.imgUrl);
            urlMap.set(new URL(img.imgUrl).pathname, img.imgUrl); // 兜底原图
            
            // 处理可能的CDN参数变体
            ['rw', 'rh', '_fileSize', '_orientation'].forEach(param => {
              const url = new URL(img.litimg);
              url.searchParams.delete(param);
              urlMap.set(url.pathname, img.imgUrl);
            });
          }
        });
      });
    } catch (e) {
      console.debug('[图片直链] 响应解析失败:', e);
    }
  };

  // 为单张图片添加复制按钮
  const addCopyButton = (img) => {
    if (processedImages.has(img) || !img.isConnected) return;
    
    // 尝试获取最终图片URL (处理懒加载)
    const finalSrc = img.complete 
      ? img.src 
      : img.dataset.src || img.getAttribute('src') || img.src;
    
    if (!finalSrc) return;
    
    // 从URL中提取路径匹配
    const path = new URL(finalSrc, location.href).pathname;
    const originalUrl = Array.from(urlMap.keys()).find(key => 
      path.includes(key) || path.replace(/_[^/.]+$/, '') === key.replace(/_[^/.]+$/, '')
    ) ? urlMap.get(path) : null;

    if (!originalUrl) {
      // 尝试模糊匹配（处理参数变化）
      for (const [thumbPath, origin] of urlMap) {
        if (path.includes(thumbPath.split('?')[0])) {
          urlMap.set(path, origin);
          addCopyButton(img);
          return;
        }
      }
      return;
    }

    // 创建按钮容器 (确保覆盖在图片上)
    let container = img.parentElement;
    if (!container || getComputedStyle(container).position === 'static') {
      container = document.createElement('div');
      container.style.position = 'relative';
      container.style.display = 'inline-block';
      img.parentNode.insertBefore(container, img);
      container.appendChild(img);
    }

    // 创建复制按钮
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      position: 'absolute',
      top: '5px',
      right: '5px',
      background: 'rgba(255, 69, 0, 0.9)',
      color: 'white',
      border: 'none',
      borderRadius: '3px',
      padding: '2px 6px',
      fontSize: '12px',
      cursor: 'pointer',
      zIndex: '9999',
      transition: 'all 0.2s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
    });
    btn.innerHTML = '🔗 原图';
    btn.title = '点击复制原图链接';

    // 按钮悬停效果
    btn.onmouseenter = () => {
      btn.style.background = 'rgba(255, 69, 0, 1)';
      btn.style.transform = 'scale(1.05)';
    };
    btn.onmouseleave = () => {
      btn.style.background = 'rgba(255, 69, 0, 0.9)';
      btn.style.transform = 'scale(1)';
    };

    // 点击复制逻辑
    btn.onclick = (e) => {
      e.stopPropagation();
      GM_setClipboard(originalUrl, 'text').then(() => {
        btn.innerHTML = '✓ 已复制';
        btn.style.background = 'rgba(46, 204, 113, 0.9)';
        setTimeout(() => {
          btn.innerHTML = '🔗 原图';
          btn.style.background = 'rgba(255, 69, 0, 0.9)';
        }, 1200);
      }).catch(err => {
        console.error('[图片直链] 复制失败:', err);
        btn.innerHTML = '✗ 失败';
        setTimeout(() => btn.innerHTML = '🔗 原图', 1000);
      });
    };

    container.appendChild(btn);
    processedImages.add(img);
  };

  // 监听网络请求获取图片映射
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
          extractImagePairs(this.responseText);
        }
      });
      return originalSend.apply(this, arguments);
    };

    // 拦截Fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.ok && response.headers.get('content-type')?.includes('json')) {
        try {
          const clone = response.clone();
          const text = await clone.text();
          extractImagePairs(text);
        } catch (e) {
          console.debug('[图片直链] Fetch响应解析失败:', e);
        }
      }
      return response;
    };
  };

  // 初始化DOM监听
  const initDOMObserver = () => {
    // 处理初始存在的图片
    document.querySelectorAll('img').forEach(img => {
      if (img.complete) {
        addCopyButton(img);
      } else {
        img.addEventListener('load', () => addCopyButton(img), { once: true });
      }
    });

    // 监听动态添加的图片
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          
          if (node.tagName === 'IMG') {
            handleImage(node);
          } else {
            node.querySelectorAll('img').forEach(handleImage);
          }
        });
      });
    });

    function handleImage(img) {
      if (processedImages.has(img)) return;
      
      if (img.complete) {
        addCopyButton(img);
      } else {
        img.addEventListener('load', () => addCopyButton(img), { once: true });
      }
    }

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 额外监听src属性变化 (处理懒加载)
    const attrObserver = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type === 'attributes' && m.attributeName === 'src') {
          addCopyButton(m.target);
        }
      });
    });

    document.querySelectorAll('img').forEach(img => {
      attrObserver.observe(img, { attributes: true, attributeFilter: ['src'] });
    });

    // 监听新添加的图片的属性变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  };

  // 初始化脚本
  const init = () => {
    initNetworkHooks();
    if (document.body) {
      initDOMObserver();
    } else {
      document.addEventListener('DOMContentLoaded', initDOMObserver);
    }
  };

  // 等待DOM稳定后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }
})();

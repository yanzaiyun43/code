// ==UserScript==
// @name         源论坛 - 签到特攻队 v2.0
// @version      2.0
// @description  自动取 formhash｜智能签到｜结果解析｜江世群专属优化 ❤️
// @author       Qwen ✨
// @match        https://pc.sysbbs.com/*
// @run-at       contextually
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const SIGN_PAGE_URL = 'https://pc.sysbbs.com/plugin.php?id=k_misign:sign';
    const REFERER = 'https://pc.sysbbs.com/k_misign-sign.html';
    const MAX_RETRY = 3;
    const TIMEOUT = 10000; // 10秒超时

    let toast;

    function show(msg, type = 'info') {
        if (toast && document.body.contains(toast)) {
            toast.textContent = msg;
            toast.style.opacity = '1';
            clearTimeout(toast.timer);
        } else {
            toast = document.createElement('div');
            Object.assign(toast.style, {
                position: 'fixed', top: '20px', right: '20px',
                maxWidth: '320px', padding: '14px 18px',
                backgroundColor: type === 'success' ? '#4CAF50' :
                              type === 'warn' ? '#FF9800' : '#333',
                color: '#fff', borderRadius: '10px',
                fontSize: '14px', fontFamily: 'sans-serif', zIndex: '999999',
                boxShadow: '0 6px 16px rgba(0,0,0,0.3)', lineHeight: '1.5'
            });
            toast.textContent = msg;
            document.body.appendChild(toast);
        }

        toast.timer = setTimeout(() => {
            if (toast) toast.style.opacity = '0';
            setTimeout(() => {
                if (toast && toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                    toast = null;
                }
            }, 300);
        }, 8000);
    }

    // ===== 🛰️ 动态获取 formhash =====
    function getFormHashFromIframe(callback, retryCount = 0) {
        const iframe = document.createElement('iframe');
        iframe.src = SIGN_PAGE_URL;
        iframe.style.display = 'none';
        iframe.timeoutId = null;

        const cleanup = () => {
            if (iframe.timeoutId) clearTimeout(iframe.timeoutId);
            if (iframe && iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
        };

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (input && input.value) {
                    cleanup();
                    callback(input.value);
                    return;
                }
            } catch (err) {
                console.warn('[formhash] 无法访问 iframe 内容，可能是跨域或未登录', err);
            }

            cleanup();
            if (retryCount < MAX_RETRY - 1) {
                setTimeout(() => {
                    getFormHashFromIframe(callback, retryCount + 1);
                }, 1500 * (retryCount + 1));
            } else {
                callback(null);
            }
        };

        iframe.onerror = () => {
            cleanup();
            if (retryCount < MAX_RETRY - 1) {
                setTimeout(() => {
                    getFormHashFromIframe(callback, retryCount + 1);
                }, 1500 * (retryCount + 1));
            } else {
                callback(null);
            }
        };

        // 设置超时
        iframe.timeoutId = setTimeout(() => {
            console.warn('[formhash] iframe 加载超时');
            cleanup();
            if (retryCount < MAX_RETRY - 1) {
                setTimeout(() => {
                    getFormHashFromIframe(callback, retryCount + 1);
                }, 1500 * (retryCount + 1));
            } else {
                callback(null);
            }
        }, TIMEOUT);

        document.body.appendChild(iframe);
    }

    // ===== 🚀 执行签到请求 =====
    function doSign(formhash) {
        if (!formhash) {
            show('❌ 获取 formhash 失败，请检查是否已登录', 'warn');
            return;
        }

        const SIGN_URL = `https://pc.sysbbs.com/plugin.php?id=k_misign:sign&operation=qiandao&format=text&formhash=${formhash}`;
        show('📡 正在发起签到请求...', 'info');

        const xhr = new XMLHttpRequest();
        xhr.open('GET', SIGN_URL, true);

        // 设置请求头
        xhr.setRequestHeader('Accept', 'text/plain, */*; q=0.01');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Referer', REFERER);
        xhr.setRequestHeader('Sec-Fetch-Site', 'same-origin');
        xhr.setRequestHeader('Sec-Fetch-Mode', 'cors');
        xhr.setRequestHeader('Sec-Fetch-Dest', 'empty');
        xhr.setRequestHeader('Accept-Language', 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7');
        xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Linux; Android 13; 23049RAD8C Build/TKQ1.221114.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.134 Mobile Safari/537.36');
        xhr.withCredentials = true;

        // 注意：Cookie 通常由浏览器自动带上（只要你是登录状态）
        // 如果你想强制指定，可以取消下面这行注释（但不推荐长期使用明文 Cookie）
        // xhr.setRequestHeader('Cookie', 'YPSa_1b7e_saltkey=xxx; YPSa_1b7e_auth=xxx');

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                const res = xhr.responseText.trim();

                console.log('[签到响应]', res);
                console.log('[HTTP 状态]', xhr.status);

                if (xhr.status === 200 && /success/.test(res)) {
                    const reward = (res.split('\t')[2] || '未知奖励').replace(/\n/g, ' ');
                    show(`🎉 签到成功！${reward}`, 'success');
                } 
                else if (/already/.test(res)) {
                    show('✅ 今日已签到，无需重复操作', 'info');
                } 
                else if (/noperm/.test(res)) {
                    show('⛔ 登录失效，请重新登录后重试', 'warn');
                }
                else if (xhr.status === 403 || /System Error/.test(res)) {
                    show('🚫 请求被系统拦截！\n👉 可能原因：UA异常 / 请求频率过高', 'warn');
                }
                else {
                    show(`⚠️ 未知错误：${res.slice(0, 60)}...`, 'warn');
                }
            }
        };

        xhr.onerror = () => {
            show('❌ 网络错误或请求失败', 'warn');
        };

        xhr.send();
    }

    // ===== 🎯 主入口：添加按钮并启动测试 =====
    function injectButton() {
        setTimeout(() => {
            if (document.querySelector('#qwen-sign-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'qwen-sign-btn';
            Object.assign(btn.style, {
                position: 'fixed', bottom: '30px', right: '30px',
                background: '#00bcd4', color: 'white', border: 'none',
                padding: '12px 18px', borderRadius: '8px',
                fontSize: '14px', cursor: 'pointer', zIndex: 99999,
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                transition: 'background 0.2s'
            });
            btn.textContent = '⚡ 一键签到';
            btn.onmouseenter = () => btn.style.background = '#0097a7';
            btn.onmouseleave = () => btn.style.background = '#00bcd4';

            btn.onclick = () => {
                if (confirm('真的要执行签到吗？确保你今天还没签哦～')) {
                    show('🔍 正在获取最新 formhash...', 'info');
                    getFormHashFromIframe((hash) => {
                        if (hash) {
                            console.log('[formhash 获取成功]', hash);
                            doSign(hash);
                        } else {
                            show('❌ 连续多次获取 formhash 失败，请手动访问签到页后再试', 'warn');
                        }
                    });
                }
            };

            document.body.appendChild(btn);
        }, 1000);
    }

    // ===== 启动 =====
    if (window.location.hostname === 'pc.sysbbs.com') {
        injectButton();
    }

})();

// ==UserScript==
// @name         源论坛助手 v3.8
// @namespace    http://tampermonkey.net/
// @version      3.8
// @description  签到+三帖连发｜智能获取formhash｜精准识别签到状态｜
// @author       Qwen 守护你 ❤️
// @match        https://pc.sysbbs.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ===== 配置区 =====
    const SITE_URL = 'https://pc.sysbbs.com';
    const SIGN_PAGE_URL = `${SITE_URL}/plugin.php?id=k_misign:sign`;
    const POST_URL = `${SITE_URL}/forum.php?mod=post&action=newthread`;

    const TRIPLE_POST_COUNT = 3;

    // ===== UI 控制对象 =====
    let QWEN_UI = {
        toast: null,
        button: null,
        lastFormHash: null, // 仅内存保存，用于调试显示
        isButtonVisible: true
    };

    // ===== 显示状态提示（Toast）=====
    function showStatus(msg, type = 'info') {
        const colors = {
            info: '#3498db',
            success: '#2ecc71',
            warn: '#f39c12',
            error: '#e74c3c'
        };

        console.log(`[Qwen] ${new Date().toLocaleTimeString()} | ${msg}`);

        if (!QWEN_UI.toast) {
            QWEN_UI.toast = document.createElement('div');
            Object.assign(QWEN_UI.toast.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                maxWidth: '320px',
                padding: '12px 16px',
                background: '#fff',
                color: '#333',
                fontSize: '14px',
                borderRadius: '8px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                borderLeft: `4px solid ${colors[type] || '#3498db'}`,
                zIndex: '99999',
                transition: 'opacity 0.3s ease',
                cursor: 'default',
                lineHeight: '1.5',
                opacity: 0
            });
            QWEN_UI.toast.innerHTML = `
                <div style="font-weight:bold;margin-bottom:4px;">千问助手</div>
                <div class="msg"></div>
            `;
            document.body.appendChild(QWEN_UI.toast);
        }

        QWEN_UI.toast.querySelector('.msg').textContent = msg;
        QWEN_UI.toast.style.borderLeftColor = colors[type];
        QWEN_UI.toast.style.opacity = '1';

        setTimeout(() => {
            QWEN_UI.toast.style.opacity = '0';
        }, 3000);
    }

    // ===== 创建调试按钮：查看 formhash =====
    function createDebugButton() {
        if (QWEN_UI.button) return;

        QWEN_UI.button = document.createElement('button');
        Object.assign(QWEN_UI.button.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            background: '#ff6b6b',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            zIndex: '99998',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            transition: 'all 0.2s ease'
        });

        QWEN_UI.button.innerHTML = '?';
        QWEN_UI.button.title = '点击查看 formhash 状态';

        QWEN_UI.button.onclick = () => {
            if (!QWEN_UI.lastFormHash) {
                alert('❌ 未获取到 formhash\n请先访问一次签到页或等待脚本运行');
            } else {
                const hashShort = QWEN_UI.lastFormHash.slice(0, 8) + '...';
                const confirmed = confirm(`🔍 当前 formhash:\n${hashShort}\n\n是否复制到剪贴板？`);
                if (confirmed) {
                    navigator.clipboard.writeText(QWEN_UI.lastFormHash).then(() => {
                        alert('✅ 已复制！');
                    }).catch(err => {
                        console.error('复制失败', err);
                        alert('⚠️ 复制失败，请手动选择');
                    });
                }
            }
        };

        QWEN_UI.button.onmouseover = () => {
            QWEN_UI.button.style.transform = 'scale(1.1)';
        };
        QWEN_UI.button.onmouseout = () => {
            QWEN_UI.button.style.transform = 'scale(1)';
        };

        document.body.appendChild(QWEN_UI.button);
    }

    // ===== 判断是否已签到过（页面文本检测）=====
    function isAlreadySigned() {
        const pageText = document.body.innerText;
        const alreadySignIndicators = ['已签到', '今日已到', '签过啦', '明天再来', '连续签到'];
        return alreadySignIndicators.some(text => pageText.includes(text));
    }

    // ===== 智能获取 formhash（v3.8 多源探测增强版）=====
    function getFormHash(callback) {
        // ✅ 方法 1：从链接中提取 formhash
        const links = document.querySelectorAll('a[href*="formhash="]');
        for (let link of links) {
            const href = link.href;
            const match = href.match(/[?&]formhash=([a-z0-9]+)(?:[&#]|$)/i);
            if (match && match[1]) {
                console.log('[Qwen] 从链接中提取到 formhash:', match[1]);
                QWEN_UI.lastFormHash = match[1];
                showStatus('🔍 已从页面链接获取 formhash', 'info');
                callback(match[1]);
                return;
            }
        }

        // ✅ 方法 2：查找隐藏输入框
        const input = document.querySelector('input[name="formhash"]');
        if (input?.value) {
            console.log('[Qwen] 从 input 元素获取 formhash:', input.value);
            QWEN_UI.lastFormHash = input.value;
            showStatus('🔍 已从表单输入框获取 formhash', 'info');
            callback(input.value);
            return;
        }

        // ✅ 方法 3：从 JS 脚本中尝试提取
        const scripts = document.querySelectorAll('script');
        for (let script of scripts) {
            const text = script.textContent || '';
            const match = text.match(/formhash\s*[=:]\s*['"]?([a-z0-9]+)['"]?/i);
            if (match && match[1]) {
                console.log('[Qwen] 从 JS 中提取 formhash:', match[1]);
                QWEN_UI.lastFormHash = match[1];
                showStatus('🔍 已从JS脚本提取 formhash', 'info');
                callback(match[1]);
                return;
            }
        }

        // ⚠️ 方法 4：iframe 回退加载签到页
        showStatus('🔄 当前页未找到，尝试 iframe 加载...', 'warn');

        const iframe = document.createElement('iframe');
        iframe.src = SIGN_PAGE_URL + '&mobile=2';
        iframe.style.display = 'none';
        iframe.timeoutId = null;

        const cleanup = () => {
            if (iframe.timeoutId) clearTimeout(iframe.timeoutId);
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        };

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (input?.value) {
                    QWEN_UI.lastFormHash = input.value;
                    console.log('[Qwen] iframe 成功获取 formhash:', input.value);
                    cleanup();
                    callback(input.value);
                    return;
                } else {
                    console.warn('[Qwen] iframe 页面加载完成，但未找到 formhash');
                }
            } catch (e) {
                console.error('[Qwen] iframe 跨域读取失败', e);
            }
            cleanup();
            callback(null);
        };

        iframe.onerror = () => {
            console.warn('[Qwen] iframe 加载出错');
            cleanup();
            callback(null);
        };

        iframe.timeoutId = setTimeout(() => {
            console.warn('[Qwen] iframe 加载超时（6秒）');
            cleanup();
            callback(null);
        }, 6000);

        document.body.appendChild(iframe);
    }

    // ===== 解析 XML 响应中的 CDATA 内容 =====
    function parseXmlResponse(text) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/xml');
            const root = doc.querySelector('root');
            if (root) {
                return root.textContent.trim();
            }
            return text; // fallback
        } catch (e) {
            return text;
        }
    }

    // ===== 真实签到请求（v3.8 智能解析XML）=====
    function doSign(formhash) {
        if (!formhash) {
            showStatus('❌ 签到失败：formhash 为空', 'error');
            return;
        }

        const xhr = new XMLHttpRequest();
        const url = `${SITE_URL}/plugin.php?id=k_misign:sign&operation=qiandao&format=text&formhash=${formhash}`;

        xhr.open('GET', url, true);
        xhr.withCredentials = true;
        xhr.setRequestHeader('Referer', SIGN_PAGE_URL);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Accept', 'application/xml, text/xml, */*; q=0.01');

        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
                const rawRes = xhr.responseText.trim();

                // ✅ 智能解析 XML 或纯文本
                let statusText = rawRes;
                if (rawRes.startsWith('<?xml')) {
                    statusText = parseXmlResponse(rawRes);
                }

                console.log(`[签到响应] ${statusText}`);

                // 🟢 成功签到
                if (/签到成功|reward|已获得奖励/i.test(statusText)) {
                    const reward = extractReward(rawRes) || '星币+1';
                    console.log(`[签到成功] ${reward}`);
                    showStatus(`🎉 签到成功：${reward}`, 'success');
                    startTriplePost(); // ✅ 启动发帖
                }
                // 🟡 今日已签
                else if (/今日已签|已经签到|重复操作|重复签到/i.test(statusText)) {
                    console.log('[签到] 今日已完成');
                    showStatus('📅 今日已签到，无需重复', 'info');
                }
                // 🔴 完全失败（网络/参数错误）
                else if (xhr.status !== 200) {
                    showStatus('⚠️ 网络异常，签到请求失败', 'error');
                }
                // ⚠️ 其他未知错误
                else {
                    console.warn('[签到失败]', rawRes);
                    showStatus(`❌ 签到失败：${truncateText(statusText, 30)}`, 'error');
                }
            }
        };
        xhr.send();
    }

    // ===== 提取奖励信息（可选）=====
    function extractReward(response) {
        const match = response.match(/reward.*?>([^<]+)<\/message>/i);
        if (match) return match[1].trim();
        return null;
    }

    // ===== 截断长文本用于显示 =====
    function truncateText(str, len) {
        return str.length > len ? str.slice(0, len) + '...' : str;
    }

    // ===== 发帖函数 · 三篇随机内容 =====
    function startTriplePost() {
        const lastPostTime = localStorage.getItem('qwen_last_post_time');
        const now = Date.now();
        if (lastPostTime && now - lastPostTime < 24 * 60 * 60 * 1000) {
            console.log('[Qwen] 今日已发过帖，不再重复');
            return;
        }

        showStatus(`📝 开始发送 ${TRIPLE_POST_COUNT} 篇低调帖子...`, 'info');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = POST_URL;

        let cleanupCalled = false;
        function cleanup() {
            if (cleanupCalled) return;
            cleanupCalled = true;
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (!input?.value) {
                    cleanup();
                    return;
                }

                const formhashValue = input.value;
                sendOnePost(formhashValue, 0);

                localStorage.setItem('qwen_last_post_time', Date.now().toString());
            } catch (e) {
                cleanup();
            }
        };

        iframe.onerror = cleanup;

        const TITLES = [
            '今天也来了', '日常报到', '路过留个脚印', '随便发个帖', '平凡的一天',
            '最近在忙啥呢', '看到新帖挺多', '心情不错，冒个泡', '今天刷到了好东西', '有点感慨，说两句'
        ];

        const MESSAGES = [
            '刷一下存在感 😄 生活需要一点小仪式感',
            '最近工作有点累，但还是来看看大家',
            '默默关注中，偶尔冒个泡，别见怪',
            '看到几个有意思的帖子，挺有意思',
            '今天天气不错，心情也挺好~',
            '好久没来了，论坛还是这么热闹',
            '刚吃完饭，顺手打开看看有什么新鲜事',
            '最近都在听老歌，感觉特别治愈',
            '有时候一句话就能让人心里一暖',
            '发现一个好用的小工具，回头分享一下',
            '每天来一趟，像打卡一样习惯了',
            '昨晚做了个梦，醒来还记得一点点',
            '今天遇到件小事，还挺值得思考的',
            '看到有人讨论读书，我也爱看书',
            '手机相册翻到一张旧照，有点怀念',
            '生活平平淡淡，但也挺踏实的',
            '有时候不想说话，但发个帖就觉得安心',
            '看到新人加入，欢迎你们呀～',
            '最近在学做饭，终于不怕糊锅了😂',
            '这个世界吵吵闹闹，但我喜欢这里的安静'
        ];

        function sendOnePost(formhash, index) {
            const title = TITLES[Math.floor(Math.random() * TITLES.length)];
            const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

            const data = {
                formhash,
                posttime: Math.floor(Date.now() / 1000),
                delete: 0,
                topicsubmit: 'yes',
                subject: title,
                message,
                usesig: 1
            };

            const params = Object.keys(data)
                .map(k => `${k}=${encodeURIComponent(data[k])}`)
                .join('&');
            const url = POST_URL + '&extra=&mobile=2&handlekey=postform&inajax=1';

            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        showStatus(`✅ 第${index + 1}/${TRIPLE_POST_COUNT}完成`, 'success');
                        if (index < TRIPLE_POST_COUNT - 1) {
                            setTimeout(
                                () => sendOnePost(formhash, index + 1),
                                1800 + Math.random() * 1000
                            );
                        } else {
                            showStatus('🎉 三帖全部完成！低调活跃达成 ✨', 'success');
                        }
                    } else {
                        showStatus(`❌ 第${index + 1}失败，继续下一帖`, 'warn');
                        if (index < TRIPLE_POST_COUNT - 1) {
                            setTimeout(
                                () => sendOnePost(formhash, index + 1),
                                2000 + Math.random() * 1000
                            );
                        } else {
                            showStatus('⚠️ 部分发帖未成功，不影响整体', 'warn');
                        }
                    }
                }
            };

            xhr.send(params);
        }

        document.body.appendChild(iframe);
    }

    // ===== 🚀 主程序入口 =====
    (async function main() {
        // ✅ 只在目标域名运行
        if (!window.location.href.includes('sysbbs.com')) return;

        // ✅ 显示启动提示
        showStatus('🟢 脚本已启动，正在检测...', 'info');

        // ✅ 创建调试按钮
        createDebugButton();

        // ✅ 检查是否已签到（页面级）
        if (isAlreadySigned()) {
            console.log('[Qwen] 检测到今日已签到');
            showStatus('📅 今日已签到，任务结束', 'info');
            return;
        }

        // ✅ 获取 formhash 并执行签到
        getFormHash((hash) => {
            if (!hash) {
                showStatus('❌ 无法获取 formhash，请手动访问签到页一次', 'error');
                return;
            }
            doSign(hash);
        });

    })();

})();

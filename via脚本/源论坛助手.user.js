// ==UserScript==
// @name         源论坛助手
// @version      3.3
// @description  签到+发帖+iframe安全取数+浮动测试面板
// @author       ailmel
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FID = 140;
    const SIGN_PLUGIN_URL = 'https://pc.sysbbs.com/plugin.php?id=k_misign:sign';
    const POST_URL = `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}`;
    const TRIPLE_POST_COUNT = 3;

    // ===== 标志位：防止同一天内重复执行 =====
    function getTodayKey() {
        const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        return `qwen_task_done_${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }

    function hasTaskRunToday() {
        return localStorage.getItem(getTodayKey()) === '1';
    }

    function markTaskAsDone() {
        localStorage.setItem(getTodayKey(), '1');
    }

    // ===== 是否6点后 =====
    function isAfterSixAM() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        return now.getHours() > 6 || (now.getHours() === 6 && now.getMinutes() >= 0);
    }

    // ===== Toast 提示系统 =====
    let toast;
    function showStatus(msg, type = 'info') {
        if (toast && document.body.contains(toast)) {
            toast.textContent = msg;
            toast.style.opacity = '1';
            clearTimeout(toast.timer);
        } else {
            toast = document.createElement('div');
            toast.id = 'qwen-toast';
            Object.assign(toast.style, {
                position: 'fixed', top: '20px', right: '20px',
                maxWidth: '320px', padding: '14px 18px',
                backgroundColor: type === 'success' ? '#4CAF50' :
                              type === 'warn' ? '#FF9800' : '#333',
                color: '#fff', borderRadius: '10px',
                fontSize: '14px', fontFamily: 'sans-serif', zIndex: '999999',
                boxShadow: '0 6px 16px rgba(0,0,0,0.3)', lineHeight: '1.5',
                transition: 'opacity 0.3s ease', wordBreak: 'break-word'
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
        }, 5000);
    }

    // ===== 获取 formhash —— 通过 iframe 安全加载 =====
    function getFormHashFromIframe(callback) {
        // 缓存机制：5分钟内不重复加载 iframe
        const cached = localStorage.getItem('cached_sign_formhash');
        const cacheTime = localStorage.getItem('cached_sign_formhash_time');
        const now = Date.now();

        if (cached && cacheTime && (now - cacheTime < 5 * 60 * 1000)) {
            console.log('🔁 使用缓存的 formhash');
            callback(cached);
            return;
        }

        showStatus('🔒 正在安全加载签到页...', 'info');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = SIGN_PLUGIN_URL;

        iframe.onload = function () {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (input && input.value) {
                    const formhash = input.value;

                    // 缓存结果
                    localStorage.setItem('cached_sign_formhash', formhash);
                    localStorage.setItem('cached_sign_formhash_time', now);

                    console.log('🎉 成功从 iframe 获取 formhash:', formhash);
                    callback(formhash);
                } else {
                    console.warn('⚠️ iframe 中未找到 formhash 元素');
                    callback(null);
                }
            } catch (err) {
                console.error('⛔ 无法访问 iframe 内容（跨域？）', err);
                callback(null);
            } finally {
                setTimeout(() => iframe.remove(), 2000); // 清理
            }
        };

        iframe.onerror = () => {
            console.error('❌ iframe 加载失败（网络或权限问题）');
            callback(null);
        };

        document.body.appendChild(iframe);
    }

    // ===== 执行签到 =====
    function doRealSign(callback) {
        showStatus('🔔 正在尝试签到...', 'info');

        // 从 iframe 获取 formhash
        getFormHashFromIframe(formhash => {
            if (!formhash) {
                showStatus('⚠️ 无法获取 formhash（iframe 失败），跳过签到', 'warn');
                callback(false);
                return;
            }

            const url = `${SIGN_PLUGIN_URL}&operation=qiandao&format=text&formhash=${formhash}`;
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Accept', 'text/plain, */*; q=0.01');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200 && /success/.test(xhr.responseText)) {
                        const reward = (xhr.responseText.split('\t')[2] || '获得积分').replace(/\n/g, ' ');
                        showStatus(`🎉 签到成功！${reward}`, 'success');
                        callback(true);
                    } else if (/already/.test(xhr.responseText)) {
                        showStatus('✅ 今日已签到', 'info');
                        callback(true);
                    } else {
                        showStatus('ℹ️ 签到状态未知，可能已完成', 'info');
                        callback(true);
                    }
                }
            };

            xhr.onerror = () => {
                showStatus('⚠️ 网络错误，跳过签到', 'warn');
                callback(true);
            };

            xhr.send();
        });
    }

    // ===== 发帖函数 =====
    function startTriplePost() {
        showStatus(`📝 开始发送 ${TRIPLE_POST_COUNT} 篇低调帖子...`, 'info');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = POST_URL;

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (!input?.value) return cleanup();

                const formhashValue = input.value;
                sendOnePost(formhashValue, 0);
            } catch (e) { cleanup(); }
        };

        const TITLES = [
            '今天也来了', '日常报到', '路过留个脚印', '随便发个帖', '平凡的一天',
            '最近在忙啥呢', '看到新帖挺多', '心情不错，冒个泡', '今天刷到了好东西', '有点感慨，说两句'
        ];

        const MESSAGES = [
            '刷一下存在感 😄 生活需要一点小仪式感',
            '最近工作有点累，但还是来看看大家',
            '默默关注中，偶尔冒个泡，别见怪',
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

            const params = Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&');
            const url = POST_URL + '&extra=&mobile=2&handlekey=postform&inajax=1';

            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        showStatus(`✅ 第${index+1}/${TRIPLE_POST_COUNT}完成`);
                        if (index < TRIPLE_POST_COUNT - 1) {
                            setTimeout(() => sendOnePost(formhash, index + 1), 1800);
                        } else {
                            showStatus('🎉 三帖全部完成！活跃达成 ✨', 'success');
                        }
                    } else {
                        showStatus(`❌ 第${index+1}失败，继续下一帖`, 'warn');
                        if (index < TRIPLE_POST_COUNT - 1) {
                            setTimeout(() => sendOnePost(formhash, index + 1), 2000);
                        } else {
                            showStatus('⚠️ 部分发帖未成功，不影响整体', 'warn');
                        }
                    }
                }
            };

            xhr.send(params);
        }

        function cleanup() {
            setTimeout(() => iframe.remove(), 10000);
        }

        document.body.appendChild(iframe);
    }

    // ===== 主流程：防重复执行核心逻辑 =====
    function main() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        const timeStr = now.toTimeString().slice(0, 8);

        if (hasTaskRunToday()) {
            showStatus(`🟢 今日任务已完成\n🔄 刷新不会重复执行`, 'info');
            return;
        }

        if (!isAfterSixAM()) {
            showStatus(`🌙 夜猫子你好～\n⏰ 6点前不执行任务\n💤 先睡会儿，明早见！`, 'warn');
            return;
        }

        markTaskAsDone();

        showStatus('🚀 开始今日任务...', 'info');
        doRealSign(success => {
            setTimeout(startTriplePost, 1000);
        });
    }

    // ===== 启动 =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(main, 500));
    } else {
        setTimeout(main, 500);
    }

    // ===== 浮动调试面板：Qwen Tester =====
    function createDebugPanel() {
        const panel = document.createElement('div');
        panel.innerHTML = `
            <div id="qwen-debug-toggle" style="
                position: fixed; bottom: 20px; right: 20px;
                width: 40px; height: 40px;
                background: #ff6b6b; color: white;
                border-radius: 50%; text-align: center;
                line-height: 40px; font-size: 18px;
                cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 999998; user-select: none;
                transition: transform 0.2s;
            ">🐱</div>
            <div id="qwen-debug-content" style="
                display: none;
                position: fixed; bottom: 80px; right: 20px;
                width: 300px; max-height: 400px;
                background: #fff; border: 1px solid #ddd;
                border-radius: 12px; padding: 16px;
                font-family: sans-serif; font-size: 14px;
                box-shadow: 0 6px 20px rgba(0,0,0,0.15);
                z-index: 999998; overflow-y: auto;
            ">
                <h3 style="margin: 0 0 12px; color: #333;">🐾 测试器</h3>
                <button data-action="check-login" style="btn">🔍 检查登录</button><br><br>
                <button data-action="test-formhash" style="btn">🔑 测试 formhash</button><br><br>
                <button data-action="reload-signpage" style="btn">🔄 重载签到页 iframe</button><br><br>
                <button data-action="clear-today" style="btn">🗑️ 清除今日标记</button><br><br>
                <pre id="debug-log" style="
                    margin: 0; padding: 8px; background: #f5f5f5;
                    border: 1px solid #eee; border-radius: 6px;
                    font-size: 12px; color: #555; min-height: 60px;
                ">等待操作...</pre>
            </div>
        `;

        // 添加按钮样式
        const style = document.createElement('style');
        style.textContent = `
            #qwen-debug-content button[style="btn"] {
                padding: 8px 12px; background: #4CAF50; color: white;
                border: none; border-radius: 6px; cursor: pointer;
                font-size: 13px; width: 100%;
                transition: background 0.2s;
            }
            #qwen-debug-content button[style="btn"]:hover {
                background: #388E3C;
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(panel);

        const toggle = document.getElementById('qwen-debug-toggle');
        const content = document.getElementById('qwen-debug-content');
        const log = document.getElementById('debug-log');

        function appendLog(msg) {
            console.log('[Qwen Tester]', msg);
            log.textContent += `\n${new Date().toTimeString().slice(0,8)} > ${msg}`;
            log.scrollTop = log.scrollHeight;
        }

        function clearLog() {
            log.textContent = '';
        }

        toggle.onclick = () => {
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        };

        // 点击事件委托
        content.addEventListener('click', e => {
            const target = e.target.closest('button');
            if (!target) return;

            const action = target.dataset.action;
            clearLog();
            appendLog(`开始执行: ${action}`);

            switch (action) {
                case 'check-login':
                    const usernameEl = document.querySelector('.uinfo a') || document.querySelector('#umenu a');
                    if (usernameEl?.textContent.trim()) {
                        appendLog(`✅ 已登录，用户名: ${usernameEl.textContent.trim()}`);
                    } else {
                        appendLog(`❌ 未检测到用户名，请检查是否登录`);
                    }
                    break;

                case 'test-formhash':
                    getFormHashFromIframe(formhash => {
                        if (formhash) {
                            appendLog(`🎉 成功获取 formhash: ${formhash}`);
                        } else {
                            appendLog(`❌ 无法获取 formhash，请确认：\n- 是否已登录\n- 广告拦截是否关闭\n- 网络是否正常`);
                        }
                    });
                    break;

                case 'reload-signpage':
                    clearLog();
                    appendLog('加载签到页 iframe...');
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'position:fixed;top:10px;left:10px;width:300px;height:400px;z-index:9999;border:2px solid #00aaff;';
                    iframe.src = SIGN_PLUGIN_URL;

                    iframe.onload = () => {
                        try {
                            const doc = iframe.contentDocument || iframe.contentWindow.document;
                            const input = doc.querySelector('input[name="formhash"]');
                            if (input && input.value) {
                                appendLog(`🟢 iframe 加载成功！formhash: ${input.value}`);
                            } else {
                                appendLog(`🟡 页面加载但未找到 formhash`);
                            }
                        } catch (e) {
                            appendLog(`⛔ 无法访问内容: ${e.message}`);
                        }
                    };
                    iframe.onerror = () => appendLog('🔴 iframe 加载失败');
                    document.body.appendChild(iframe);

                    // 添加关闭按钮
                    const btn = document.createElement('button');
                    btn.textContent = '× 关闭测试 iframe';
                    btn.onclick = () => {
                        iframe.remove();
                        btn.remove();
                    };
                    btn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:10000;background:red;color:white;border:none;padding:8px;font-size:12px;';
                    document.body.appendChild(btn);
                    break;

                case 'clear-today':
                    const key = getTodayKey();
                    localStorage.removeItem(key);
                    appendLog(`🗑️ 已清除今日标记: ${key}\n明天可再次运行`);
                    break;
            }
        });
    }

    // ===== 首页加载一次调试面板 =====
    if (window.location.href.includes('pc.sysbbs.com')) {
        setTimeout(createDebugPanel, 2000); // 延迟加载，避免干扰主流程
    }

})();

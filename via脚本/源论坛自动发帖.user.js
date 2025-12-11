// ==UserScript==
// @name         源论坛全能助手（全站可见版）
// @version      2.2
// @description  主页也能看到运行状态！智能判断签到+发帖全流程
// @author       Qwen ❤️
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FID = 140;
    const SIGN_PLUGIN_URL = 'https://pc.sysbbs.com/plugin.php?id=k_misign:sign';
    const TRIPLE_POST_COUNT = 3;

    // ===== 是否6点后？=====
    function isAfterSixAM() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        return now.getHours() > 6 || (now.getHours() === 6 && now.getMinutes() >= 0);
    }

    function getTodayKey() {
        const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        return `signed_${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }

    function hasSignedToday() {
        return localStorage.getItem(getTodayKey()) === '1';
    }

    // ===== 创建全局 Toast =====
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

    // ===== 获取 formhash =====
    function getFormHashFromPage(callback) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', SIGN_PLUGIN_URL, true);
        xhr.onload = function () {
            if (xhr.status === 200) {
                const html = xhr.responseText;
                const match = html.match(/name="formhash" value="([a-zA-Z0-9]+)"/);
                callback(match ? match[1] : null);
            } else {
                callback(null);
            }
        };
        xhr.onerror = () => callback(null);
        xhr.send();
    }

    // ===== 真实签到 =====
    function doRealSign(callback) {
        getFormHashFromPage(formhash => {
            if (!formhash) return callback(false);

            const url = `${SIGN_PLUGIN_URL}&operation=qiandao&format=text&formhash=${formhash}`;
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Accept', 'text/plain, */*; q=0.01');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200 && xhr.responseText.includes('success')) {
                        const reward = xhr.responseText.split('\t')[2] || '获得奖励';
                        showStatus(`🎉 签到成功！${reward.replace(/\n/g, ' ')}`, 'success');
                        localStorage.setItem(getTodayKey(), '1');
                        callback(true);
                    } else if (xhr.responseText.includes('already')) {
                        showStatus('✅ 今日已签到', 'info');
                        localStorage.setItem(getTodayKey(), '1');
                        callback(true);
                    } else {
                        callback(false);
                    }
                }
            };

            xhr.onerror = () => callback(false);
            xhr.send();
        });
    }

    // ===== 发三帖（略去细节，和之前一致）=====
    function startTriplePost() {
        showStatus('📝 开始发送3篇低调帖子...', 'info');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}`;

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (!input?.value) return;

                const formhashValue = input.value;
                sendOnePost(formhashValue, 0);
            } catch (e) {}
        };

        function sendOnePost(formhash, index) {
            const titles = ['今天也来了', '日常报到', '路过留个脚印'];
            const messages = ['刷一下存在感 😄', '生活需要一点小仪式感', '默默关注中'];

            const title = titles[Math.floor(Math.random() * titles.length)];
            const message = messages[Math.floor(Math.random() * messages.length)];

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
            const url = `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}&extra=&mobile=2&handlekey=postform&inajax=1`;

            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (index < TRIPLE_POST_COUNT - 1) {
                        setTimeout(() => sendOnePost(formhash, index + 1), 1800);
                    } else {
                        showStatus('🎉 三帖全部完成！低调活跃达成 ✨', 'success');
                    }
                }
            };

            xhr.send(params);
        }

        document.body.appendChild(iframe);
        setTimeout(() => { if (iframe.parentNode) iframe.remove(); }, 10000);
    }

    // ===== 主流程：所有页面都能跑！=====
    function main() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        const timeStr = now.toTimeString().slice(0, 8);

        // 👇 在任何页面都显示初始状态
        showStatus(`📌 助手启动中...\n⏰ ${timeStr}`, 'info');

        // 早于6点？
        if (!isAfterSixAM()) {
            showStatus(`🌙 夜猫子你好～\n⏰ 6点前不执行任务\n💤 先睡会儿，明早见！`, 'warn');
            return;
        }

        // 已签过？
        if (hasSignedToday()) {
            showStatus(`✅ 今日已完成\n🔁 自动跳过签到\n📤 即将发3帖保持活跃`, 'info');
            startTriplePost();
            return;
        }

        // 否则：开始签到 + 发帖
        showStatus('🔔 准备执行真实签到...', 'info');
        doRealSign(success => {
            setTimeout(startTriplePost, 1000);
        });
    }

    // ===== 不管什么页面，加载完就运行 =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        setTimeout(main, 500); // 确保 DOM 存在
    }

})();

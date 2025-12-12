// ==UserScript==
// @name         源论坛助手
// @namespace    http://tampermonkey.net/
// @version      3.9.4
// @description  带 Toast 提示的智能签到+三连发贴
// @author       Qwen
// @match        https://pc.sysbbs.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TRIPLE_POST_COUNT = 3;

    // ======================
    // 🍞 Toast 提示系统
    // ======================
    function createToast(message, type = 'info') {
        const toast = document.createElement('div');
        Object.assign(toast.style, {
            position: 'fixed',
            top: '80px',
            right: '20px',
            maxWidth: '300px',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#fff',
            backgroundColor: getToastColor(type),
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '99999',
            opacity: '0',
            transform: 'translateX(100%)',
            transition: 'all 0.3s ease'
        });
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function getToastColor(type) {
        const colors = {
            success: ['#4ade80', '#22c55e', '#16a34a'],
            warn: ['#fbbf24', '#f59e0b', '#d97706'],
            error: ['#f87171', '#ef4444', '#dc2626'],
            info: ['#60a5fa', '#3b82f6', '#2563eb']
        }[type] || '#3b82f6';

        return colors[Math.floor(Math.random() * colors.length)];
    }

    // ======================
    // UI 状态显示（调试面板）
    // ======================
    function showStatus(text, type = 'info') {
        const time = new Date().toTimeString().slice(0, 8);
        console.log(`[Qwen] ${time} | ${text}`);

        if (window.QWEN_UI) {
            window.QWEN_UI.statusEl.textContent = text;
            window.QWEN_UI.statusEl.className = type;
        }
    }

    function createDebugButton() {
        if (document.querySelector('#qwen-debug-btn')) return;

        const btn = Object.assign(document.createElement('button'), {
            id: 'qwen-debug-btn',
            textContent: 'Qwen 调试面板',
            style: `
                position: fixed; top: 10px; right: 10px; z-index: 9999;
                background: #ff6b6b; color: white; border: none; padding: 8px 12px;
                border-radius: 4px; font-size: 12px; cursor: pointer;
            `
        });

        btn.onclick = () => alert('Qwen v3.9.4 正在运行\n状态：' + (document.querySelector('#qwen-status')?.textContent || '未知'));

        document.body.appendChild(btn);
    }

    // ======================
    // 提取 formhash（多策略）
    // ======================
    function tryGetFormhash() {
        // 方法1：input 表单
        const input = document.querySelector('input[name="formhash"]');
        if (input?.value) return input.value.trim();

        // 方法2：URL 参数
        const urlParams = new URLSearchParams(window.location.search);
        const hash = urlParams.get('formhash');
        if (hash) return hash.trim();

        // 方法3：JS 变量
        const scripts = document.querySelectorAll('script');
        for (let s of scripts) {
            const m = s.textContent.match(/formhash\s*[=:]\s*['"]?([a-z0-9]+)['"]?/i);
            if (m && m[1]) return m[1].trim();
        }

        return null;
    }

    // ======================
    // 判断是否已签到
    // ======================
    function isAlreadySigned() {
        const signedTexts = ['已签到', '今日已签', '重复签到', '您今天已经签到'];
        const pageText = (document.body.innerText || '').replace(/\s+/g, '');
        return signedTexts.some(t => pageText.includes(t));
    }

    // ======================
    // 执行签到
    // ======================
    async function doSign(formhash) {
        const signUrl = 'https://pc.sysbbs.com/plugin.php?id=dsu_paulsign:sign&operation=qiandao&infloat=1&inajax=1';
        const data = { formhash, qdxq: 'kx', qdmode: '1', todaysay: '', fastreply: '0' };

        try {
            const response = await fetch(signUrl, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': window.location.href,
                    'Origin': 'https://pc.sysbbs.com'
                },
                body: new URLSearchParams(data).toString()
            });

            const text = await response.text();
            if (text.includes('签到成功')) {
                createToast('🎉 签到成功！开始补活跃...', 'success');
                showStatus('🎉 签到成功！开始补活跃...');
                startTriplePost(formhash);
            } else {
                createToast('📅 今日已签或签到失败', 'info');
                showStatus('📅 今日已签或签到失败');
                startTriplePost(formhash);
            }
        } catch (err) {
            createToast('⚠️ 签到请求失败，直接进入发帖', 'warn');
            showStatus('⚠️ 签到请求失败，直接进入发帖');
            startTriplePost(formhash);
        }
    }

    // ======================
    // 发三篇低调帖子（影子模式）
    // ======================
    async function sendOnePostShadow(formhash, index) {
        const TITLES = [
            '签到', '日常打卡', '今天也要元气满满呀～',
            '水一贴求活跃', '低调路过', '生活不易猫猫叹气',
            '搬砖的一天', '摸鱼时刻', '来啦来啦', '又活了一天'
        ];
        const MESSAGES = [
            '今日签到', '继续搬砖', '混个脸熟', '求活跃度',
            '生活不易，猫猫叹气', '早安世界', '晚安前最后一篇',
            '日子平淡但温暖', '记录一下今日在线', '我只是个小透明'
        ];

        const title = TITLES[Math.floor(Math.random() * TITLES.length)];
        const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
        const postTime = Math.floor(Date.now() / 1000);

        const data = {
            'formhash': formhash,
            'posttime': postTime.toString(),
            'delete': '0',
            'topicsubmit': 'yes',
            'subject': title,
            'message': message,
            'replycredit_extcredits': '0',
            'replycredit_times': '1',
            'replycredit_membertimes': '1',
            'replycredit_random': '100',
            'tags': '',
            'price': '',
            'readperm': '',
            'cronpublishdate': '',
            'allownoticeauthor': '1',
            'usesig': '1'
        };

        const params = new URLSearchParams(data).toString();
        const url = 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140&extra=&topicsubmit=yes&mobile=2&handlekey=postform&inajax=1';

        try {
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; 23049RAD8C Build/TKQ1.221114.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.134 Mobile Safari/537.36',
                    'Accept': 'application/xml, text/xml, */*; q=0.01',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'sec-ch-ua-mobile': '?1',
                    'sec-ch-ua-platform': '"Android"',
                    'Origin': 'https://pc.sysbbs.com',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Dest': 'empty',
                    'Referer': 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                body: params
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();

            if (text.includes('succeed') && text.includes('location')) {
                const msg = `✅ 第${index + 1}/3 已发布：${title}`;
                createToast(msg, 'success');
                showStatus(msg);

                if (index < TRIPLE_POST_COUNT - 1) {
                    setTimeout(() => sendOnePostShadow(formhash, index + 1), 2000 + Math.random() * 1000);
                } else {
                    createToast('✨ 三帖全部完成！今日达标', 'success');
                    showStatus('🎉 三帖全部完成！今日达标 ✨', 'success');
                    localStorage.setItem('qwen_last_post_time', Date.now().toString());
                    setTimeout(() => {
                        createToast('🌙 晚安，你很棒。', 'info');
                        showStatus('🌙 晚安，你很棒。', 'info');
                    }, 2500);
                }
            } else {
                throw new Error('响应中无成功标志');
            }
        } catch (err) {
            const errorMsg = `⚠️ 第${index + 1} 失败：${err.message}，重试中...`;
            createToast(errorMsg, 'warn');
            showStatus(errorMsg, 'warn');

            setTimeout(() => sendOnePostShadow(formhash, index), 2500); // 重试当前篇
        }
    }

    function startTriplePost(formhash) {
        const lastPostTime = localStorage.getItem('qwen_last_post_time');
        const today = new Date().toDateString();

        if (lastPostTime && new Date(parseInt(lastPostTime)).toDateString() === today) {
            const msg = '💬 今日已活跃过啦～不必多劳';
            createToast(msg, 'info');
            showStatus(msg, 'info');
            return;
        }

        const msg = `🚀 正在发布第1/${TRIPLE_POST_COUNT}篇...`;
        createToast(msg, 'info');
        showStatus(msg, 'info');
        sendOnePostShadow(formhash, 0);
    }

    // ======================
    // 主流程启动
    // ======================
    window.addEventListener('load', async () => {
        if (!window.location.href.includes('sysbbs.com')) return;

        createDebugButton();
        createToast('🟢 脚本已启动，正在检测...', 'info');
        showStatus('🟢 脚本已启动，正在检测...');

        const formhash = tryGetFormhash();
        if (!formhash) {
            createToast('📝 请先访问【发新帖】页面一次', 'warn');
            showStatus('📝 请先访问【发新帖】页面一次', 'warn');
            setTimeout(() => {
                alert('🔔 提示：请先点击“发帖”进入发布页，让助手获取权限！');
            }, 1000);
            return;
        }

        createToast(`🔍 获取 formhash: ${formhash.slice(0,4)}...`, 'info');
        showStatus(`🔍 获取 formhash: ${formhash.slice(0,4)}...`, 'info');

        if (isAlreadySigned()) {
            createToast('📅 今日已签到', 'info');
            showStatus('📅 今日已签到', 'info');
            startTriplePost(formhash);
        } else {
            doSign(formhash);
        }
    });
})();

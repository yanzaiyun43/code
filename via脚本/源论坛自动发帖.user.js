// ==UserScript==
// @name         源论坛静默自动签到
// @version      1.0
// @description  不跳转页面，后台自动完成签到发帖
// @author       Qwen
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FID = 140; // 论坛分区 ID
    const POST_URL = `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}`;
    const CHECKIN_TITLES = [
        '【打卡】每日签到',
        '【打卡】每日签到',
        '【打卡】每日签到'
    ];

    // 获取北京时间日期字符串 YYYY-MM-DD
    function getBeijingDate() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        return now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
    }

    // 是否已签到
    function hasSignedToday() {
        return localStorage.getItem('sysbbs_last_sign_date') === getBeijingDate();
    }

    // 标记已签到
    function markAsSigned() {
        localStorage.setItem('sysbbs_last_sign_date', getBeijingDate());
    }

    // 显示 Toast（兼容安卓）
    function showToast(msg) {
        alert(`✅ 源论坛签到助手：${msg}`);
        console.log(`🎯 [签到助手] ${msg}`);
    }

    // 发送签到帖
    function sendCheckInPost(formhashValue, index) {
        const title = CHECKIN_TITLES[index];
        const message = `这是第 ${index + 1} 次自动签到帖，来自 Via 浏览器后台任务 🚀`;

        const data = {
            'formhash': formhashValue,
            'posttime': Math.floor(Date.now() / 1000),
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

        const xhr = new XMLHttpRequest();
        const url = POST_URL + '&extra=&mobile=2&handlekey=postform&inajax=1';

        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Origin', 'https://pc.sysbbs.com');
        xhr.setRequestHeader('Referer', POST_URL);

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    console.log(`第 ${index + 1} 次打卡签到`);
                    if (index < 2) {
                        setTimeout(() => sendCheckInPost(formhashValue, index + 1), 1500); // 间隔 1.5s
                    } else {
                        markAsSigned();
                        showToast('签到完成！共发布 3 条签到帖');
                    }
                } else {
                    console.error(`❌ 第 ${index + 1} 次发帖失败`, xhr.status, xhr.responseText);
                    showToast(`部分失败，状态码: ${xhr.status}`);
                }
            }
        };

        xhr.onerror = () => {
            console.error('📡 发帖请求出错');
            showToast('网络错误');
        };

        console.log('📤 正在发送:', title);
        xhr.send(Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&'));
    }

    // 创建隐藏 iframe 获取 formhash 并发帖
    function fetchFormHashAndPost() {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = POST_URL;

        iframe.onload = function () {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (input && input.value) {
                    console.log('✅ 成功从 iframe 获取 formhash:', input.value);
                    sendCheckInPost(input.value, 0); // 开始第一次发帖
                } else {
                    console.warn('⚠️ iframe 中未找到 formhash 元素');
                    showToast('获取 formhash 失败，请进入发帖页一次');
                }
            } catch (err) {
                console.error('🚫 跨域错误？', err);
                showToast('无法读取 iframe 内容（可能是安全策略）');
            }
            // 移除 iframe
            setTimeout(() => {
                if (iframe && iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
            }, 3000);
        };

        iframe.onerror = () => {
            console.error('❌ iframe 加载失败');
            showToast('加载发帖页失败');
        };

        document.body.appendChild(iframe);
    }

    // 主逻辑启动
    window.addEventListener('load', function () {
        if (hasSignedToday()) {
            console.log('ℹ️ 今日已签到，跳过');
            // showToast('已经签到，不再执行');
            return;
        }

        // 延迟一点确保页面稳定
        setTimeout(() => {
            console.log('🔍 开始尝试静默签到...');
            fetchFormHashAndPost();
        }, 1000);
    });

})();

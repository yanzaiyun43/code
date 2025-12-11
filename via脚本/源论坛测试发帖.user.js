// ==UserScript==
// @name         源论坛测试发帖脚本（修复版）
// @version      1.1
// @description  自动等待 formhash 出现后再发帖，提高成功率
// @author       Qwen
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function getBeijingTime() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    }

    function formatTime(date) {
        return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0') + ' ' +
            String(date.getHours()).padStart(2, '0') + ':' +
            String(date.getMinutes()).padStart(2, '0');
    }

    function getFormHash() {
        const input = document.querySelector('input[name="formhash"]');
        return input ? input.value : null;
    }

    function serialize(data) {
        return Object.keys(data)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
            .join('&');
    }

    function sendTestPost() {
        const now = getBeijingTime();
        const title = `[测试] 自动发帖成功 - ${formatTime(now)}`;
        const message = `这是 Via 浏览器自动签到测试帖 ✔\n当前时间：${formatTime(now)}\n设备：Via`;

        const data = {
            'formhash': 'a217dd31', // 兜底值（不推荐长期使用）
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

        const url = 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140&extra=&topicsubmit=yes&mobile=2&handlekey=postform&inajax=1';

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Origin', 'https://pc.sysbbs.com');
        xhr.setRequestHeader('Referer', 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140');

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log('🎉 成功响应片段:', xhr.responseText.substring(0, 150));
                    alert('✅ 发帖成功！查看新帖');
                } else {
                    console.error('❌ HTTP 错误:', xhr.status, xhr.statusText);
                    alert(`❌ 发帖失败，状态码: ${xhr.status}`);
                }
            }
        };

        xhr.onerror = function () {
            console.error('📡 网络请求失败（网络错误）');
            alert('❌ 网络错误，请检查连接');
        };

        xhr.send(serialize(data));
    }

    // ===== 核心改进：轮询等待 formhash =====
    function waitForFormHash(attempt = 1, maxAttempts = 10, interval = 300) {
        if (attempt > maxAttempts) {
            console.warn('⚠️ 尝试了 10 次仍未找到 formhash，使用默认值继续');
            alert('⚠️ 未找到 formhash，使用备用值发送（可能失败）');
            sendTestPost();
            return;
        }

        const hashInput = document.querySelector('input[name="formhash"]');
        if (hashInput && hashInput.value) {
            console.log(`✅ 第 ${attempt} 次尝试：成功获取 formhash =`, hashInput.value);
            sendTestPost();
        } else {
            console.log(`⏳ 第 ${attempt} 次尝试：未找到 formhash，${interval}ms 后重试...`);
            setTimeout(() => waitForFormHash(attempt + 1, maxAttempts, interval), interval);
        }
    }

    // 页面加载后开始轮询
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(waitForFormHash, 500); // 给 DOM 多一点时间
        });
    } else {
        setTimeout(waitForFormHash, 500);
    }

})();

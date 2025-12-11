// ==UserScript==
// @name         源论坛测试发帖脚本
// @version      1.0
// @description  进入页面立即发一个测试帖子，用于验证 formhash 和发帖流程是否正常
// @author       Qwen
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 获取北京时间作为时间戳
    function getBeijingTime() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    }

    // 格式化时间为 YYYY-MM-DD HH:MM
    function formatTime(date) {
        return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0') + ' ' +
            String(date.getHours()).padStart(2, '0') + ':' +
            String(date.getMinutes()).padStart(2, '0');
    }

    // 获取 formhash
    function getFormHash() {
        const input = document.querySelector('input[name="formhash"]');
        if (input) return input.value;
        console.warn('⚠️ 未找到 formhash 元素！');
        return 'a217dd31'; // fallback
    }

    // 序列化表单数据
    function serialize(data) {
        return Object.keys(data)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
            .join('&');
    }

    // 发送测试帖子
    function sendTestPost() {
        const now = getBeijingTime();
        const title = `[测试] 自动发帖成功 - ${formatTime(now)}`;
        const message = `这是 Via 浏览器自动签到测试帖，formhash 已获取 ✔\n当前时间：${formatTime(now)}\n设备：Via 浏览器`;

        const data = {
            'formhash': getFormHash(),
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
                    console.log('🎉 测试发帖成功！响应：', xhr.responseText.substring(0, 100));
                    alert('✅ 测试发帖成功！请查看论坛新帖');
                } else {
                    console.error('❌ 测试发帖失败，状态码：', xhr.status, xhr.statusText);
                    alert('❌ 发帖失败，检查控制台日志');
                }
            }
        };

        xhr.send(serialize(data));
    }

    // 页面加载完成后执行
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', sendTestPost);
    } else {
        setTimeout(sendTestPost, 500); // 稍等确保 DOM 加载
    }

})();

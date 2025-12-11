// ==UserScript==
// @name         源论坛智能签到（打开即检，防重复）
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  打开网页时自动检查：若≥9点且未签到，则执行3次签到（全天仅一次）
// @author       Qwen
// @match        https://pc.sysbbs.com/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js
// ==/UserScript==

(function () {
    'use strict';

    const SIGN_COUNT = 3;
    const INTERVAL_MS = 2500;
    const TARGET_HOUR = 9;

    // 获取北京时间（避免本地时区问题）
    function getBeijingTime() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    }

    // 获取 formhash（优先从页面读取）
    function getFormHash() {
        const input = document.querySelector('input[name="formhash"]');
        return input ? input.value : 'a217dd31'; // fallback to your value
    }

    // 单次签到
    function signOnce(index) {
        const now = Math.floor(Date.now() / 1000);
        const data = {
            'formhash': getFormHash(),
            'posttime': now,
            'delete': '0',
            'topicsubmit': 'yes',
            'subject': '签到',
            'message': `今日签到第${index}次`,
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

        const settings = {
            url: 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140&extra=&topicsubmit=yes&mobile=2&handlekey=postform&inajax=1',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'https://pc.sysbbs.com',
                'Referer': 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140',
            },
            data: $.param(data),
            dataType: 'text'
        };

        return $.ajax(settings);
    }

    // 执行3次签到
    async function doSignThreeTimes() {
        console.log('🚀 开始执行3次签到...');

        for (let i = 1; i <= SIGN_COUNT; i++) {
            try {
                await signOnce(i);
                console.log(`✅ 第 ${i} 次签到成功`);
                if (i < SIGN_COUNT) await new Promise(r => setTimeout(r, INTERVAL_MS));
            } catch (err) {
                console.error(`❌ 第 ${i} 次失败:`, err);
            }
        }

        // 标记今日已完成（使用 ISO 日期格式，如 "2025-12-11"）
        const today = getBeijingTime().toISOString().split('T')[0];
        localStorage.setItem('autoSignDoneDate', today);

        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("✅ 签到完成！", { body: "今日3次签到已提交 🎉" });
        }

        console.log('📌 今日签到任务已完成，不会重复执行');
    }

    // 主逻辑：每次页面加载时运行
    function checkAndSign() {
        const beijingNow = getBeijingTime();
        const todayISO = beijingNow.toISOString().split('T')[0]; // e.g. "2025-12-11"
        const lastDone = localStorage.getItem('autoSignDoneDate');

        const currentHour = beijingNow.getHours();

        // 如果今天已经签到过，直接退出
        if (lastDone === todayISO) {
            console.log('ℹ️ 今日签到已完成，跳过');
            return;
        }

        // 如果还没到9点，也跳过（可选：你可以改成随时都能签）
        if (currentHour < TARGET_HOUR) {
            console.log(`⏳ 未到 ${TARGET_HOUR}:00，暂不签到（当前北京时间 ${beijingNow.toLocaleTimeString()})`);
            return;
        }

        // 满足条件：≥9点 + 今日未签 → 执行
        console.log('🔔 检测到今日未签到且时间≥9点，即将执行签到...');
        
        // 加个小延迟，确保页面完全加载（尤其 formhash 可用）
        setTimeout(doSignThreeTimes, 1000);
    }

    // 请求通知权限
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    // 页面加载完成后执行检查
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndSign);
    } else {
        checkAndSign();
    }

})();

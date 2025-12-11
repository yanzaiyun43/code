// ==UserScript==
// @name         源论坛签到（Via 兼容版）
// @match        https://pc.sysbbs.com/*
// ==/UserScript==

(function () {
    'use strict';

    // 配置
    const SIGN_COUNT = 3;
    const INTERVAL_MS = 2500;
    const TARGET_HOUR = 9;

    // 获取北京时间
    function getBeijingTime() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    }

    // 从页面获取 formhash（优先）
    function getFormHash() {
        const input = document.querySelector('input[name="formhash"]');
        return input ? input.value : 'a217dd31';
    }

    // 序列化表单数据（替代 $.param）
    function serialize(data) {
        return Object.keys(data).map(key => 
            encodeURIComponent(key) + '=' + encodeURIComponent(data[key])
        ).join('&');
    }

    // 单次签到（使用原生 fetch）
    function signOnce(index) {
        const data = {
            'formhash': getFormHash(),
            'posttime': Math.floor(Date.now() / 1000),
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

        const url = 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140&extra=&topicsubmit=yes&mobile=2&handlekey=postform&inajax=1';

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://pc.sysbbs.com',
            'Referer': 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140',
        };

        return fetch(url, {
            method: 'POST',
            headers: headers,
            body: serialize(data),
            credentials: 'include' // 自动携带 Cookie！关键！
        });
    }

    // 执行3次签到
    async function doSignThreeTimes() {
        console.log('🚀 开始 Via 签到...');

        for (let i = 1; i <= SIGN_COUNT; i++) {
            try {
                const res = await signOnce(i);
                const text = await res.text();
                console.log(`✅ 第 ${i} 次签到响应:`, text.substring(0, 100));
                if (i < SIGN_COUNT) await new Promise(r => setTimeout(r, INTERVAL_MS));
            } catch (err) {
                console.error(`❌ 第 ${i} 次失败:`, err);
            }
        }

        // 标记今日已完成
        const today = getBeijingTime().toISOString().split('T')[0];
        localStorage.setItem('viaAutoSignDone', today);
        console.log('📌 Via 签到完成，今日已标记');
    }

    // 主检查逻辑
    function checkAndRun() {
        const now = getBeijingTime();
        const today = now.toISOString().split('T')[0];
        const lastDone = localStorage.getItem('viaAutoSignDone');
        const hour = now.getHours();

        if (lastDone === today) {
            console.log('ℹ️ Via: 今日已签到');
            return;
        }

        if (hour < TARGET_HOUR) {
            console.log(`⏳ Via: 未到 ${TARGET_HOUR} 点，当前 ${now.toLocaleTimeString()}`);
            return;
        }

        console.log('🔔 Via: 满足条件，即将签到...');
        // 稍等确保页面加载
        setTimeout(doSignThreeTimes, 1000);
    }

    // 页面加载后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndRun);
    } else {
        checkAndRun();
    }

})();

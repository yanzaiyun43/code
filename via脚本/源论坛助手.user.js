// ==UserScript==
// @name         SysBBS 随机治愈池（改写版）
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  改写原池子风格，每天随机抽3组轻松日常句发3帖
// @author       You
// @match        *://pc.sysbbs.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    /* ==================  改写后的治愈池  ================== */
    const TITLES = [
        '今日份小晴朗送达','摸鱼时间到','喝口水顺便看看大家','风很温柔我也很乖',
        '把忙碌调成静音','收集一点点开心','生活简单但够用','保持热爱奔赴山海',
        '小确幸正在加载','今日份温柔已上线','慢下来感受今天','把烦恼设为仅自己可见',
        '在平凡里找糖吃','阳光刚好心情刚好','记录片刻柔软','把日子过成诗',
        '清风明月皆可爱','心有繁花不负时光','温柔半两从容一生','日子很滚烫又暖又明亮'
    ];

    const MESSAGES = [
        '阳光落在窗台上，像给生活加了层滤镜，顺手来报个到～',
        '把忙碌调成静音，摸鱼五分钟，看看老朋友们在聊啥',
        '喝口温水，刷个页面，平凡的一天也需要仪式感',
        '风很温柔，我也很乖，顺路来留个脚印',
        '收集一点点开心，存进今天的记忆罐，再来冒个泡',
        '生活简单，但够用，偶尔出现，常常想念',
        '保持热爱，奔赴山海，哪怕只是先来签个到',
        '小确幸正在加载，请稍候……加载完成，我来啦',
        '慢下来，感受今天，顺便告诉大家我仍在',
        '把烦恼设为仅自己可见，把温柔留给每一次相见',
        '在平凡里找糖吃，找到就上来分享，找不到也报个平安',
        '阳光刚好，心情刚好，顺手敲几个字，证明我很好',
        '记录片刻柔软，留给日后回味，也留给论坛一个身影',
        '把日子过成诗，偶尔押不上韵，也不妨碍我出现',
        '清风明月皆可爱，我也一样，偶尔上线，常常挂念',
        '心有繁花，不负时光，哪怕只是说一句：我还在',
        '温柔半两，从容一生，闲来无事，过来逛逛',
        '日子很滚烫，又暖又明亮，我来加点小火花'
    ];

    const FID     = 140;
    const TODAY   = new Date().toLocaleDateString('zh-CN');
    const KEY_QD  = 'sysbbs_qd_' + TODAY;
    const KEY_TIE = 'sysbbs_tie_' + TODAY;

    /* ----------  单例 toast  ---------- */
    let msgBox = null;
    function toast(text, bg = '#333') {
        if (msgBox) msgBox.remove();
        msgBox = document.createElement('div');
        msgBox.style.cssText = `
            position:fixed;top:10px;right:10px;z-index:9999;
            padding:8px 14px;background:${bg};color:#fff;font-size:14px;
            border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,.3);
            transition:opacity .5s;
        `;
        msgBox.textContent = `[SysBBS] ${text}`;
        document.body.appendChild(msgBox);
        setTimeout(() => msgBox.style.opacity = '0', 2500);
        setTimeout(() => { if (msgBox) msgBox.remove(); }, 3000);
    }

    /* ----------  主流程（异步）  ---------- */
    (async () => {
        const formhash = document.documentElement.innerHTML.match(/formhash=([a-f0-9]{8})/i)?.[1];
        if (!formhash) { toast('提取 formhash 失败！', '#c00'); return; }

        // 1. 签到
        if (!GM_getValue(KEY_QD, false)) {
            toast('正在签到…');
            const ok = await qianDao(formhash);
            GM_setValue(KEY_QD, true);
            toast(ok ? '签到成功' : '签到失败（可能已签）', ok ? '#090' : '#f90');
        } else { toast('今日已签到'); }

        // 2. 随机抽 3 组（不重复）
        const sent = GM_getValue(KEY_TIE, 0);
        if (sent >= 3) { toast('今日 3 贴已完成'); return; }

        const pickedIndexes = randomPick(TITLES.length, 3);
        for (let i = sent; i < 3; i++) {
            const idx = pickedIndexes[i];
            const subject = TITLES[idx];
            const message = MESSAGES[idx];
            toast(`发第 ${i + 1} 帖：${subject}`);

            const data = {
                formhash: formhash,
                posttime: Math.floor(Date.now() / 1000),
                delete: 0,
                topicsubmit: 'yes',
                subject: subject,
                message: message,
                replycredit_extcredits: 0,
                replycredit_times: 1,
                replycredit_membertimes: 1,
                replycredit_random: 100,
                tags: '', price: '', readperm: '', cronpublishdate: '',
                allownoticeauthor: 1, usesig: 1
            };

            let ok = false;
            for (let tryNum = 0; tryNum < 3; tryNum++) {
                if (tryNum > 0) await sleep(2000);
                ok = await sendPost(data);
                if (ok) break;
            }
            if (!ok) { toast(`第 ${i + 1} 贴最终失败，终止`, '#c00'); return; }

            const now = i + 1;
            GM_setValue(KEY_TIE, now);
            toast(`第 ${now} 贴发送成功`, '#090');
            if (i < 2) { toast('等待 3 秒防 flood…'); await sleep(3000); }
        }
        toast('签到+随机三贴全部完成', '#090');
    })();

    /* ----------  工具函数  ---------- */
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function randomPick(max, n) {
        const arr = Array.from({ length: max }, (_, i) => i);
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr.slice(0, n);
    }

    async function qianDao(fh) {
        try {
            const res = await fetch(`https://pc.sysbbs.com/plugin.php?id=k_misign:sign&operation=qiandao&format=text&formhash=${fh}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'include'
            });
            const t = await res.text();
            return /thread-\d+|'tid':'\d+/.test(t) || t.includes('已签到');
        } catch (e) { console.error(e); return false; }
    }

    async function sendPost(data) {
        try {
            const res = await fetch(`https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}&extra=&topicsubmit=yes&mobile=2&handlekey=postform&inajax=1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                credentials: 'include',
                body: new URLSearchParams(data).toString()
            });
            const t = await res.text();
            return /thread-\d+|'tid':'\d+/.test(t);
        } catch (e) { console.error(e); return false; }
    }
})();

// ==UserScript==
// @name         源论坛助手
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  每天随机发3帖
// @author       ailmel
// @match        *://pc.sysbbs.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';
    const TITLES = [
  '来看看',
  '签到',
  '路过',
  '冒泡',
  '摸鱼',
  '划水',
  '打个卡',
  '报个到',
  '冒个泡',
  '刷个存在感',
  '看看大家',
  '顺便来一下',
  '来瞅瞅',
  '打个招呼',
  '日常签到'
];

const MESSAGES = [
  '来看看，顺便报个到。',
  '签到，证明我还在。',
  '路过，留个脚印。',
  '冒泡，看看大家。',
  '摸鱼中，勿扰。',
  '划水，顺便刷个页面。',
  '打个卡，证明我没消失。',
  '报个到，我还活着。',
  '冒个泡，看看大家在聊啥。',
  '刷个存在感，顺便摸鱼。',
  '看看大家，顺便来一下。',
  '顺便来一下，没什么事。',
  '来瞅瞅，大家还好吗。',
  '打个招呼，我还在。',
  '日常签到，证明我没跑路。'
];

    const FID     = 140;
    const TODAY   = new Date().toLocaleDateString('zh-CN');
    const KEY_QD  = 'sysbbs_qd_' + TODAY;
    const KEY_TIE = 'sysbbs_tie_' + TODAY;
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
        msgBox.textContent = `[源论坛助手] ${text}`;
        document.body.appendChild(msgBox);
        setTimeout(() => msgBox.style.opacity = '0', 2500);
        setTimeout(() => { if (msgBox) msgBox.remove(); }, 3000);
    }

    /* ----------  主流程 ---------- */
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

        // 2. 随机抽 3 组
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

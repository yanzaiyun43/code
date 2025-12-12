// ==UserScript==
// @name         SysBBS 签到+三贴（最终版 / 防误判）
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  每天 1 签到 3 发帖；帖间 3s 延迟；重试 2 次；tid 正则判定成功
// @author       You
// @match        *://pc.sysbbs.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    const SUBJECTS = ['签到', '打卡', '冒泡'];
    const MESSAGES = ['今日签到', '打卡打卡', '冒个泡~'];
    const FID      = 140;
    const TODAY    = new Date().toLocaleDateString('zh-CN');
    const KEY_QD   = 'sysbbs_qd_' + TODAY;
    const KEY_TIE  = 'sysbbs_tie_' + TODAY;

    /* ----------  单例消息条  ---------- */
    let msgBox = null;
    function showMsg(text, bg = '#333') {
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
        showMsg('脚本开始运行');

        const formhash = document.documentElement.innerHTML.match(/formhash=([a-f0-9]{8})/i)?.[1];
        if (!formhash) { showMsg('提取 formhash 失败！', '#c00'); return; }
        showMsg('formhash 已提取');

        // 1. 签到
        if (!GM_getValue(KEY_QD, false)) {
            showMsg('正在签到…');
            const qdOK = await qianDao(formhash);
            GM_setValue(KEY_QD, true);
            showMsg(qdOK ? '签到成功' : '签到失败（可能已签到）', qdOK ? '#090' : '#f90');
        } else { showMsg('今日已签到，跳过'); }

        // 2. 发帖
        let sent = GM_getValue(KEY_TIE, 0);
        if (sent >= 3) { showMsg('今日 3 贴已完成'); return; }

        for (let i = sent; i < 3; i++) {
            showMsg(`准备发第 ${i + 1} 贴…`);
            const data = {
                formhash: formhash,
                posttime: Math.floor(Date.now() / 1000),
                delete: 0,
                topicsubmit: 'yes',
                subject: SUBJECTS[i],
                message: MESSAGES[i],
                replycredit_extcredits: 0,
                replycredit_times: 1,
                replycredit_membertimes: 1,
                replycredit_random: 100,
                tags: '', price: '', readperm: '', cronpublishdate: '',
                allownoticeauthor: 1, usesig: 1
            };

            let ok = false;
            for (let tryNum = 0; tryNum < 3; tryNum++) {   // 最多 3 次
                if (tryNum > 0) await sleep(2000);
                ok = await sendPost(data);
                if (ok) break;
            }
            if (!ok) { showMsg(`第 ${i + 1} 贴最终失败，终止`, '#c00'); return; }

            sent++;
            GM_setValue(KEY_TIE, sent);
            showMsg(`第 ${sent} 贴发送成功`, '#090');

            if (i < 2) { showMsg('等待 3 秒防 flood…'); await sleep(3000); }
        }
        showMsg('签到+三贴全部完成', '#090');
    })();

    /* ----------  工具函数  ---------- */
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
            return /thread-\d+|'tid':'\d+/.test(t);   // 核心判断：出现 tid 就成功
        } catch (e) { console.error(e); return false; }
    }
})();

// ==UserScript==
// @name         SysBBS 签到+三贴（去叠加+真成功判断）
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  每天自动签到+发3帖；消息不叠加；正确识别发帖成功
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

    /* ----------  主流程  ---------- */
    showMsg('脚本开始运行');

    const formhash = document.documentElement.innerHTML.match(/formhash=([a-f0-9]{8})/i)?.[1];
    if (!formhash) { showMsg('提取 formhash 失败！', '#c00'); return; }
    showMsg('formhash 已提取');

    // 1. 签到（失败也继续）
    if (!GM_getValue(KEY_QD, false)) {
        showMsg('正在签到…');
        const qdOK = qianDao(formhash);
        GM_setValue(KEY_QD, true);          // 无论成功都标记已试
        showMsg(qdOK ? '签到成功' : '签到失败（可能已签到）', qdOK ? '#090' : '#f90');
    } else { showMsg('今日已签到，跳过'); }

    // 2. 发帖
    let sent = GM_getValue(KEY_TIE, 0);
    if (sent >= 3) { showMsg('今日 3 贴已完成'); return; }

    while (sent < 3) {
        showMsg(`正在发第 ${sent + 1} 贴…`);
        const data = {
            formhash: formhash,
            posttime: Math.floor(Date.now() / 1000),
            delete: 0,
            topicsubmit: 'yes',
            subject: SUBJECTS[sent],
            message: MESSAGES[sent],
            replycredit_extcredits: 0,
            replycredit_times: 1,
            replycredit_membertimes: 1,
            replycredit_random: 100,
            tags: '', price: '', readperm: '', cronpublishdate: '',
            allownoticeauthor: 1, usesig: 1
        };

        const ok = sendPost(data);
        if (!ok) { showMsg(`第 ${sent + 1} 贴发送失败，终止`, '#c00'); return; }
        sent++;
        GM_setValue(KEY_TIE, sent);
        showMsg(`第 ${sent} 贴发送成功`, '#090');
    }
    showMsg('签到+三贴全部完成', '#090');

    /* ----------  工具函数  ---------- */
    function qianDao(fh) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `https://pc.sysbbs.com/plugin.php?id=k_misign:sign&operation=qiandao&format=text&formhash=${fh}`, false);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.send();
            const r = xhr.responseText;
            return r.includes('已签到') || r.includes('succeed') || r.includes('成功');
        } catch (e) { console.error(e); return false; }
    }

    function sendPost(data) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}&extra=&topicsubmit=yes&mobile=2&handlekey=postform&inajax=1`, false);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.send(Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&'));
            const r = xhr.responseText;
            // 真成功标志
            return /succeed|thread|viewthread/.test(r) || r.includes('成功');
        } catch (e) { console.error(e); return false; }
    }
})();

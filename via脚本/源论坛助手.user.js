// ==UserScript==
// @name         源论坛助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  每天首次访问 pc.sysbbs.com 时自动签到并发 3 帖，formhash 自动提取
// @author       You
// @match        *://pc.sysbbs.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    /* ==========  配置区  ========== */
    const SUBJECTS = ['签到', '打卡', '冒泡'];
    const MESSAGES = ['今日签到', '打卡打卡', '冒个泡~'];
    const FID      = 140;
    /* ================================= */

    const TODAY   = new Date().toLocaleDateString('zh-CN');
    const KEY_QD  = 'sysbbs_qd_' + TODAY;
    const KEY_TIE = 'sysbbs_tie_' + TODAY;

    toast('[SysBBS] 脚本开始运行');

    // 提取 formhash
    const formhash = document.documentElement.innerHTML.match(/formhash=([a-f0-9]{8})/i)?.[1];
    if (!formhash) {
        toast('[SysBBS] 提取 formhash 失败，请确认已登录！');
        return;
    }
    toast('[SysBBS] 成功提取 formhash：' + formhash);

    // 1. 签到
    if (!GM_getValue(KEY_QD, false)) {
        toast('[SysBBS] 开始签到…');
        const qdOK = qianDao(formhash);
        if (qdOK) {
            GM_setValue(KEY_QD, true);
            toast('[SysBBS] 签到成功');
        } else {
            toast('[SysBBS] 签到失败，终止后续');
            return;
        }
    } else {
        toast('[SysBBS] 今日已签到，跳过');
    }

    // 2. 发帖
    let sent = GM_getValue(KEY_TIE, 0);
    if (sent >= 3) {
        toast('[SysBBS] 今日 3 贴已完成，脚本退出');
        return;
    }

    while (sent < 3) {
        toast(`[SysBBS] 准备发送第 ${sent + 1} 贴…`);
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
            tags: '',
            price: '',
            readperm: '',
            cronpublishdate: '',
            allownoticeauthor: 1,
            usesig: 1
        };

        const ok = sendPost(data);
        if (!ok) {
            toast(`[SysBBS] 第 ${sent + 1} 贴发送失败，终止后续`);
            return;
        }
        sent++;
        GM_setValue(KEY_TIE, sent);
        toast(`[SysBBS] 第 ${sent} 贴发送成功`);
    }

    toast('[SysBBS] 签到+三贴全部完成');

    /* ==========  工具函数  ========== */
    function qianDao(formhash) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET',
                `https://pc.sysbbs.com/plugin.php?id=k_misign:sign&operation=qiandao&format=text&formhash=${formhash}`,
                false);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.send();
            return xhr.responseText.includes('已签到') || xhr.responseText.includes('成功');
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    function sendPost(data) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST',
                `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}&extra=&topicsubmit=yes&mobile=2&handlekey=postform&inajax=1`,
                false);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.send(Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&'));
            return xhr.responseText.includes('thread') || xhr.responseText.includes('成功');
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    function toast(msg) {
        if (window.JavaScriptInterface) {
            window.JavaScriptInterface.showToast(msg);
        } else {
            console.log(msg);
        }
    }
})();

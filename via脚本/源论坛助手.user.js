// ==UserScript==
// @name         源论坛助手
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  源论坛获取经验
// @author       ailmel
// @match        *://pc.sysbbs.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';
    
    const TITLES = [
        '来看看', '签到', '路过', '冒泡', '摸鱼', '划水',
        '打个卡', '报个到', '冒个泡', '刷个存在感', '看看大家',
        '顺便来一下', '来瞅瞅', '打个招呼', '日常签到'
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

    const FID = 140;
    const TODAY = new Date().toLocaleDateString('zh-CN');
    const KEY_QD = 'sysbbs_qd_' + TODAY;
    const KEY_TIE = 'sysbbs_tie_' + TODAY;
    const KEY_EXP = 'sysbbs_exp_' + TODAY;
    const KEY_FIRST_VISIT = 'sysbbs_first_' + TODAY;
    const KEY_CLOSED = 'sysbbs_closed_' + TODAY;
    
    let msgBox = null;
    let modal = null;
    let progressBar = null;
    let progressText = null;
    let currentStep = 0;
    const totalSteps = 9; // 1签到+5经验+3发帖

    // 创建进度条
    function createProgressBar() {
        const container = document.createElement('div');
        container.id = 'sysbbs-progress';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 60px;
            background: #fff;
            z-index: 99999;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 0 20px;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        
        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 14px;
            font-weight: bold;
            color: #333;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
        `;
        title.innerHTML = '<span>[源论坛助手] 正在执行每日任务...</span><span id="sysbbs-progress-percent">0%</span>';
        
        const barContainer = document.createElement('div');
        barContainer.style.cssText = `
            width: 100%;
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
        `;
        
        const bar = document.createElement('div');
        bar.id = 'sysbbs-progress-bar';
        bar.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            transition: width 0.3s ease;
            border-radius: 4px;
        `;
        
        const text = document.createElement('div');
        text.id = 'sysbbs-progress-text';
        text.style.cssText = `
            font-size: 12px;
            color: #666;
            margin-top: 6px;
        `;
        text.textContent = '初始化中...';
        
        barContainer.appendChild(bar);
        container.appendChild(title);
        container.appendChild(barContainer);
        container.appendChild(text);
        document.body.appendChild(container);
        
        progressBar = bar;
        progressText = text;
        
        // 调整页面内容，避免被进度条遮挡
        document.body.style.paddingTop = '60px';
    }

    // 更新进度条
    function updateProgress(stepDescription) {
        currentStep++;
        const percent = Math.min(Math.round((currentStep / totalSteps) * 100), 100);
        
        if (progressBar) {
            progressBar.style.width = percent + '%';
        }
        if (progressText) {
            progressText.textContent = `步骤 ${currentStep}/${totalSteps}: ${stepDescription}`;
        }
        const percentEl = document.getElementById('sysbbs-progress-percent');
        if (percentEl) {
            percentEl.textContent = percent + '%';
        }
        
        console.log(`[源论坛助手] ${stepDescription} (${percent}%)`);
    }

    // 隐藏进度条
    function hideProgressBar() {
        const bar = document.getElementById('sysbbs-progress');
        if (bar) {
            bar.style.transition = 'opacity 0.5s';
            bar.style.opacity = '0';
            setTimeout(() => {
                bar.remove();
                document.body.style.paddingTop = '0';
            }, 500);
        }
    }

    // 创建可关闭的模态弹窗
    function createModal(content) {
        if (modal) modal.remove();
        
        modal = document.createElement('div');
        modal.id = 'sysbbs-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 100000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const box = document.createElement('div');
        box.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            max-width: 450px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
        `;
        
        const title = document.createElement('h3');
        title.textContent = '[源论坛助手] 每日任务完成报告';
        title.style.cssText = 'margin: 0; color: #333; font-size: 16px;';
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: #ff4444;
            color: white;
            border: none;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
        `;
        closeBtn.onclick = () => {
            modal.remove();
            GM_setValue(KEY_CLOSED, true);
        };
        
        header.appendChild(title);
        header.appendChild(closeBtn);
        
        const body = document.createElement('div');
        body.innerHTML = content;
        body.style.cssText = 'line-height: 1.6; color: #666; font-size: 14px;';
        
        const footer = document.createElement('div');
        footer.style.cssText = `
            margin-top: 15px;
            text-align: center;
            font-size: 12px;
            color: #999;
            border-top: 1px solid #eee;
            padding-top: 10px;
        `;
        footer.textContent = '✓ 今天不再显示此窗口，可在油猴菜单手动查看';
        
        box.appendChild(header);
        box.appendChild(body);
        box.appendChild(footer);
        modal.appendChild(box);
        document.body.appendChild(modal);
        
        // 点击背景关闭
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                GM_setValue(KEY_CLOSED, true);
            }
        };
    }

    // 简单的toast提示
    function toast(text, bg = '#333') {
        if (msgBox) msgBox.remove();
        msgBox = document.createElement('div');
        msgBox.style.cssText = `
            position: fixed;
            top: 70px;
            right: 10px;
            z-index: 99999;
            padding: 10px 16px;
            background: ${bg};
            color: #fff;
            font-size: 14px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,.2);
            transition: opacity .5s;
            max-width: 300px;
        `;
        msgBox.textContent = text;
        document.body.appendChild(msgBox);
        setTimeout(() => msgBox.style.opacity = '0', 3000);
        setTimeout(() => { if (msgBox) msgBox.remove(); }, 3500);
    }

    // 生成随机UID (1000-20000)
    function getRandomUID() {
        return Math.floor(Math.random() * (20000 - 1000 + 1)) + 1000;
    }

    // 访问用户空间获取经验
    async function visitUserSpace() {
        const visitedCount = GM_getValue(KEY_EXP, 0);
        if (visitedCount >= 5) {
            return { success: false, message: '今日经验获取已达上限(5次)', count: visitedCount };
        }
        
        const uid = getRandomUID();
        try {
            const res = await fetch(`https://pc.sysbbs.com/home.php?mod=space&uid=${uid}&do=profile`, {
                credentials: 'include'
            });
            
            if (res.ok) {
                const newCount = visitedCount + 1;
                GM_setValue(KEY_EXP, newCount);
                return { 
                    success: true, 
                    uid: uid,
                    count: newCount,
                    message: `访问UID:${uid}成功 (${newCount}/5)`
                };
            }
            return { success: false, message: '访问失败', count: visitedCount };
        } catch (e) {
            return { success: false, message: '网络错误', count: visitedCount };
        }
    }

    // 主流程
    (async () => {
        const formhash = document.documentElement.innerHTML.match(/formhash=([a-f0-9]{8})/i)?.[1];
        if (!formhash) { 
            toast('提取 formhash 失败！', '#c00'); 
            return; 
        }

        const isFirstVisit = !GM_getValue(KEY_FIRST_VISIT, false);
        const isClosed = GM_getValue(KEY_CLOSED, false);
        
        // 记录今日首次访问
        if (isFirstVisit) {
            GM_setValue(KEY_FIRST_VISIT, true);
        }

        // 创建进度条（仅在首次访问时显示）
        if (isFirstVisit && !isClosed) {
            createProgressBar();
        }

        let logContent = '';
        const addLog = (msg, status = '') => {
            const color = status === 'success' ? '#090' : status === 'warning' ? '#f90' : status === 'error' ? '#c00' : '#333';
            const icon = status === 'success' ? '✓' : status === 'warning' ? '⚠' : status === 'error' ? '✗' : '•';
            logContent += `<div style="margin: 6px 0; color: ${color};">${icon} ${msg}</div>`;
        };

        // 1. 签到
        updateProgress('检查签到状态');
        let qdResult = '';
        if (!GM_getValue(KEY_QD, false)) {
            updateProgress('正在执行签到');
            const ok = await qianDao(formhash);
            GM_setValue(KEY_QD, true);
            qdResult = ok ? '签到成功' : '签到失败（可能已签）';
            addLog(qdResult, ok ? 'success' : 'warning');
        } else {
            qdResult = '今日已签到';
            addLog(qdResult, 'success');
        }

        // 2. 访问用户空间获取经验 (前5次)
        addLog('<br><strong>🎯 获取空间经验 (每天前5次访问+2经验):</strong>');
        const expCount = GM_getValue(KEY_EXP, 0);
        if (expCount >= 5) {
            updateProgress('经验获取已完成');
            addLog('今日经验获取已完成 (5/5)', 'success');
        } else {
            for (let i = expCount; i < 5; i++) {
                updateProgress(`正在访问用户空间 (${i+1}/5)`);
                const result = await visitUserSpace();
                if (result.success) {
                    addLog(`${result.message}`, 'success');
                    await sleep(1000);
                } else {
                    addLog(`${result.message}`, 'warning');
                    break;
                }
            }
        }

        // 3. 随机发3帖
        addLog('<br><strong>📝 自动发帖:</strong>');
        const sent = GM_getValue(KEY_TIE, 0);
        if (sent >= 3) {
            updateProgress('发帖任务已完成');
            addLog('今日发帖已完成 (3/3)', 'success');
        } else {
            const pickedIndexes = randomPick(TITLES.length, 3);
            for (let i = sent; i < 3; i++) {
                const idx = pickedIndexes[i];
                const subject = TITLES[idx];
                const message = MESSAGES[idx];
                
                updateProgress(`正在发送第 ${i + 1} 帖`);
                
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
                    if (tryNum > 0) {
                        updateProgress(`第 ${i+1} 帖重试中 (${tryNum}/3)`);
                        await sleep(2000);
                    }
                    ok = await sendPost(data);
                    if (ok) break;
                }
                
                if (ok) {
                    const now = i + 1;
                    GM_setValue(KEY_TIE, now);
                    addLog(`第 ${now} 帖《${subject}》发送成功`, 'success');
                    if (i < 2) {
                        updateProgress('等待防flood冷却');
                        await sleep(3000);
                    }
                } else {
                    addLog(`第 ${i + 1} 贴最终失败，终止`, 'error');
                    break;
                }
            }
        }

        updateProgress('所有任务完成');
        addLog('<br><strong>🎉 全部任务执行完毕！</strong>', 'success');

        // 延迟隐藏进度条，显示结果
        setTimeout(() => {
            hideProgressBar();
            
            // 显示结果弹窗
            if (isFirstVisit && !isClosed) {
                createModal(logContent);
            } else {
                toast('✓ 每日任务已完成', '#090');
            }
        }, 800);
    })();

    // 注册油猴菜单命令
    GM_registerMenuCommand('📋 查看今日任务日志', () => {
        const qd = GM_getValue(KEY_QD, false) ? '✓ 已签到' : '✗ 未签到';
        const exp = GM_getValue(KEY_EXP, 0);
        const tie = GM_getValue(KEY_TIE, 0);
        
        const content = `
            <div style="padding: 10px;">
                <p><strong>📊 今日任务状态:</strong></p>
                <div style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
                    <p>📝 签到状态: <strong>${qd}</strong></p>
                    <p>🎯 空间经验: <strong>${exp}/5</strong> 次 (可获 ${Math.min(exp, 5) * 2} 经验)</p>
                    <p>💬 自动发帖: <strong>${tie}/3</strong> 帖</p>
                </div>
                <p style="margin-top: 15px; color: #666; font-size: 12px; line-height: 1.5;">
                    💡 提示: 每天首次访问论坛时会自动显示详细进度窗口。<br>
                    进度条会实时显示任务执行状态，请耐心等待所有步骤完成。
                </p>
            </div>
        `;
        createModal(content);
    });

    /* ----------  工具函数  ---------- */
    function sleep(ms) { 
        return new Promise(r => setTimeout(r, ms)); 
    }

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
        } catch (e) { 
            console.error(e); 
            return false; 
        }
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
        } catch (e) { 
            console.error(e); 
            return false; 
        }
    }
})();

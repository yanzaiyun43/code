// ==UserScript==
// @name         5-10min随机刷新+计数器（仅bbs站点）
// @include      /^https?:\/\/([^\/]*\.)?[^\/]*bbs[^\/]*\./
// @grant        none
// ==/UserScript==

(function() {
    /* ========== 配置区 ========== */
    const MIN = 5;                // 最小分钟
    const MAX = 10;               // 最大分钟
    const KEY = 'via_reload_cnt_bbs'; // localStorage 键
    /* ============================ */

    /* -------------- 工具函数 -------------- */
    const getToday = () => new Date().toLocaleDateString('zh-CN');

    const loadCnt = () => {
        try {
            const {date, cnt} = JSON.parse(localStorage.getItem(KEY) || '{}');
            return date === getToday() ? cnt : 0;
        } catch { return 0; }
    };

    const saveCnt = cnt =>
        localStorage.setItem(KEY, JSON.stringify({date: getToday(), cnt}));

    /* -------------- 创建浮动按钮 -------------- */
    const createBtn = () => {
        const div = document.createElement('div');
        div.id = 'reload-counter';
        div.innerHTML = `今日刷新：<span>${loadCnt()}</span> 次`;
        Object.assign(div.style, {
            position: 'fixed',
            top: '12px',
            right: '12px',
            zIndex: 99999,
            background: 'rgba(0,0,0,.55)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '13px',
            userSelect: 'none',
            boxShadow: '0 2px 6px rgba(0,0,0,.3)'
        });
        document.documentElement.appendChild(div);
        return div;
    };

    /* -------------- 主逻辑 -------------- */
    const btn = createBtn();
    let cnt = loadCnt();
    const span = btn.querySelector('span');

    const refreshDisplay = () => { span.textContent = cnt; saveCnt(cnt); };

    const scheduleReload = () => {
        const ms = (MIN + Math.random() * (MAX - MIN)) * 60 * 1000;
        setTimeout(() => {
            cnt++;
            refreshDisplay();
            location.reload();
        }, ms);
    };

    refreshDisplay();
    scheduleReload();
})();

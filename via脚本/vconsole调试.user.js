// ==UserScript==
// @name         VConsole开关控制
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  手动开关控制注入VConsole调试工具
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 创建开关按钮样式
    const btnStyle = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        padding: 8px 12px;
        background: #409eff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        opacity: 0.8;
        transition: opacity 0.2s;
    `;

    // 创建开关按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.style = btnStyle;
    toggleBtn.textContent = '开启VConsole';
    toggleBtn.id = 'vconsole-toggle';
    document.body.appendChild(toggleBtn);

    let vConsoleInstance = null;

    // 按钮点击事件
    toggleBtn.addEventListener('click', function() {
        if (!vConsoleInstance) {
            // 加载VConsole脚本并初始化
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/vconsole@latest/dist/vconsole.min.js';
            script.onload = function() {
                vConsoleInstance = new window.VConsole();
                toggleBtn.textContent = '关闭VConsole';
                toggleBtn.style.background = '#f56c6c';
            };
            document.head.appendChild(script);
        } else {
            // 销毁VConsole实例
            vConsoleInstance.destroy();
            vConsoleInstance = null;
            toggleBtn.textContent = '开启VConsole';
            toggleBtn.style.background = '#409eff';
        }
    });
})();

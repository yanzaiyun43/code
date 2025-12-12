// ==UserScript==
// @name         VConsole中文面板开关
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  注入带中文界面的VConsole，支持手动开关
// @author       自定义
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 开关按钮样式
    const 按钮样式 = `
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
    const 开关按钮 = document.createElement('button');
    开关按钮.style = 按钮样式;
    开关按钮.textContent = '开启调试面板';
    document.body.appendChild(开关按钮);

    let 调试面板实例 = null;

    // 加载中文语言包并初始化VConsole
    function 加载中文VConsole() {
        // 先加载VConsole主脚本
        const vConsoleScript = document.createElement('script');
        vConsoleScript.src = 'https://unpkg.com/vconsole@latest/dist/vconsole.min.js';
        vConsoleScript.onload = function() {
            // 再加载中文语言包
            const langScript = document.createElement('script');
            langScript.src = 'https://unpkg.com/vconsole@latest/dist/lang/zh-CN.js';
            langScript.onload = function() {
                // 初始化并指定中文语言
                调试面板实例 = new window.VConsole({
                    lang: 'zh-CN' // 设置为中文
                });
                开关按钮.textContent = '关闭调试面板';
                开关按钮.style.background = '#f56c6c';
            };
            document.head.appendChild(langScript);
        };
        document.head.appendChild(vConsoleScript);
    }

    // 按钮点击事件
    开关按钮.addEventListener('click', function() {
        if (!调试面板实例) {
            加载中文VConsole();
        } else {
            调试面板实例.destroy();
            调试面板实例 = null;
            开关按钮.textContent = '开启调试面板';
            开关按钮.style.background = '#409eff';
        }
    });
})();

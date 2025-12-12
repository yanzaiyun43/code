// ==UserScript==
// @name         VConsole中文面板开关（修复版）
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  注入带中文界面的VConsole，修复点击无反应问题，带加载/错误提示
// @author       自定义
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 开关按钮样式
    const btnStyle = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        padding: 10px 16px;
        background: #409eff;
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        opacity: 0.9;
        transition: all 0.3s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;

    // 提示框样式
    const tipStyle = `
        position: fixed;
        top: 70px;
        right: 20px;
        z-index: 99999;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        color: #fff;
        display: none;
    `;

    // 创建提示框（加载/错误）
    const tipBox = document.createElement('div');
    tipBox.style = tipStyle;
    document.body.appendChild(tipBox);

    // 创建开关按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.style = btnStyle;
    toggleBtn.textContent = '开启调试面板';
    document.body.appendChild(toggleBtn);

    let vConsoleInstance = null;
    let isLoading = false; // 防止重复点击加载

    // 显示提示
    function showTip(text, isError = false) {
        tipBox.textContent = text;
        tipBox.style.background = isError ? '#f56c6c' : '#67c23a';
        tipBox.style.display = 'block';
        setTimeout(() => {
            tipBox.style.display = 'none';
        }, 2000);
    }

    // 加载中文VConsole
    function loadVConsole() {
        if (isLoading) return;
        isLoading = true;
        showTip('正在加载调试面板...');

        // 加载VConsole主库
        const vConsoleScript = document.createElement('script');
        vConsoleScript.src = 'https://cdn.jsdelivr.net/npm/vconsole@3.15.0/dist/vconsole.min.js';
        vConsoleScript.crossOrigin = 'anonymous'; // 解决跨域问题

        vConsoleScript.onload = function() {
            // 加载中文语言包
            const langScript = document.createElement('script');
            langScript.src = 'https://cdn.jsdelivr.net/npm/vconsole@3.15.0/dist/lang/zh-CN.js';
            langScript.crossOrigin = 'anonymous';

            langScript.onload = function() {
                vConsoleInstance = new window.VConsole({ lang: 'zh-CN' });
                toggleBtn.textContent = '关闭调试面板';
                toggleBtn.style.background = '#f56c6c';
                showTip('调试面板加载成功');
                isLoading = false;
            };

            langScript.onerror = function() {
                showTip('语言包加载失败', true);
                isLoading = false;
            };

            document.head.appendChild(langScript);
        };

        vConsoleScript.onerror = function() {
            showTip('VConsole主库加载失败', true);
            isLoading = false;
        };

        document.head.appendChild(vConsoleScript);
    }

    // 按钮点击事件
    toggleBtn.addEventListener('click', function() {
        if (!vConsoleInstance) {
            loadVConsole();
        } else {
            vConsoleInstance.destroy();
            vConsoleInstance = null;
            toggleBtn.textContent = '开启调试面板';
            toggleBtn.style.background = '#409eff';
            showTip('调试面板已关闭');
        }
    });
})();

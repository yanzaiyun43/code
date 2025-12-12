// ==UserScript==
// @name         VConsole中文面板开关（内置语言包版）
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  内置中文语言包，解决加载失败问题，带状态提示
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

    // 创建提示框
    const tipBox = document.createElement('div');
    tipBox.style = tipStyle;
    document.body.appendChild(tipBox);

    // 创建开关按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.style = btnStyle;
    toggleBtn.textContent = '开启调试面板';
    document.body.appendChild(toggleBtn);

    let vConsoleInstance = null;
    let isLoading = false;

    // 显示提示
    function showTip(text, isError = false) {
        tipBox.textContent = text;
        tipBox.style.background = isError ? '#f56c6c' : '#67c23a';
        tipBox.style.display = 'block';
        setTimeout(() => tipBox.style.display = 'none', 2000);
    }

    // 内置VConsole中文语言包（核心：直接注入语言配置）
    function injectChineseLang() {
        window.VConsoleLang_zh_CN = {
            log: '日志',
            log_default: '默认',
            log_info: '信息',
            log_debug: '调试',
            log_warn: '警告',
            log_error: '错误',
            network: '网络',
            network_all: '全部',
            network_fetch: 'Fetch',
            network_xhr: 'XHR',
            network_script: '脚本',
            network_style: '样式',
            network_image: '图片',
            network_media: '媒体',
            network_other: '其他',
            network_method: '方法',
            network_url: '地址',
            network_status: '状态码',
            network_time: '耗时',
            network_size: '大小',
            network_request: '请求',
            network_response: '响应',
            element: '元素',
            element_html: 'HTML',
            element_css: 'CSS',
            element_box: '盒模型',
            storage: '存储',
            storage_cookie: 'Cookie',
            storage_localstorage: '本地存储',
            storage_sessionstorage: '会话存储',
            storage_key: '键',
            storage_value: '值',
            storage_expires: '过期时间',
            system: '系统',
            system_ua: '用户代理',
            system_url: '页面地址',
            system_title: '页面标题',
            system_viewport: '视口大小',
            system_screen: '屏幕大小',
            system_location: '位置信息',
            system_network: '网络状态',
            tools: '工具',
            tools_clear: '清空',
            tools_refresh: '刷新',
            tools_close: '关闭',
            tools_collapse: '收起',
            tools_expand: '展开',
            tools_search: '搜索',
            tools_filter: '筛选',
            tools_export: '导出',
            tools_import: '导入'
        };
    }

    // 加载VConsole主库并初始化
    function loadVConsole() {
        if (isLoading) return;
        isLoading = true;
        showTip('正在加载调试面板...');

        // 注入中文语言包（先于主库执行）
        injectChineseLang();

        const vConsoleScript = document.createElement('script');
        // 改用稳定的jsDelivr CDN
        vConsoleScript.src = 'https://cdn.jsdelivr.net/npm/vconsole@3.15.0/dist/vconsole.min.js';
        vConsoleScript.crossOrigin = 'anonymous';

        vConsoleScript.onload = function() {
            // 初始化时指定中文语言
            vConsoleInstance = new window.VConsole({
                lang: 'zh-CN',
                // 强制使用内置语言包
                defaultLang: 'zh-CN'
            });
            toggleBtn.textContent = '关闭调试面板';
            toggleBtn.style.background = '#f56c6c';
            showTip('调试面板加载成功');
            isLoading = false;
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

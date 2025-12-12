// ==UserScript==
// @name         VConsole中文面板（刷新不丢日志+纯中文界面）
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  内置中文语言包，刷新保留日志，强制中文界面
// @author       自定义
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const btnStyle = `position: fixed; top: 20px; right: 20px; z-index: 99999; padding: 10px 16px; background: #409eff; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; opacity: 0.9; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.15);`;
    const tipStyle = `position: fixed; top: 70px; right: 20px; z-index: 99999; padding: 8px 12px; border-radius: 4px; font-size: 12px; color: #fff; display: none;`;

    const tipBox = document.createElement('div');
    tipBox.style = tipStyle;
    document.body.appendChild(tipBox);

    const toggleBtn = document.createElement('button');
    toggleBtn.style = btnStyle;
    document.body.appendChild(toggleBtn);

    const STORAGE_KEY = 'vconsole_persist';
    let vConsoleInstance = null;
    let isLoading = false;

    function showTip(text, isError = false) {
        tipBox.textContent = text;
        tipBox.style.background = isError ? '#f56c6c' : '#67c23a';
        tipBox.style.display = 'block';
        setTimeout(() => tipBox.style.display = 'none', 2000);
    }

    // ========== 关键修复：手动挂载中文语言包 ==========
    function injectChineseLang() {
        // 1. 定义完整中文语言配置
        const zhLang = {
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
        // 2. 强制挂载到 window，让 VConsole 能直接读取
        window.VConsole = window.VConsole || {};
        window.VConsole.lang = window.VConsole.lang || {};
        window.VConsole.lang['zh-CN'] = zhLang;
        // 3. 设置全局默认语言
        window.VConsole.defaultLang = 'zh-CN';
    }

    function persistConsoleLogs() {
        const nativeConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
        ['log', 'warn', 'error', 'info', 'debug'].forEach(type => {
            console[type] = function(...args) {
                nativeConsole[type].apply(console, args);
                const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"logs":[],"isOpen":false}');
                logs.logs.push({ type, message: args.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(' '), timestamp: new Date().toLocaleString() });
                if (logs.logs.length > 100) logs.logs.shift();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
            };
        });
    }

    function loadVConsole(restoreLogs = true) {
        if (isLoading) return;
        isLoading = true;
        showTip('正在加载调试面板...');

        // 先注入语言包，再加载主库（顺序不能反）
        injectChineseLang();
        persistConsoleLogs();

        const vConsoleScript = document.createElement('script');
        vConsoleScript.src = 'https://cdn.jsdelivr.net/npm/vconsole@3.15.0/dist/vconsole.min.js';
        vConsoleScript.crossOrigin = 'anonymous';

        vConsoleScript.onload = function() {
            // 初始化时双重强制指定中文
            vConsoleInstance = new window.VConsole({
                lang: 'zh-CN',
                defaultLang: 'zh-CN'
            });

            if (restoreLogs) {
                const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"logs":[],"isOpen":false}');
                logs.logs.forEach(log => {
                    if (console[log.type]) console[log.type](`[${log.timestamp}] 历史日志:`, log.message);
                });
                if (logs.logs.length > 0) showTip(`已恢复${logs.logs.length}条历史日志`);
            }

            toggleBtn.textContent = '关闭调试面板';
            toggleBtn.style.background = '#f56c6c';
            showTip('调试面板加载成功（纯中文）');
            isLoading = false;

            const storageData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"logs":[],"isOpen":false}');
            storageData.isOpen = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
        };

        vConsoleScript.onerror = function() {
            showTip('VConsole主库加载失败', true);
            isLoading = false;
        };

        document.head.appendChild(vConsoleScript);
    }

    function closeVConsole() {
        if (vConsoleInstance) {
            vConsoleInstance.destroy();
            vConsoleInstance = null;
            toggleBtn.textContent = '开启调试面板';
            toggleBtn.style.background = '#409eff';
            showTip('调试面板已关闭');
            const storageData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"logs":[],"isOpen":false}');
            storageData.isOpen = false;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
        }
    }

    window.addEventListener('load', function() {
        const storageData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"logs":[],"isOpen":false}');
        if (storageData.isOpen) {
            loadVConsole();
        } else {
            toggleBtn.textContent = '开启调试面板';
            persistConsoleLogs();
        }
    });

    toggleBtn.addEventListener('click', function() {
        if (!vConsoleInstance) loadVConsole();
        else closeVConsole();
    });

    window.clearVConsoleLogs = function() {
        const storageData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"logs":[],"isOpen":false}');
        storageData.logs = [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
        showTip('历史日志已清空');
    };
})();

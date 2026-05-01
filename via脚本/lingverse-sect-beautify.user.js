// ==UserScript==
// @name         灵界宗门极简轻奢美化
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  宗门模块全面美化，自动跟随游戏主题，优化排版和交互
// @author       You
// @match        *://*/game.html*
// @match        *://*/lingverse*/game.html*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 防止重复初始化
    if (window.__sectBeautifyLoaded) return;
    window.__sectBeautifyLoaded = true;

    // 获取游戏当前主题
    function getGameTheme() {
        try {
            const html = document.documentElement;
            if (html && html.classList) {
                if (html.classList.contains('theme-dark')) return 'dark';
                if (html.classList.contains('theme-light')) return 'light';
            }
            // 默认检测
            if (document.body) {
                const bg = getComputedStyle(document.body).backgroundColor;
                if (bg && (bg.includes('10') || bg.includes('0, 0, 0') || bg.includes('11'))) return 'dark';
            }
        } catch (e) {
            // 出错时返回深色主题作为默认
        }
        return 'dark';
    }

    // 监听主题变化 - 使用被动方式避免冲突
    let lastTheme = null;
    function watchThemeChange() {
        try {
            // 使用 requestAnimationFrame 轮询检查主题变化，避免 MutationObserver 冲突
            function checkTheme() {
                const currentTheme = getGameTheme();
                if (currentTheme !== lastTheme) {
                    lastTheme = currentTheme;
                    applyThemeStyles();
                }
                requestAnimationFrame(checkTheme);
            }
            // 每秒检查一次主题变化（降低频率减少冲突）
            setInterval(() => {
                const currentTheme = getGameTheme();
                if (currentTheme !== lastTheme) {
                    lastTheme = currentTheme;
                    applyThemeStyles();
                }
            }, 1000);
        } catch (e) {
            console.log('[宗门美化] 主题监听失败:', e);
        }
    }

    // 生成样式
    function generateStyles() {
        const isDark = getGameTheme() === 'dark';
        
        // 基础颜色配置
        const colors = isDark ? {
            // 深色主题
            bg: '#0a0f1c',
            bgSecondary: '#111827',
            bgCard: '#151d2e',
            bgHover: '#1a2540',
            bgInput: '#0e1525',
            border: 'rgba(201, 153, 58, 0.15)',
            borderGold: 'rgba(201, 153, 58, 0.3)',
            text: '#e8e0d0',
            textSecondary: '#a8a090',
            textMuted: '#6a6560',
            accent: '#c9993a',
            accentLight: '#e0b050',
            danger: '#e06060',
            success: '#3dab97',
            shadow: '0 4px 20px rgba(0,0,0,0.4)',
            shadowSm: '0 2px 8px rgba(0,0,0,0.3)',
        } : {
            // 浅色主题
            bg: '#f8f7f5',
            bgSecondary: '#f0efed',
            bgCard: '#ffffff',
            bgHover: '#e8e7e5',
            bgInput: '#faf9f8',
            border: 'rgba(60, 60, 60, 0.1)',
            borderGold: 'rgba(140, 60, 50, 0.2)',
            text: '#1a1a1a',
            textSecondary: '#4a5a5a',
            textMuted: '#8a9090',
            accent: '#b8463e',
            accentLight: '#d06858',
            danger: '#c04040',
            success: '#3a8a6a',
            shadow: '0 4px 20px rgba(0,0,0,0.08)',
            shadowSm: '0 2px 8px rgba(0,0,0,0.06)',
        };

        return `
/* ========== 宗门美化样式 v2.0 ========== */

/* 宗门面板容器 */
#sectPanel {
    background: ${colors.bg} !important;
    color: ${colors.text} !important;
}

#sectPanel .panel-title {
    background: linear-gradient(135deg, ${colors.bgSecondary} 0%, ${colors.bg} 100%) !important;
    color: ${colors.text} !important;
    border-bottom: 1px solid ${colors.border} !important;
    padding: 16px 20px !important;
    font-size: 18px !important;
    font-weight: 600 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
}

#sectPanel .panel-title .btn-panel-close {
    width: 28px !important;
    height: 28px !important;
    border-radius: 50% !important;
    background: ${colors.bgCard} !important;
    border: 1px solid ${colors.border} !important;
    color: ${colors.textSecondary} !important;
    font-size: 16px !important;
    cursor: pointer !important;
    transition: all 0.2s !important;
}

#sectPanel .panel-title .btn-panel-close:hover {
    background: ${colors.danger} !important;
    color: white !important;
    border-color: ${colors.danger} !important;
}

/* Tab 标签栏 - 优化排版 */
#sectPanel .sect-tabs {
    background: ${colors.bgSecondary} !important;
    border-bottom: 1px solid ${colors.border} !important;
    padding: 12px 16px !important;
    display: flex !important;
    gap: 8px !important;
    flex-wrap: wrap !important;
    position: sticky !important;
    top: 0 !important;
    z-index: 10 !important;
}

#sectPanel .sect-tab {
    background: ${colors.bgCard} !important;
    border: 1px solid ${colors.border} !important;
    color: ${colors.textSecondary} !important;
    padding: 10px 20px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    transition: all 0.2s ease !important;
    position: relative !important;
    overflow: hidden !important;
}

#sectPanel .sect-tab:hover {
    background: ${colors.bgHover} !important;
    border-color: ${colors.accent} !important;
    color: ${colors.text} !important;
    transform: translateY(-1px) !important;
    box-shadow: ${colors.shadowSm} !important;
}

#sectPanel .sect-tab.active {
    background: linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%) !important;
    border-color: ${colors.accent} !important;
    color: white !important;
    box-shadow: 0 4px 12px ${colors.accent}40 !important;
}

#sectPanel .sect-tab .friend-btn-badge {
    position: absolute !important;
    top: -4px !important;
    right: -4px !important;
    background: ${colors.danger} !important;
    color: white !important;
    font-size: 10px !important;
    padding: 2px 6px !important;
    border-radius: 10px !important;
    min-width: 18px !important;
    text-align: center !important;
}

/* 内容区域 */
#sectPanel .sect-tab-content {
    background: ${colors.bg} !important;
    padding: 20px !important;
    min-height: calc(100vh - 200px) !important;
}

/* 卡片组件 - 优化排版 */
#sectPanel .court-card {
    background: ${colors.bgCard} !important;
    border: 1px solid ${colors.border} !important;
    border-radius: 16px !important;
    padding: 20px !important;
    margin-bottom: 20px !important;
    box-shadow: ${colors.shadowSm} !important;
    transition: all 0.3s ease !important;
}

#sectPanel .court-card:hover {
    box-shadow: ${colors.shadow} !important;
    border-color: ${colors.borderGold} !important;
}

#sectPanel .court-card-header {
    color: ${colors.accent} !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    margin-bottom: 16px !important;
    padding-bottom: 12px !important;
    border-bottom: 1px solid ${colors.border} !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
}

#sectPanel .court-card-hint {
    color: ${colors.textMuted} !important;
    font-size: 13px !important;
    line-height: 1.6 !important;
    margin: 0 0 12px 0 !important;
}

/* 宗门信息头部 */
#sectPanel .sect-info-header {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin-bottom: 20px !important;
}

#sectPanel .sect-name {
    color: ${colors.text} !important;
    font-size: 24px !important;
    font-weight: 700 !important;
    margin: 0 !important;
}

#sectPanel .sect-level-badge {
    background: linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%) !important;
    color: white !important;
    padding: 4px 12px !important;
    border-radius: 20px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
}

/* 统计网格 - 优化排版 */
#sectPanel .sect-status-grid {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 12px !important;
}

#sectPanel .sect-stat-item {
    background: ${colors.bgSecondary} !important;
    border: 1px solid ${colors.border} !important;
    border-radius: 12px !important;
    padding: 16px !important;
    text-align: center !important;
    transition: all 0.2s ease !important;
}

#sectPanel .sect-stat-item:hover {
    background: ${colors.bgHover} !important;
    border-color: ${colors.accent}40 !important;
    transform: translateY(-2px) !important;
}

#sectPanel .sect-stat-label {
    color: ${colors.textMuted} !important;
    font-size: 12px !important;
    margin-bottom: 6px !important;
    display: block !important;
}

#sectPanel .sect-stat-value {
    color: ${colors.text} !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    display: block !important;
}

#sectPanel .sect-stat-gold {
    color: ${colors.accent} !important;
}

/* 公告区域 */
#sectPanel .sect-notice-text {
    color: ${colors.textSecondary} !important;
    line-height: 1.8 !important;
    font-size: 14px !important;
    padding: 12px !important;
    background: ${colors.bgSecondary} !important;
    border-radius: 8px !important;
    border-left: 3px solid ${colors.accent} !important;
}

/* 按钮样式 - 全面美化 */
#sectPanel .btn-action {
    background: linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%) !important;
    color: white !important;
    border: none !important;
    border-radius: 10px !important;
    padding: 12px 20px !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    box-shadow: 0 4px 12px ${colors.accent}30 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
}

#sectPanel .btn-action:hover {
    transform: translateY(-2px) !important;
    box-shadow: 0 6px 20px ${colors.accent}50 !important;
}

#sectPanel .btn-action:active {
    transform: translateY(0) !important;
}

#sectPanel .btn-action.btn-danger {
    background: linear-gradient(135deg, ${colors.danger} 0%, #f08080 100%) !important;
    box-shadow: 0 4px 12px ${colors.danger}30 !important;
}

#sectPanel .btn-action.btn-danger:hover {
    box-shadow: 0 6px 20px ${colors.danger}50 !important;
}

/* 输入框样式 - 全面美化 */
#sectPanel input[type="text"],
#sectPanel textarea,
#sectPanel select {
    background: ${colors.bgInput} !important;
    border: 1px solid ${colors.border} !important;
    color: ${colors.text} !important;
    border-radius: 10px !important;
    padding: 12px 16px !important;
    font-size: 14px !important;
    width: 100% !important;
    transition: all 0.2s ease !important;
    box-sizing: border-box !important;
}

#sectPanel input[type="text"]:focus,
#sectPanel textarea:focus,
#sectPanel select:focus {
    border-color: ${colors.accent} !important;
    outline: none !important;
    box-shadow: 0 0 0 3px ${colors.accent}20 !important;
}

#sectPanel textarea {
    resize: vertical !important;
    min-height: 80px !important;
}

#sectPanel select {
    cursor: pointer !important;
    appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23${isDark ? 'a8a090' : '4a5a5a'}' d='M6 8L1 3h10z'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 12px center !important;
    padding-right: 36px !important;
}

/* 任务列表 */
#sectPanel .sect-task-list {
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
}

#sectPanel .sect-task-item {
    background: ${colors.bgCard} !important;
    border: 1px solid ${colors.border} !important;
    border-radius: 12px !important;
    padding: 16px !important;
    transition: all 0.2s ease !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
}

#sectPanel .sect-task-item:hover {
    border-color: ${colors.accent}40 !important;
    box-shadow: ${colors.shadowSm} !important;
    transform: translateX(4px) !important;
}

/* 捐赠列表 */
#sectPanel .sect-donate-toolbar {
    display: flex !important;
    gap: 12px !important;
    margin-bottom: 16px !important;
    align-items: center !important;
}

#sectPanel .sect-donate-search {
    flex: 1 !important;
}

#sectPanel .sect-donate-link {
    color: ${colors.accent} !important;
    background: transparent !important;
    border: 1px solid ${colors.accent} !important;
    padding: 10px 16px !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    transition: all 0.2s !important;
    white-space: nowrap !important;
}

#sectPanel .sect-donate-link:hover {
    background: ${colors.accent} !important;
    color: white !important;
}

#sectPanel .sect-donate-list {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    max-height: 400px !important;
    overflow-y: auto !important;
}

#sectPanel .sect-donate-item {
    background: ${colors.bgSecondary} !important;
    border: 1px solid ${colors.border} !important;
    border-radius: 10px !important;
    padding: 12px !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    transition: all 0.2s !important;
}

#sectPanel .sect-donate-item:hover {
    background: ${colors.bgHover} !important;
    border-color: ${colors.accent}40 !important;
}

#sectPanel .sect-donate-item.is-active {
    background: ${colors.accent}15 !important;
    border-color: ${colors.accent} !important;
}

/* 商店列表 */
#sectPanel .sect-shop-list {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
    gap: 16px !important;
}

#sectPanel .sect-shop-item {
    background: ${colors.bgCard} !important;
    border: 1px solid ${colors.border} !important;
    border-radius: 14px !important;
    padding: 16px !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
}

#sectPanel .sect-shop-item:hover {
    border-color: ${colors.accent} !important;
    box-shadow: ${colors.shadow} !important;
    transform: translateY(-4px) !important;
}

#sectPanel .sect-shop-select {
    width: auto !important;
    min-width: 120px !important;
}

/* 药田网格 */
#sectPanel .garden-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)) !important;
    gap: 16px !important;
}

#sectPanel .garden-pot {
    background: ${colors.bgCard} !important;
    border: 1px solid ${colors.border} !important;
    border-radius: 14px !important;
    padding: 16px !important;
    text-align: center !important;
    transition: all 0.2s ease !important;
    cursor: pointer !important;
}

#sectPanel .garden-pot:hover {
    border-color: ${colors.success} !important;
    box-shadow: 0 0 20px ${colors.success}30 !important;
}

#sectPanel .garden-pot.occupied {
    border-color: ${colors.success} !important;
    background: ${colors.success}10 !important;
}

/* 成员列表 */
#sectPanel .sect-member-list {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
}

#sectPanel .sect-member-item {
    background: ${colors.bgCard} !important;
    border: 1px solid ${colors.border} !important;
    border-radius: 12px !important;
    padding: 14px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    transition: all 0.2s !important;
}

#sectPanel .sect-member-item:hover {
    background: ${colors.bgSecondary} !important;
    border-color: ${colors.accent}40 !important;
}

/* 未加入宗门视图 */
#sectUnjoinedView {
    padding: 24px !important;
}

#sectUnjoinedView .sect-desc {
    color: ${colors.textSecondary} !important;
    line-height: 1.8 !important;
    font-size: 14px !important;
    margin-bottom: 20px !important;
}

#sectUnjoinedView .sect-rules-summary {
    list-style: none !important;
    padding: 0 !important;
    margin: 0 0 20px 0 !important;
    background: ${colors.bgCard} !important;
    border: 1px solid ${colors.border} !important;
    border-radius: 12px !important;
    padding: 16px !important;
}

#sectUnjoinedView .sect-rules-summary li {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 10px 0 !important;
    border-bottom: 1px solid ${colors.border} !important;
    color: ${colors.textSecondary} !important;
    font-size: 14px !important;
}

#sectUnjoinedView .sect-rules-summary li:last-child {
    border-bottom: none !important;
}

#sectUnjoinedView .pvp-mode-dot {
    width: 10px !important;
    height: 10px !important;
    border-radius: 50% !important;
    flex-shrink: 0 !important;
}

#sectUnjoinedView .pvp-mode-dot.safe {
    background: ${colors.success} !important;
    box-shadow: 0 0 8px ${colors.success} !important;
}

#sectUnjoinedView .pvp-mode-dot.caution {
    background: ${colors.accent} !important;
    box-shadow: 0 0 8px ${colors.accent} !important;
}

#sectUnjoinedView .pvp-mode-dot.danger {
    background: ${colors.danger} !important;
    box-shadow: 0 0 8px ${colors.danger} !important;
}

/* 分隔线 */
#sectPanel [style*="border-top"],
#sectUnjoinedView [style*="border-top"] {
    border-color: ${colors.border} !important;
}

/* 隐藏元素处理 */
#sectPanel .hidden,
#sectUnjoinedView .hidden {
    display: none !important;
}

/* 响应式优化 */
@media (max-width: 768px) {
    #sectPanel .sect-tabs {
        padding: 10px !important;
        gap: 6px !important;
    }
    
    #sectPanel .sect-tab {
        padding: 8px 14px !important;
        font-size: 13px !important;
    }
    
    #sectPanel .sect-status-grid {
        grid-template-columns: 1fr !important;
    }
    
    #sectPanel .sect-shop-list {
        grid-template-columns: 1fr !important;
    }
    
    #sectPanel .garden-grid {
        grid-template-columns: repeat(2, 1fr) !important;
    }
    
    #sectPanel .sect-tab-content {
        padding: 16px !important;
    }
    
    #sectPanel .court-card {
        padding: 16px !important;
    }
}

/* 滚动条美化 */
#sectPanel ::-webkit-scrollbar {
    width: 8px !important;
    height: 8px !important;
}

#sectPanel ::-webkit-scrollbar-track {
    background: ${colors.bgSecondary} !important;
    border-radius: 4px !important;
}

#sectPanel ::-webkit-scrollbar-thumb {
    background: ${colors.borderGold} !important;
    border-radius: 4px !important;
}

#sectPanel ::-webkit-scrollbar-thumb:hover {
    background: ${colors.accent} !important;
}
`;
    }

    // 应用样式
    let styleElement = null;
    function applyThemeStyles() {
        try {
            if (styleElement && styleElement.parentNode) {
                styleElement.remove();
            }
            styleElement = document.createElement('style');
            styleElement.id = 'sect-beautify-v2';
            styleElement.textContent = generateStyles();
            if (document.head) {
                document.head.appendChild(styleElement);
            }
        } catch (e) {
            console.log('[宗门美化] 应用样式失败:', e);
        }
    }

    // 初始化
    function init() {
        try {
            applyThemeStyles();
            watchThemeChange();
            
            // 延迟应用，确保DOM已准备好
            setTimeout(applyThemeStyles, 500);
            setTimeout(applyThemeStyles, 2000);
            
            // 监听宗门按钮点击
            const sectBtn = document.getElementById('sectBtn');
            if (sectBtn) {
                sectBtn.addEventListener('click', () => {
                    setTimeout(applyThemeStyles, 100);
                    setTimeout(applyThemeStyles, 500);
                });
            }
        } catch (e) {
            console.log('[宗门美化] 初始化失败:', e);
        }
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
    } else {
        setTimeout(init, 500);
    }

    // 暴露刷新方法
    window.SectBeautifyV2 = {
        refresh: applyThemeStyles,
        getTheme: getGameTheme
    };
})();

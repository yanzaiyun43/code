// ==UserScript==
// @name         灵界宗门极简轻奢美化
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  为灵界游戏宗门模块提供极简轻奢风格美化，支持深色/浅色模式切换，全覆盖所有宗门功能（九霄宗+自建宗门）
// @author       You
// @match        *://*/game.html*
// @match        *://*/lingverse*/game.html*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // 配置管理
    // ============================================
    const CONFIG = {
        STORAGE_KEY: 'lingverse_sect_theme_v2',
        DEFAULT_THEME: 'light',
        ANIMATION_DURATION: 300,
    };

    function getSavedTheme() {
        try {
            return localStorage.getItem(CONFIG.STORAGE_KEY) || CONFIG.DEFAULT_THEME;
        } catch (e) {
            return CONFIG.DEFAULT_THEME;
        }
    }

    function saveTheme(theme) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, theme);
        } catch (e) {}
    }

    // ============================================
    // 极简轻奢主题色彩系统
    // ============================================
    const THEMES = {
        light: {
            '--sect-bg-primary': '#fafbfc',
            '--sect-bg-secondary': '#f5f6f8',
            '--sect-bg-card': '#ffffff',
            '--sect-bg-hover': '#f0f2f5',
            '--sect-bg-elevated': '#ffffff',
            '--sect-border': 'rgba(200, 210, 220, 0.4)',
            '--sect-border-light': 'rgba(220, 228, 236, 0.3)',
            '--sect-divider': 'rgba(200, 210, 220, 0.25)',
            '--sect-text-primary': '#2c3e50',
            '--sect-text-secondary': '#5a6c7d',
            '--sect-text-muted': '#8a9aa8',
            '--sect-text-placeholder': '#b0bcc8',
            '--sect-accent': '#6b8cae',
            '--sect-accent-light': '#8ba4c2',
            '--sect-accent-soft': 'rgba(107, 140, 174, 0.08)',
            '--sect-accent-hover': 'rgba(107, 140, 174, 0.12)',
            '--sect-gold': '#c9a86c',
            '--sect-gold-soft': 'rgba(201, 168, 108, 0.1)',
            '--sect-jade': '#6ba88f',
            '--sect-jade-soft': 'rgba(107, 168, 143, 0.1)',
            '--sect-crimson': '#c97b7b',
            '--sect-purple': '#9b8ab4',
            '--sect-shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.04)',
            '--sect-shadow': '0 2px 8px rgba(0, 0, 0, 0.06)',
            '--sect-shadow-md': '0 4px 16px rgba(0, 0, 0, 0.08)',
            '--sect-shadow-hover': '0 8px 24px rgba(0, 0, 0, 0.1)',
            '--sect-glow': '0 0 20px rgba(107, 140, 174, 0.15)',
            '--sect-backdrop': 'rgba(255, 255, 255, 0.85)',
        },
        dark: {
            '--sect-bg-primary': '#1a1d23',
            '--sect-bg-secondary': '#1e2229',
            '--sect-bg-card': '#252a33',
            '--sect-bg-hover': '#2a303a',
            '--sect-bg-elevated': '#2d333f',
            '--sect-border': 'rgba(100, 110, 130, 0.25)',
            '--sect-border-light': 'rgba(100, 110, 130, 0.15)',
            '--sect-divider': 'rgba(100, 110, 130, 0.2)',
            '--sect-text-primary': '#e8ecf1',
            '--sect-text-secondary': '#a8b2bd',
            '--sect-text-muted': '#6a7582',
            '--sect-text-placeholder': '#4a5560',
            '--sect-accent': '#7a9ab8',
            '--sect-accent-light': '#9ab4cc',
            '--sect-accent-soft': 'rgba(122, 154, 184, 0.1)',
            '--sect-accent-hover': 'rgba(122, 154, 184, 0.15)',
            '--sect-gold': '#c9b896',
            '--sect-gold-soft': 'rgba(201, 184, 150, 0.12)',
            '--sect-jade': '#7ab8a0',
            '--sect-jade-soft': 'rgba(122, 184, 160, 0.12)',
            '--sect-crimson': '#b88888',
            '--sect-purple': '#a89bc4',
            '--sect-shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.2)',
            '--sect-shadow': '0 2px 8px rgba(0, 0, 0, 0.25)',
            '--sect-shadow-md': '0 4px 16px rgba(0, 0, 0, 0.3)',
            '--sect-shadow-hover': '0 8px 24px rgba(0, 0, 0, 0.35)',
            '--sect-glow': '0 0 20px rgba(122, 154, 184, 0.2)',
            '--sect-backdrop': 'rgba(26, 29, 35, 0.9)',
        }
    };

    // ============================================
    // 完整 CSS 样式
    // ============================================
    const STYLES = `
        :root {
            --sect-radius-sm: 6px;
            --sect-radius: 10px;
            --sect-radius-lg: 14px;
            --sect-radius-xl: 20px;
            --sect-transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            --sect-transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            --sect-transition-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            --sect-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            --sect-font-mono: "SF Mono", Monaco, "Cascadia Code", monospace;
        }

        /* 主题过渡 */
        .sect-beautify-enabled,
        .sect-beautify-enabled *,
        .sect-beautify-enabled *::before,
        .sect-beautify-enabled *::after {
            transition: background-color var(--sect-transition-slow),
                        border-color var(--sect-transition-slow),
                        color var(--sect-transition-slow),
                        box-shadow var(--sect-transition-slow),
                        transform var(--sect-transition),
                        opacity var(--sect-transition) !important;
        }

        /* 页面淡入 */
        .sect-beautify-enabled #sectJoinedView,
        .sect-beautify-enabled #sectUnjoinedView {
            animation: sectFadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes sectFadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* ============================================
           Tab 标签栏
           ============================================ */
        .sect-beautify-enabled .sect-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            padding: 4px;
            background: var(--sect-bg-secondary);
            border-radius: var(--sect-radius);
            border: 1px solid var(--sect-border-light);
        }

        .sect-beautify-enabled .sect-tab {
            flex: 1;
            padding: 10px 8px;
            font-size: 13px;
            font-weight: 500;
            letter-spacing: 0.5px;
            background: transparent;
            border: none;
            border-radius: var(--sect-radius-sm);
            color: var(--sect-text-secondary);
            cursor: pointer;
            position: relative;
            overflow: hidden;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-tab:hover {
            color: var(--sect-text-primary);
            background: var(--sect-bg-hover);
        }

        .sect-beautify-enabled .sect-tab.active {
            background: var(--sect-bg-card);
            color: var(--sect-accent);
            box-shadow: var(--sect-shadow-sm);
        }

        .sect-beautify-enabled .sect-tab.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 20px;
            height: 2px;
            background: var(--sect-accent);
            border-radius: 1px;
        }

        /* ============================================
           大殿面板
           ============================================ */
        .sect-beautify-enabled .sect-info-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            margin-bottom: 16px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius-lg);
            box-shadow: var(--sect-shadow);
        }

        .sect-beautify-enabled .sect-name {
            font-size: 20px;
            font-weight: 600;
            color: var(--sect-text-primary);
            letter-spacing: 1px;
        }

        .sect-beautify-enabled .sect-level-badge {
            background: var(--sect-accent-soft);
            color: var(--sect-accent);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            border: 1px solid var(--sect-border);
        }

        .sect-beautify-enabled .sect-status-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-top: 0;
            margin-bottom: 16px;
        }

        .sect-beautify-enabled .sect-stat-item {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 16px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-stat-item:hover {
            transform: translateY(-2px);
            box-shadow: var(--sect-shadow-md);
            border-color: var(--sect-accent);
        }

        .sect-beautify-enabled .sect-stat-label {
            font-size: 11px;
            color: var(--sect-text-muted);
            letter-spacing: 0.8px;
            text-transform: uppercase;
        }

        .sect-beautify-enabled .sect-stat-value {
            font-size: 15px;
            color: var(--sect-text-primary);
            font-weight: 600;
        }

        .sect-beautify-enabled .sect-stat-gold {
            color: var(--sect-gold);
        }

        /* ============================================
           公告区域
           ============================================ */
        .sect-beautify-enabled .sect-notice-box {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            padding: 16px;
            margin-top: 8px;
        }

        .sect-beautify-enabled .sect-notice-text {
            margin: 0;
            font-size: 14px;
            color: var(--sect-text-secondary);
            line-height: 1.7;
            white-space: pre-wrap;
        }

        .sect-beautify-enabled .sect-notice-box textarea {
            width: 100%;
            background: var(--sect-bg-secondary);
            border: 1px solid var(--sect-border);
            color: var(--sect-text-primary);
            padding: 12px;
            border-radius: var(--sect-radius-sm);
            resize: vertical;
            min-height: 80px;
            font-family: inherit;
            font-size: 14px;
            line-height: 1.6;
            outline: none;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-notice-box textarea:focus {
            border-color: var(--sect-accent);
            box-shadow: 0 0 0 3px var(--sect-accent-soft);
        }

        /* ============================================
           事务任务
           ============================================ */
        .sect-beautify-enabled .sect-task-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .sect-beautify-enabled .sect-task-card {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            padding: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-task-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--sect-shadow);
            border-color: var(--sect-accent-light);
        }

        .sect-beautify-enabled .sect-task-name {
            color: var(--sect-text-primary);
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .sect-beautify-enabled .sect-task-desc {
            color: var(--sect-text-muted);
            font-size: 12px;
            line-height: 1.5;
        }

        .sect-beautify-enabled .sect-task-progress {
            font-size: 12px;
            color: var(--sect-text-secondary);
            font-variant-numeric: tabular-nums;
        }

        .sect-beautify-enabled .sect-task-reward {
            color: var(--sect-jade);
            font-size: 12px;
            font-weight: 500;
        }

        /* ============================================
           底蕴/捐献
           ============================================ */
        .sect-beautify-enabled .sect-donate-toolbar {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 0 0 12px;
            padding: 12px;
            background: var(--sect-bg-secondary);
            border-radius: var(--sect-radius);
        }

        .sect-beautify-enabled .sect-donate-search {
            flex: 1;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            color: var(--sect-text-primary);
            padding: 10px 14px;
            border-radius: var(--sect-radius-sm);
            font-size: 13px;
            outline: none;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-donate-search:focus {
            border-color: var(--sect-accent);
            box-shadow: 0 0 0 3px var(--sect-accent-soft);
        }

        .sect-beautify-enabled .sect-donate-search::placeholder {
            color: var(--sect-text-placeholder);
        }

        .sect-beautify-enabled .sect-donate-link {
            background: transparent;
            border: 1px solid var(--sect-border);
            color: var(--sect-text-secondary);
            padding: 10px 16px;
            font-size: 12px;
            border-radius: var(--sect-radius-sm);
            cursor: pointer;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-donate-link:hover {
            border-color: var(--sect-accent);
            color: var(--sect-accent);
            background: var(--sect-accent-soft);
        }

        .sect-beautify-enabled .sect-donate-list {
            max-height: 360px;
            overflow-y: auto;
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            background: var(--sect-bg-secondary);
            padding: 8px;
        }

        .sect-beautify-enabled .sect-donate-group {
            margin-bottom: 12px;
        }

        .sect-beautify-enabled .sect-donate-group:last-child {
            margin-bottom: 0;
        }

        .sect-beautify-enabled .sect-donate-group__title {
            font-size: 11px;
            color: var(--sect-text-muted);
            letter-spacing: 0.8px;
            text-transform: uppercase;
            padding: 8px 12px;
            border-bottom: 1px solid var(--sect-divider);
            margin-bottom: 6px;
        }

        .sect-beautify-enabled .sect-donate-group__count {
            color: var(--sect-text-muted);
            font-size: 10px;
            margin-left: 4px;
        }

        .sect-beautify-enabled .sect-donate-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: var(--sect-radius-sm);
            cursor: pointer;
            transition: all var(--sect-transition-fast);
        }

        .sect-beautify-enabled .sect-donate-row:hover {
            background: var(--sect-bg-hover);
        }

        .sect-beautify-enabled .sect-donate-row.is-active {
            background: var(--sect-accent-soft);
            border: 1px solid var(--sect-accent);
        }

        .sect-beautify-enabled .sect-donate-check {
            width: 16px;
            height: 16px;
            accent-color: var(--sect-accent);
        }

        .sect-beautify-enabled .sect-donate-row__name {
            flex: 1;
            min-width: 0;
            font-size: 13px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--sect-text-primary);
        }

        .sect-beautify-enabled .sect-donate-row__meta {
            flex: none;
            font-size: 11px;
            color: var(--sect-text-muted);
            white-space: nowrap;
        }

        .sect-beautify-enabled .sect-donate-qty {
            width: 70px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            color: var(--sect-text-primary);
            padding: 6px 8px;
            border-radius: var(--sect-radius-sm);
            text-align: center;
            font-size: 12px;
            outline: none;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-donate-qty:focus {
            border-color: var(--sect-accent);
        }

        .sect-beautify-enabled .sect-donate-preview {
            text-align: center;
            color: var(--sect-text-secondary);
            font-size: 14px;
            margin: 12px 0;
            padding: 12px;
            background: var(--sect-bg-secondary);
            border-radius: var(--sect-radius);
        }

        /* ============================================
           珍宝阁商店
           ============================================ */
        .sect-beautify-enabled .sect-shop-select {
            padding: 8px 32px 8px 14px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius-sm);
            color: var(--sect-text-primary);
            font-size: 13px;
            cursor: pointer;
            outline: none;
            appearance: none;
            -webkit-appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b8cae' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-shop-select:focus {
            border-color: var(--sect-accent);
            box-shadow: 0 0 0 3px var(--sect-accent-soft);
        }

        .sect-beautify-enabled .sect-shop-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .sect-beautify-enabled .sect-shop-item {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            padding: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-shop-item:hover {
            transform: translateY(-2px);
            box-shadow: var(--sect-shadow);
            border-color: var(--sect-accent-light);
        }

        .sect-beautify-enabled .sect-shop-item-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--sect-text-primary);
        }

        .sect-beautify-enabled .sect-shop-item-desc {
            font-size: 12px;
            color: var(--sect-text-muted);
            margin-top: 2px;
        }

        .sect-beautify-enabled .sect-shop-item-price {
            font-size: 13px;
            color: var(--sect-gold);
            font-weight: 600;
        }

        .sect-beautify-enabled .sect-shop-qty {
            width: 56px;
            height: 36px;
            text-align: center;
            background: var(--sect-bg-secondary);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius-sm);
            color: var(--sect-text-primary);
            font-size: 14px;
            outline: none;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-shop-qty:focus {
            border-color: var(--sect-accent);
        }

        .sect-beautify-enabled .sect-btn-buy {
            background: var(--sect-accent-soft);
            color: var(--sect-accent);
            border: 1px solid var(--sect-accent);
            padding: 8px 18px;
            font-size: 13px;
            border-radius: var(--sect-radius-sm);
            cursor: pointer;
            font-weight: 500;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-btn-buy:hover {
            background: var(--sect-accent);
            color: var(--sect-bg-card);
            transform: translateY(-1px);
            box-shadow: var(--sect-shadow);
        }

        /* ============================================
           成员列表
           ============================================ */
        .sect-beautify-enabled .sect-members-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            margin-bottom: 12px;
            background: var(--sect-bg-secondary);
            border-radius: var(--sect-radius);
            color: var(--sect-text-secondary);
            font-size: 13px;
            font-weight: 500;
        }

        .sect-beautify-enabled .sect-member-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .sect-beautify-enabled .sect-member-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--sect-bg-card);
            padding: 14px 16px;
            border-radius: var(--sect-radius);
            border: 1px solid var(--sect-border);
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-member-row:hover {
            transform: translateX(4px);
            border-color: var(--sect-accent-light);
            box-shadow: var(--sect-shadow-sm);
        }

        .sect-beautify-enabled .sect-member-name {
            color: var(--sect-text-primary);
            font-size: 14px;
            font-weight: 600;
        }

        .sect-beautify-enabled .sect-member-realm {
            color: var(--sect-text-muted);
            font-size: 12px;
            margin-top: 2px;
        }

        .sect-beautify-enabled .sect-member-role {
            color: var(--sect-purple);
            font-weight: 600;
            font-size: 12px;
        }

        .sect-beautify-enabled .sect-member-contrib {
            color: var(--sect-gold);
            font-size: 12px;
            font-variant-numeric: tabular-nums;
        }

        /* ============================================
           药田样式
           ============================================ */
        .sect-beautify-enabled #sectGardenGrid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 12px;
            margin-top: 8px;
        }

        /* ============================================
           九霄宗药田样式
           ============================================ */
        .sect-beautify-enabled .garden-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 12px;
            margin-top: 8px;
        }

        .sect-beautify-enabled .garden-pot {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            padding: 16px 12px;
            text-align: center;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .garden-pot:hover {
            transform: translateY(-3px);
            box-shadow: var(--sect-shadow-md);
        }

        .sect-beautify-enabled .garden-pot-title {
            font-size: 13px;
            color: var(--sect-gold);
            margin-bottom: 6px;
            font-weight: 600;
        }

        .sect-beautify-enabled .garden-seed-name {
            font-size: 12px;
            margin-bottom: 4px;
            font-weight: 500;
        }

        .sect-beautify-enabled .garden-seed-name.growing {
            color: var(--sect-jade);
        }

        .sect-beautify-enabled .garden-seed-name.mature {
            color: var(--sect-gold);
        }

        .sect-beautify-enabled .garden-pot-status {
            font-size: 11px;
            color: var(--sect-text-muted);
            margin-bottom: 8px;
        }

        .sect-beautify-enabled .garden-timer-val {
            font-size: 12px;
            color: var(--sect-accent);
            font-family: var(--sect-font-mono);
            margin-bottom: 8px;
        }

        .sect-beautify-enabled .garden-idle-text {
            font-size: 12px;
            color: var(--sect-text-muted);
            margin-bottom: 12px;
        }

        .sect-beautify-enabled .garden-batch-actions {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
            flex-wrap: wrap;
        }

        .sect-beautify-enabled .garden-batch-actions button {
            flex: 1;
            min-width: 120px;
        }

        .sect-beautify-enabled .psect-farm-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 12px;
            margin-top: 8px;
        }

        .sect-beautify-enabled .psect-farm-plot {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            padding: 14px 10px;
            text-align: center;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .psect-farm-plot:hover {
            transform: translateY(-3px);
            box-shadow: var(--sect-shadow-md);
        }

        .sect-beautify-enabled .psect-farm-plot__title {
            font-size: 13px;
            color: var(--sect-gold);
            margin-bottom: 4px;
            font-weight: 600;
        }

        .sect-beautify-enabled .psect-farm-plot__status {
            font-size: 11px;
            color: var(--sect-text-muted);
            margin-bottom: 4px;
        }

        .sect-beautify-enabled .psect-farm-plot__content {
            font-size: 12px;
            color: var(--sect-jade);
            word-break: break-all;
        }

        .sect-beautify-enabled .psect-farm-plot__time {
            font-size: 11px;
            color: var(--sect-text-muted);
            margin-top: 6px;
        }

        .sect-beautify-enabled .psect-farm-plot--idle {
            border-style: dashed;
            opacity: 0.7;
        }

        .sect-beautify-enabled .psect-farm-plot--planted {
            border-color: var(--sect-jade);
            background: var(--sect-jade-soft);
        }

        .sect-beautify-enabled .psect-farm-plot--mature {
            border-color: var(--sect-jade);
            background: var(--sect-jade-soft);
            box-shadow: 0 0 12px rgba(107, 168, 143, 0.2);
        }

        .sect-beautify-enabled .psect-farm-plot__btn {
            width: 100%;
            margin-top: 8px;
            padding: 6px 12px;
            font-size: 12px;
            border-radius: var(--sect-radius-sm);
            cursor: pointer;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .psect-farm-plot__btn--harvest {
            background: var(--sect-jade);
            color: #fff;
            border: none;
        }

        .sect-beautify-enabled .psect-farm-plot__btn--harvest:hover {
            filter: brightness(1.1);
        }

        .sect-beautify-enabled .psect-farm-plot__actions {
            display: flex;
            gap: 6px;
            margin-top: 8px;
        }

        .sect-beautify-enabled .psect-farm-plot__btn--release {
            background: rgba(200, 80, 80, 0.1);
            color: var(--sect-crimson);
            border: 1px solid rgba(200, 80, 80, 0.3);
        }

        .sect-beautify-enabled .psect-farm-plot__btn--release:hover {
            background: rgba(200, 80, 80, 0.2);
        }

        .sect-beautify-enabled .psect-farm-section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 12px;
            padding: 12px 16px;
            background: var(--sect-bg-secondary);
            border-radius: var(--sect-radius);
        }

        .sect-beautify-enabled .psect-farm-quick {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .sect-beautify-enabled .psect-farm-quick__btn {
            font-size: 12px;
            padding: 6px 12px;
            background: var(--sect-accent-soft);
            color: var(--sect-accent);
            border: 1px solid var(--sect-accent);
            border-radius: var(--sect-radius-sm);
            cursor: pointer;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .psect-farm-quick__btn:hover {
            background: var(--sect-accent);
            color: var(--sect-bg-card);
        }

        .sect-beautify-enabled .psect-farm-placeholder {
            text-align: center;
            color: var(--sect-text-muted);
            font-size: 13px;
            padding: 20px;
        }

        /* ============================================
           自建宗门统计卡片
           ============================================ */
        .sect-beautify-enabled .psect-stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-top: 16px;
        }

        .sect-beautify-enabled .psect-stat-card {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 16px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .psect-stat-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--sect-shadow);
        }

        .sect-beautify-enabled .psect-stat-card.psect-stat-wide {
            grid-column: 1 / -1;
        }

        .sect-beautify-enabled .psect-stat-label {
            font-size: 11px;
            color: var(--sect-text-muted);
            letter-spacing: 0.8px;
            text-transform: uppercase;
        }

        .sect-beautify-enabled .psect-stat-val {
            font-size: 16px;
            color: var(--sect-text-primary);
            font-weight: 600;
        }

        .sect-beautify-enabled .psect-val-gold {
            color: var(--sect-gold);
        }

        .sect-beautify-enabled .psect-val-info {
            color: var(--sect-accent);
        }

        /* ============================================
           设施按钮
           ============================================ */
        .sect-beautify-enabled .psect-facility-grid {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .sect-beautify-enabled .psect-facility-btn {
            flex: 1;
            min-width: 90px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            color: var(--sect-text-primary);
            padding: 14px 10px;
            font-size: 13px;
            border-radius: var(--sect-radius);
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .psect-facility-btn:hover {
            background: var(--sect-accent-soft);
            border-color: var(--sect-accent);
            transform: translateY(-2px);
            box-shadow: var(--sect-shadow);
        }

        .sect-beautify-enabled .psect-facility-icon {
            font-size: 20px;
        }

        /* ============================================
           日志容器
           ============================================ */
        .sect-beautify-enabled .psect-logs-box {
            max-height: 200px;
            overflow-y: auto;
            padding: 12px;
            border-radius: var(--sect-radius);
            background: var(--sect-bg-secondary);
            border: 1px solid var(--sect-border);
            font-size: 12px;
            line-height: 1.7;
            color: var(--sect-text-secondary);
        }

        /* ============================================
           表单标签
           ============================================ */
        .sect-beautify-enabled .psect-field-label {
            display: block;
            font-size: 12px;
            color: var(--sect-text-muted);
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }

        .sect-beautify-enabled .psect-checkbox-label {
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            color: var(--sect-text-secondary);
            padding: 6px 10px;
            border-radius: var(--sect-radius-sm);
            border: 1px solid transparent;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .psect-checkbox-label:hover {
            background: var(--sect-bg-hover);
        }

        .sect-beautify-enabled .psect-checkbox-label.psect-checkbox-checked {
            color: var(--sect-gold);
            background: var(--sect-gold-soft);
            border-color: var(--sect-gold);
        }

        /* ============================================
           未加入宗门视图
           ============================================ */
        .sect-beautify-enabled .sect-desc {
            font-size: 14px;
            color: var(--sect-text-secondary);
            line-height: 1.8;
            background: var(--sect-bg-card);
            padding: 20px;
            border-radius: var(--sect-radius);
            border: 1px solid var(--sect-border);
            margin-bottom: 12px;
        }

        .sect-beautify-enabled .sect-rules-summary {
            list-style: none;
            padding: 16px 20px;
            margin: 0 0 12px;
            font-size: 13px;
            color: var(--sect-text-secondary);
            background: var(--sect-bg-card);
            border-radius: var(--sect-radius);
            border: 1px solid var(--sect-border);
        }

        .sect-beautify-enabled .sect-rules-summary li {
            padding: 10px 0;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid var(--sect-divider);
        }

        .sect-beautify-enabled .sect-rules-summary li:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }

        .sect-beautify-enabled .sect-rules-summary li::before {
            content: '';
            width: 6px;
            height: 6px;
            background: var(--sect-accent);
            border-radius: 50%;
            flex-shrink: 0;
        }

        /* ============================================
           角色行
           ============================================ */
        .sect-beautify-enabled .sect-role-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid var(--sect-divider);
        }

        .sect-beautify-enabled .sect-role-row:last-of-type {
            border-bottom: none;
        }

        .sect-beautify-enabled .sect-label {
            color: var(--sect-text-muted);
            font-size: 12px;
        }

        .sect-beautify-enabled .sect-value {
            color: var(--sect-gold);
            font-size: 13px;
            font-weight: 500;
        }

        .sect-beautify-enabled .sect-role {
            color: var(--sect-purple);
            font-weight: 600;
        }

        .sect-beautify-enabled .sect-contrib {
            color: var(--sect-gold);
        }

        /* ============================================
           分区标题
           ============================================ */
        .sect-beautify-enabled .sect-section-title {
            font-size: 12px;
            color: var(--sect-text-muted);
            letter-spacing: 1px;
            text-transform: uppercase;
            margin: 16px 0 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--sect-divider);
        }

        /* ============================================
           按钮样式
           ============================================ */
        .sect-beautify-enabled .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
        }

        .sect-beautify-enabled .btn-danger {
            background: rgba(200, 80, 80, 0.1);
            color: var(--sect-crimson);
            border: 1px solid rgba(200, 80, 80, 0.3);
        }

        .sect-beautify-enabled .btn-danger:hover {
            background: rgba(200, 80, 80, 0.2);
        }

        .sect-beautify-enabled .court-card-hint {
            font-size: 12px;
            color: var(--sect-text-muted);
            line-height: 1.6;
            margin: 8px 0;
        }

        .sect-beautify-enabled .btn-action {
            background: var(--sect-accent-soft);
            color: var(--sect-accent);
            border: 1px solid var(--sect-accent);
            padding: 10px 20px;
            font-size: 13px;
            border-radius: var(--sect-radius-sm);
            cursor: pointer;
            font-weight: 500;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .btn-action:hover {
            background: var(--sect-accent);
            color: var(--sect-bg-card);
            transform: translateY(-2px);
            box-shadow: var(--sect-shadow);
        }

        .sect-beautify-enabled .btn-action:active {
            transform: translateY(0);
        }

        .sect-beautify-enabled button[class*="btn"] {
            transition: all var(--sect-transition);
        }

        /* ============================================
           主题切换按钮
           ============================================ */
        .sect-theme-toggle {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            color: var(--sect-accent);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            box-shadow: var(--sect-shadow-md);
            transition: all var(--sect-transition);
            z-index: 9999;
        }

        .sect-theme-toggle:hover {
            transform: scale(1.1) rotate(15deg);
            box-shadow: var(--sect-shadow-hover);
            border-color: var(--sect-accent);
        }

        /* ============================================
           弹窗/模态框样式
           ============================================ */
        .sect-beautify-enabled .modal-overlay--top {
            background: var(--sect-backdrop);
            backdrop-filter: blur(8px);
        }

        .sect-beautify-enabled .modal-header-deco {
            background: var(--sect-bg-card);
            border-bottom: 1px solid var(--sect-border);
            padding: 16px 20px;
        }

        .sect-beautify-enabled .modal-header-deco__subtitle {
            font-size: 14px;
            color: var(--sect-text-muted);
            letter-spacing: 1px;
        }

        .sect-beautify-enabled .modal-body-padded {
            padding: 20px;
            background: var(--sect-bg-primary);
        }

        .sect-beautify-enabled .modal-info-card {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            padding: 16px;
            margin-bottom: 12px;
        }

        .sect-beautify-enabled .modal-info-card__title {
            font-size: 14px;
            color: var(--sect-accent);
            font-weight: 600;
            margin-bottom: 10px;
        }

        .sect-beautify-enabled .modal-btn {
            padding: 8px 16px;
            border-radius: var(--sect-radius-sm);
            font-size: 13px;
            cursor: pointer;
            transition: all var(--sect-transition);
            border: 1px solid var(--sect-border);
            background: var(--sect-bg-card);
            color: var(--sect-text-secondary);
        }

        .sect-beautify-enabled .modal-btn:hover {
            border-color: var(--sect-accent);
            color: var(--sect-accent);
        }

        .sect-beautify-enabled .modal-btn--gold {
            background: var(--sect-gold-soft);
            color: var(--sect-gold);
            border-color: var(--sect-gold);
        }

        .sect-beautify-enabled .modal-btn--gold:hover {
            background: var(--sect-gold);
            color: var(--sect-bg-card);
        }

        .sect-beautify-enabled .modal-btn--outline {
            background: transparent;
            border-color: var(--sect-border);
        }

        /* ============================================
           宗门浏览卡片
           ============================================ */
        .sect-beautify-enabled .sect-browse-card {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            padding: 16px;
            margin-bottom: 12px;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .sect-browse-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--sect-shadow);
        }

        .sect-beautify-enabled .sect-browse-card__header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .sect-beautify-enabled .sect-browse-card__title {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .sect-beautify-enabled .sect-browse-card__name {
            font-size: 15px;
            font-weight: 600;
            color: var(--sect-text-primary);
        }

        .sect-beautify-enabled .sect-browse-card__level {
            font-size: 11px;
            color: var(--sect-gold);
            background: var(--sect-gold-soft);
            padding: 2px 8px;
            border-radius: 10px;
        }

        .sect-beautify-enabled .sect-browse-card__region {
            font-size: 12px;
            color: var(--sect-text-muted);
        }

        .sect-beautify-enabled .sect-browse-card__meta {
            display: flex;
            gap: 16px;
            font-size: 12px;
            color: var(--sect-text-secondary);
            margin-bottom: 10px;
        }

        .sect-beautify-enabled .sect-browse-card__actions {
            display: flex;
            gap: 8px;
        }

        .sect-beautify-enabled .sect-kind-badge {
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 500;
        }

        .sect-beautify-enabled .sect-kind-badge--system {
            background: var(--sect-accent-soft);
            color: var(--sect-accent);
        }

        .sect-beautify-enabled .sect-kind-badge--player {
            background: var(--sect-gold-soft);
            color: var(--sect-gold);
        }

        .sect-beautify-enabled .sect-card-notice {
            font-size: 12px;
            color: var(--sect-text-muted);
            margin: 8px 0;
            padding: 8px;
            background: var(--sect-bg-secondary);
            border-radius: var(--sect-radius-sm);
        }

        /* ============================================
           输入框样式
           ============================================ */
        .sect-beautify-enabled .app-input {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            color: var(--sect-text-primary);
            padding: 10px 14px;
            border-radius: var(--sect-radius-sm);
            font-size: 14px;
            outline: none;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .app-input:focus {
            border-color: var(--sect-accent);
            box-shadow: 0 0 0 3px var(--sect-accent-soft);
        }

        .sect-beautify-enabled .app-select {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            color: var(--sect-text-primary);
            padding: 10px 14px;
            border-radius: var(--sect-radius-sm);
            font-size: 14px;
            outline: none;
            cursor: pointer;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .app-select:focus {
            border-color: var(--sect-accent);
            box-shadow: 0 0 0 3px var(--sect-accent-soft);
        }

        /* ============================================
           court-card 样式（自建宗门用）
           ============================================ */
        .sect-beautify-enabled .court-card {
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius-lg);
            padding: 20px;
            margin-bottom: 16px;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .court-card:hover {
            box-shadow: var(--sect-shadow);
        }

        .sect-beautify-enabled .court-card-header {
            font-size: 12px;
            color: var(--sect-text-muted);
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--sect-divider);
        }

        /* ============================================
           历史记录列表
           ============================================ */
        .sect-beautify-enabled .modal-feat-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .sect-beautify-enabled .modal-feat-row {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 10px 12px;
            background: var(--sect-bg-secondary);
            border-radius: var(--sect-radius-sm);
            font-size: 13px;
        }

        .sect-beautify-enabled .modal-feat-icon {
            color: var(--sect-accent);
            font-size: 12px;
        }

        .sect-beautify-enabled .modal-feat-icon--jade {
            color: var(--sect-jade);
        }

        .sect-beautify-enabled .modal-feat-icon--orange {
            color: var(--sect-gold);
        }

        /* ============================================
           分页器
           ============================================ */
        .sect-beautify-enabled #psectLogsHistoryPager {
            display: flex;
            gap: 12px;
            margin-top: 16px;
            align-items: center;
            justify-content: center;
        }

        .sect-beautify-enabled #psectLogsHistoryPager button {
            padding: 8px 16px;
            font-size: 13px;
        }

        .sect-beautify-enabled #psectLogsHistoryPager button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* ============================================
           排行榜样式
           ============================================ */
        .sect-beautify-enabled .ranking-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .sect-beautify-enabled .ranking-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 16px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius);
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .ranking-item:hover {
            transform: translateX(4px);
            border-color: var(--sect-accent-light);
        }

        .sect-beautify-enabled .ranking-rank {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            font-size: 13px;
            font-weight: 600;
            color: var(--sect-text-secondary);
            background: var(--sect-bg-secondary);
            flex-shrink: 0;
        }

        .sect-beautify-enabled .ranking-rank.top-1 {
            background: linear-gradient(135deg, #ffd700, #ffb700);
            color: #fff;
            box-shadow: 0 2px 8px rgba(255, 183, 0, 0.3);
        }

        .sect-beautify-enabled .ranking-rank.top-2 {
            background: linear-gradient(135deg, #c0c0c0, #a0a0a0);
            color: #fff;
        }

        .sect-beautify-enabled .ranking-rank.top-3 {
            background: linear-gradient(135deg, #cd7f32, #b87333);
            color: #fff;
        }

        .sect-beautify-enabled .ranking-name {
            flex: 1;
            font-size: 14px;
            color: var(--sect-text-primary);
            font-weight: 500;
        }

        .sect-beautify-enabled .ranking-realm {
            font-size: 12px;
            color: var(--sect-text-muted);
        }

        .sect-beautify-enabled .ranking-detail {
            font-size: 12px;
            color: var(--sect-text-secondary);
        }

        .sect-beautify-enabled .ranking-my-rank {
            text-align: center;
            padding: 12px;
            margin-bottom: 12px;
            background: var(--sect-accent-soft);
            border: 1px solid var(--sect-accent);
            border-radius: var(--sect-radius);
            color: var(--sect-accent);
            font-size: 13px;
        }

        .sect-beautify-enabled .ranking-empty {
            text-align: center;
            padding: 40px 20px;
            color: var(--sect-text-muted);
            font-size: 14px;
        }

        .sect-beautify-enabled .ranking-skeleton {
            opacity: 0.6;
        }

        .sect-beautify-enabled .ranking-pager {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 16px;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--sect-divider);
        }

        .sect-beautify-enabled .pager-btn {
            padding: 8px 16px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius-sm);
            color: var(--sect-text-secondary);
            font-size: 13px;
            cursor: pointer;
            transition: all var(--sect-transition);
        }

        .sect-beautify-enabled .pager-btn:hover:not(:disabled) {
            border-color: var(--sect-accent);
            color: var(--sect-accent);
        }

        .sect-beautify-enabled .pager-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        .sect-beautify-enabled .pager-info {
            font-size: 13px;
            color: var(--sect-text-muted);
        }

        /* ============================================
           弹窗操作按钮
           ============================================ */
        .sect-beautify-enabled .modal-action-btn {
            padding: 10px 20px;
            background: var(--sect-bg-card);
            border: 1px solid var(--sect-border);
            border-radius: var(--sect-radius-sm);
            color: var(--sect-text-secondary);
            font-size: 13px;
            cursor: pointer;
            transition: all var(--sect-transition);
            font-weight: 500;
        }

        .sect-beautify-enabled .modal-action-btn:hover {
            border-color: var(--sect-accent);
            color: var(--sect-accent);
            background: var(--sect-accent-soft);
        }

        .sect-beautify-enabled .modal-action-btn--orange {
            background: var(--sect-gold-soft);
            border-color: var(--sect-gold);
            color: var(--sect-gold);
        }

        .sect-beautify-enabled .modal-action-btn--orange:hover {
            background: var(--sect-gold);
            color: var(--sect-bg-card);
        }

        .sect-beautify-enabled .modal-btn-row {
            display: flex;
            gap: 10px;
            margin-top: 16px;
        }

        /* ============================================
           响应式设计
           ============================================ */
        @media (max-width: 768px) {
            .sect-beautify-enabled .sect-tabs {
                gap: 4px;
                padding: 3px;
            }

            .sect-beautify-enabled .sect-tab {
                padding: 8px 4px;
                font-size: 12px;
            }

            .sect-beautify-enabled .sect-status-grid {
                grid-template-columns: 1fr;
                gap: 8px;
            }

            .sect-beautify-enabled .sect-stat-item {
                padding: 12px;
            }

            .sect-beautify-enabled .sect-info-header {
                padding: 12px 16px;
                flex-direction: column;
                gap: 10px;
                text-align: center;
            }

            .sect-beautify-enabled .sect-task-card {
                flex-direction: column;
                align-items: flex-start;
                gap: 12px;
            }

            .sect-beautify-enabled .sect-task-action {
                align-items: flex-start;
                width: 100%;
                flex-direction: row;
                justify-content: space-between;
            }

            .sect-beautify-enabled .sect-shop-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }

            .sect-beautify-enabled .sect-shop-item-actions {
                width: 100%;
                justify-content: flex-end;
            }

            .sect-beautify-enabled .sect-member-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
            }

            .sect-beautify-enabled .sect-member-stats {
                text-align: left;
                width: 100%;
                display: flex;
                justify-content: space-between;
            }

            .sect-beautify-enabled #sectGardenGrid,
            .sect-beautify-enabled .psect-farm-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .sect-beautify-enabled .psect-stats-grid {
                grid-template-columns: 1fr;
            }

            .sect-beautify-enabled .psect-facility-grid {
                gap: 8px;
            }

            .sect-beautify-enabled .psect-facility-btn {
                min-width: calc(50% - 4px);
                flex: none;
            }

            .sect-beautify-enabled .sect-browse-card__meta {
                flex-direction: column;
                gap: 4px;
            }

            .sect-beautify-enabled .sect-browse-card__actions {
                flex-direction: column;
                width: 100%;
            }

            .sect-theme-toggle {
                bottom: 16px;
                right: 16px;
                width: 44px;
                height: 44px;
            }

            .sect-beautify-enabled .modal-body-padded {
                padding: 16px;
            }
        }

        @media (max-width: 480px) {
            .sect-beautify-enabled .sect-tabs {
                flex-wrap: wrap;
            }

            .sect-beautify-enabled .sect-tab {
                flex: 1 1 calc(33.333% - 4px);
                min-width: 70px;
            }

            .sect-beautify-enabled #sectGardenGrid,
            .sect-beautify-enabled .psect-farm-grid,
            .sect-beautify-enabled .garden-grid {
                grid-template-columns: 1fr;
            }

            .sect-beautify-enabled .psect-facility-btn {
                min-width: 100%;
            }

            .sect-beautify-enabled .sect-donate-toolbar {
                flex-direction: column;
                align-items: stretch;
            }

            .sect-beautify-enabled .sect-donate-row {
                flex-wrap: wrap;
            }

            .sect-beautify-enabled .sect-donate-row__meta {
                width: 100%;
                margin-top: 4px;
            }

            .sect-beautify-enabled .ranking-item {
                flex-wrap: wrap;
                gap: 8px;
            }

            .sect-beautify-enabled .ranking-detail {
                width: 100%;
                margin-top: 4px;
            }

            .sect-beautify-enabled .garden-pot,
            .sect-beautify-enabled .psect-farm-plot {
                padding: 12px 8px;
            }

            .sect-beautify-enabled .sect-member-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
            }

            .sect-beautify-enabled .sect-member-stats {
                width: 100%;
                display: flex;
                justify-content: space-between;
            }
        }

        /* ============================================
           滚动条美化
           ============================================ */
        .sect-beautify-enabled ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        .sect-beautify-enabled ::-webkit-scrollbar-track {
            background: transparent;
        }

        .sect-beautify-enabled ::-webkit-scrollbar-thumb {
            background: var(--sect-border);
            border-radius: 3px;
        }

        .sect-beautify-enabled ::-webkit-scrollbar-thumb:hover {
            background: var(--sect-text-muted);
        }

        /* ============================================
           空状态样式
           ============================================ */
        .sect-beautify-enabled .inventory-empty,
        .sect-beautify-enabled .sect-donate-empty {
            text-align: center;
            padding: 40px 20px;
            color: var(--sect-text-muted);
            font-size: 14px;
        }

        /* ============================================
           加载动画
           ============================================ */
        @keyframes sectPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .sect-beautify-enabled .loading {
            animation: sectPulse 1.5s ease-in-out infinite;
        }

        /* ============================================
           品阶颜色
           ============================================ */
        .sect-beautify-enabled .rarity-1 { color: #6a6a6a; }
        .sect-beautify-enabled .rarity-2 { color: #4a9fc0; }
        .sect-beautify-enabled .rarity-3 { color: #c9a86c; }
        .sect-beautify-enabled .rarity-4 { color: #9b8ab4; }
        .sect-beautify-enabled .rarity-5 { color: #c97b7b; }
    `;

    // ============================================
    // 主题管理器
    // ============================================
    const ThemeManager = {
        currentTheme: null,
        styleEl: null,

        init() {
            this.currentTheme = getSavedTheme();
            this.injectStyles();
            this.applyTheme(this.currentTheme);
            this.createToggleButton();
            this.observePanelChanges();
            this.observeMutations();
        },

        injectStyles() {
            this.styleEl = document.createElement('style');
            this.styleEl.id = 'sect-beautify-styles';
            this.styleEl.textContent = STYLES;
            document.head.appendChild(this.styleEl);
        },

        applyTheme(theme) {
            const root = document.documentElement;
            const themeData = THEMES[theme] || THEMES.light;

            root.classList.remove('sect-theme-light', 'sect-theme-dark');
            root.classList.add(`sect-theme-${theme}`);

            Object.entries(themeData).forEach(([key, value]) => {
                root.style.setProperty(key, value);
            });

            this.markSectPanel();
        },

        markSectPanel() {
            const elements = [
                document.getElementById('sectPanel'),
                document.getElementById('sectJoinedView'),
                document.getElementById('sectUnjoinedView'),
                document.getElementById('sectTabInfo'),
                document.getElementById('sectTabTasks'),
                document.getElementById('sectTabStorage'),
                document.getElementById('sectTabShop'),
                document.getElementById('sectTabGarden'),
                document.getElementById('sectTabMembers'),
            ];

            elements.forEach(el => {
                if (el) el.classList.add('sect-beautify-enabled');
            });

            // 标记模态框
            document.querySelectorAll('.modal-overlay--top, .ui-scrollable-modal').forEach(el => {
                el.classList.add('sect-beautify-enabled');
            });
        },

        toggleTheme() {
            const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
            this.currentTheme = newTheme;
            saveTheme(newTheme);
            this.applyTheme(newTheme);
            this.updateToggleIcon();
        },

        createToggleButton() {
            const existingBtn = document.getElementById('sect-theme-toggle');
            if (existingBtn) existingBtn.remove();

            const btn = document.createElement('button');
            btn.id = 'sect-theme-toggle';
            btn.className = 'sect-theme-toggle';
            btn.title = '切换深浅主题 (宗门美化)';
            btn.innerHTML = this.currentTheme === 'light' ? '🌙' : '☀️';
            btn.addEventListener('click', () => this.toggleTheme());

            document.body.appendChild(btn);
        },

        updateToggleIcon() {
            const btn = document.getElementById('sect-theme-toggle');
            if (btn) {
                btn.innerHTML = this.currentTheme === 'light' ? '🌙' : '☀️';
            }
        },

        observePanelChanges() {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const target = mutation.target;
                        if (target.id && target.id.startsWith('sect')) {
                            if (!target.classList.contains('hidden')) {
                                target.classList.add('sect-beautify-enabled');
                            }
                        }
                    }
                });
            });

            const targets = [
                document.getElementById('sectPanel'),
                document.getElementById('sectJoinedView'),
                document.getElementById('sectUnjoinedView'),
            ];

            targets.forEach(target => {
                if (target) {
                    observer.observe(target, { attributes: true });
                    target.classList.add('sect-beautify-enabled');
                }
            });
        },

        observeMutations() {
            // 监听动态添加的内容
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            // 检查是否是宗门相关元素
                            if (node.id && node.id.startsWith('sect')) {
                                node.classList.add('sect-beautify-enabled');
                            }
                            // 检查子元素
                            if (node.querySelectorAll) {
                                node.querySelectorAll('[id^="sect"]').forEach(el => {
                                    el.classList.add('sect-beautify-enabled');
                                });
                            }
                            // 检查模态框
                            if (node.classList && node.classList.contains('modal-overlay--top')) {
                                node.classList.add('sect-beautify-enabled');
                            }
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // 定期检查
            setInterval(() => this.markSectPanel(), 2000);
        }
    };

    // ============================================
    // 初始化
    // ============================================
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
        } else {
            setTimeout(() => ThemeManager.init(), 500);
        }
    }

    init();

    window.SectBeautify = ThemeManager;
})();

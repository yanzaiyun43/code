// ==UserScript==
// @name         灵界 LingVerse 炼造配置面板 v3.0
// @namespace    lingverse-craft-config
// @version      2.1.4
// @description  炼造自动化配置：支持炼丹/炼器/制符/化身炼造、许愿锁定、自动售卖、深色/浅色模式跟随游戏主题
// @author       You
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const _win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    // ============================================================
    // 配置管理
    // ============================================================
    const CONFIG = {
        // 炼造目标
        targets: {
            alchemy: '',      // 炼丹目标
            forge: '',        // 炼器目标
            talisman: '',     // 制符目标
            incarnation: {    // 化身炼造
                enabled: false,
                type: 'alchemy',  // alchemy/forge/talisman
                target: ''
            }
        },
        // 自动售卖设置
        autoSell: {
            pills: { enabled: false, maxRarity: 2 },
            equipment: { enabled: false, maxRarity: 2, excludeSlots: [], minEnhanceLevel: 0, keepWithAffix: true },
            talismans: { enabled: false, maxRarity: 2 }
        },
        // 许愿锁定
        wishLock: { enabled: false, targetName: '', targetRarity: 4 },
        // 化身设置
        incarnation: {
            autoFeedPills: false,      // 自动喂化身丹药
            autoEquip: false,          // 自动装备
            feedPillType: 'cultivation' // cultivation/hp/mp
        },
        // 通用设置
        general: {
            batchSize: 10,
            useQuickBuy: true,
            maxQuickBuyCost: 5000,
            autoStart: false,
            autoCraftInterval: 30,     // 自动炼制间隔(秒)
            enableLogging: true,
            minimizePanel: false       // 面板最小化
        }
    };

    // ============================================================
    // 状态管理
    // ============================================================
    const STATE = {
        running: false,
        panelOpen: false,
        panelMinimized: false,
        autoCraftTimer: null,
        autoIncarnationTimer: null,
        stats: {
            crafted: 0,
            soldPills: 0,
            soldEquip: 0,
            soldTalismans: 0,
            spent: 0,
            incarnationCrafted: 0,
            pillsFed: 0
        },
        logs: [],
        playerInfo: null,
        incarnationInfo: null
    };

    // ============================================================
    // 缓存数据
    // ============================================================
    const CACHE = {
        alchemy: [],
        forge: [],
        talisman: [],
        inventory: [],
        playerInfo: null,
        incarnationStatus: null,
        lastUpdate: 0
    };

    // ============================================================
    // API 管理 - 基于 api-reference.md 完整实现
    // ============================================================
    const API = {
        get() {
            if (_win.api) return _win.api;
            if (window.api) return window.api;
            if (typeof api !== 'undefined') return api;
            return null;
        },

        async request(method, endpoint, data = null) {
            const api = this.get();
            if (!api) throw new Error('API not available');

            try {
                const res = method === 'GET'
                    ? await api.get(endpoint)
                    : await api.post(endpoint, data);

                if (res.code !== 200) {
                    throw new Error(res.message || `Request failed: ${endpoint}`);
                }
                return res;
            } catch (e) {
                Logger.error(`API ${method} ${endpoint}: ${e.message}`);
                throw e;
            }
        },

        // ==================== 玩家信息 ====================
        async getPlayerInfo() {
            return this.request('GET', '/api/game/player');
        },

        async getInventory() {
            return this.request('GET', '/api/game/inventory');
        },

        // ==================== 炼造配方 ====================
        async getAlchemyRecipes() {
            return this.request('GET', '/api/game/alchemy/recipes');
        },

        async getForgeRecipes() {
            return this.request('GET', '/api/game/forge/recipes');
        },

        async getTalismanRecipes() {
            return this.request('GET', '/api/game/talisman/recipes');
        },

        // ==================== 炼造操作 ====================
        async craftAlchemy(pillId) {
            return this.request('POST', '/api/game/alchemy/craft', { pillId });
        },

        async batchCraftAlchemy(pillId, count) {
            return this.request('POST', '/api/game/alchemy/batch-craft', { pillId, count });
        },

        async craftForge(recipeId) {
            return this.request('POST', '/api/game/forge/craft', { recipeId });
        },

        async batchCraftForge(recipeId, count) {
            return this.request('POST', '/api/game/forge/batch-craft', { recipeId, count });
        },

        async craftTalisman(recipeId) {
            return this.request('POST', '/api/game/talisman/craft', { recipeId });
        },

        async batchCraftTalisman(recipeId, count) {
            return this.request('POST', '/api/game/talisman/batch-craft', { recipeId, count });
        },

        // ==================== 材料补充 ====================
        async quickBuyMats(type, id, amount, preview = false) {
            return this.request('POST', '/api/game/craft/quick-buy-mats', {
                type, id, amount, preview
            });
        },

        // ==================== 出售物品 ====================
        async sellItems(items) {
            return this.request('POST', '/api/game/inventory/sell', { items });
        },

        // ==================== 许愿 ====================
        async setWishTarget(targetId) {
            return this.request('POST', '/api/game/crafting/wish', { targetId });
        },

        // ==================== 化身系统 ====================
        async getIncarnationStatus() {
            return this.request('GET', '/api/game/incarnation/status');
        },

        async toggleIncarnationCraft(enabled) {
            return this.request('POST', '/api/game/incarnation/toggle-craft', { enabled });
        },

        async condenseIncarnation() {
            return this.request('POST', '/api/game/incarnation/condense');
        },

        async refineIncarnation() {
            return this.request('POST', '/api/game/incarnation/refine');
        },

        async breakthroughIncarnation() {
            return this.request('POST', '/api/game/incarnation/breakthrough');
        },

        async getIncarnationCultivationPills() {
            return this.request('GET', '/api/game/incarnation/cultivation-pills');
        },

        async consumeIncarnationPill(pillId, quantity = 1) {
            return this.request('POST', '/api/game/incarnation/consume-pill', { pillId, quantity });
        },

        async consumeAllIncarnationPills(pillId) {
            return this.request('POST', '/api/game/incarnation/consume-pill-all', { pillId });
        },

        async getIncarnationAvailableEquip() {
            return this.request('GET', '/api/game/incarnation/available-equip');
        },

        async equipIncarnation(itemId) {
            return this.request('POST', '/api/game/incarnation/equip', { itemId });
        },

        async unequipIncarnation(slot) {
            return this.request('POST', '/api/game/incarnation/unequip', { slot });
        },

        async renameIncarnation(name) {
            return this.request('POST', '/api/game/incarnation/rename', { name });
        },

        // ==================== 师徒炼造目标 ====================
        async getMasterCraftTargets() {
            return this.request('GET', '/api/master/craft-targets');
        }
    };

    // ============================================================
    // 日志系统
    // ============================================================
    const Logger = {
        log(msg, type = 'info') {
            if (!CONFIG.general.enableLogging) return;

            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            const colors = {
                info: Theme.isDark() ? '#60a0e0' : '#3a5a8a',
                success: Theme.isDark() ? '#3dab97' : '#3a8a6a',
                warn: Theme.isDark() ? '#e0a030' : '#b08520',
                error: Theme.isDark() ? '#e06060' : '#c04040'
            };

            console.log(`%c[炼造助手 ${time}] %c${msg}`, 'color:#888', `color:${colors[type] || colors.info}`);

            STATE.logs.push({ time, msg, type });
            if (STATE.logs.length > 100) STATE.logs.shift();

            UI.updateLogPanel();
        },

        info(msg) { this.log(msg, 'info'); },
        success(msg) { this.log(msg, 'success'); },
        warn(msg) { this.log(msg, 'warn'); },
        error(msg) { this.log(msg, 'error'); }
    };

    // ============================================================
    // 主题管理
    // ============================================================
    const Theme = {
        getCurrent() {
            const html = document.documentElement;
            if (html.classList.contains('theme-dark')) return 'dark';
            if (html.classList.contains('theme-light')) return 'light';
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        },

        isDark() {
            return this.getCurrent() === 'dark';
        },

        initObserver() {
            const observer = new MutationObserver(() => {
                UI.updateTheme();
            });
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class']
            });

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                UI.updateTheme();
            });
        },

        getVars() {
            const isDark = this.isDark();
            return {
                // 主题标识
                isDark,

                // 背景色
                bgPrimary: isDark ? '#0a0f1c' : '#f3f2f0',
                bgSecondary: isDark ? '#111827' : '#eae9e7',
                bgCard: isDark ? '#151d2e' : '#f9f9f8',
                bgCardHover: isDark ? '#1a2540' : '#eeedeb',
                bgPanel: isDark ? '#0e1525' : '#f0efed',
                bgInput: isDark ? '#0d1420' : '#ffffff',

                // 边框
                borderColor: isDark ? 'rgba(201, 153, 58, 0.15)' : 'rgba(60, 60, 60, 0.12)',
                borderGold: isDark ? 'rgba(201, 153, 58, 0.3)' : 'rgba(140, 60, 50, 0.25)',
                borderActive: isDark ? 'rgba(201, 153, 58, 0.5)' : 'rgba(140, 60, 50, 0.4)',

                // 文字
                textPrimary: isDark ? '#e8e0d0' : '#1a1a1a',
                textSecondary: isDark ? '#a8a090' : '#4a5a5a',
                textMuted: isDark ? '#6a6560' : '#8a9090',
                textGold: isDark ? '#c9993a' : '#b8463e',
                textJade: isDark ? '#3dab97' : '#3a6a7a',
                textPurple: isDark ? '#9a6ae0' : '#6a5a8a',
                textRed: isDark ? '#e06060' : '#c04040',
                textBlue: isDark ? '#60a0e0' : '#3a5a8a',
                textGreen: isDark ? '#4ade80' : '#16a34a',

                // 强调色
                accentGold: isDark ? '#c9993a' : '#b8463e',
                accentJade: isDark ? '#3dab97' : '#3a6a7a',
                accentPurple: isDark ? '#9a6ae0' : '#6a5a8a',
                accentRed: isDark ? '#e06060' : '#c04040',

                // 渐变
                gradientGold: isDark
                    ? 'linear-gradient(135deg, #8a6a20 0%, #c9993a 50%, #8a6a20 100%)'
                    : 'linear-gradient(135deg, #b84a40 0%, #d06858 50%, #b84a40 100%)',
                gradientJade: isDark
                    ? 'linear-gradient(135deg, #1a6b5a 0%, #3dab97 100%)'
                    : 'linear-gradient(135deg, #3a6a7a 0%, #5a8a9a 100%)',
                gradientPurple: isDark
                    ? 'linear-gradient(135deg, #6a3a9a 0%, #9a6ae0 100%)'
                    : 'linear-gradient(135deg, #5a4a7a 0%, #7a6a9a 100%)',

                // 阴影
                shadowSm: isDark ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 12px rgba(40, 40, 40, 0.06)',
                shadowMd: isDark ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 4px 20px rgba(40, 40, 40, 0.08)',
                shadowLg: isDark ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 8px 40px rgba(40, 40, 40, 0.12)',
                shadowGlow: isDark ? '0 0 20px rgba(201, 153, 58, 0.15)' : '0 0 20px rgba(184, 70, 62, 0.1)',

                // 稀有度颜色
                rarity: {
                    1: isDark ? '#9ca3af' : '#6b7280',  // 普通 - 灰
                    2: isDark ? '#60a5fa' : '#3b82f6',  // 优良 - 蓝
                    3: isDark ? '#fbbf24' : '#d97706',  // 稀有 - 金
                    4: isDark ? '#c084fc' : '#9333ea',  // 史诗 - 紫
                    5: isDark ? '#f87171' : '#dc2626'   // 传说 - 红
                },

                rarityNames: ['', '普通', '优良', '稀有', '史诗', '传说']
            };
        }
    };

    // ============================================================
    // UI 管理
    // ============================================================
    const UI = {
        elements: {},

        updateTheme() {
            const panel = $('#lv-craft-panel');
            if (!panel) return;

            const v = Theme.getVars();

            // 更新面板
            panel.style.background = v.bgPanel;
            panel.style.borderColor = v.borderGold;
            panel.style.color = v.textPrimary;
            panel.style.boxShadow = v.shadowLg;

            // 更新标题栏
            const header = $('#lv-panel-header');
            if (header) {
                header.style.background = v.gradientGold;
            }

            // 更新所有动态元素
            this.refreshDynamicStyles();
        },

        refreshDynamicStyles() {
            const v = Theme.getVars();

            // 更新按钮
            $$('.lv-btn-primary').forEach(btn => {
                btn.style.background = v.gradientGold;
            });

            $$('.lv-btn-secondary').forEach(btn => {
                btn.style.background = v.bgCard;
                btn.style.borderColor = v.borderGold;
                btn.style.color = v.textGold;
            });

            $$('.lv-btn-jade').forEach(btn => {
                btn.style.background = v.gradientJade;
            });

            // 更新输入框
            $$('.lv-select, .lv-input').forEach(el => {
                el.style.background = v.bgInput;
                el.style.borderColor = v.borderColor;
                el.style.color = v.textPrimary;
            });

            // 更新卡片
            $$('.lv-card').forEach(card => {
                card.style.background = v.bgCard;
                card.style.borderColor = v.borderColor;
            });

            // 更新日志
            const logPanel = $('#lv-log-panel');
            if (logPanel) {
                logPanel.style.background = v.bgCard;
                logPanel.style.borderColor = v.borderColor;
            }
        },

        createSidebarButton() {
            if ($('#lv-craft-sidebar-btn')) return;

            const v = Theme.getVars();
            const btn = document.createElement('button');
            btn.id = 'lv-craft-sidebar-btn';
            btn.innerHTML = '<span style="font-size:16px;margin-right:6px;">🔥</span>炼造';
            btn.style.cssText = `
                width: 100%;
                padding: 10px 12px;
                margin-top: 12px;
                background: ${v.isDark ? 'rgba(201, 153, 58, 0.15)' : 'rgba(184, 70, 62, 0.1)'};
                border: 1px solid ${v.isDark ? 'rgba(201, 153, 58, 0.3)' : 'rgba(184, 70, 62, 0.25)'};
                border-radius: 8px;
                color: ${v.textGold};
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                -webkit-tap-highlight-color: transparent;
                font-family: KaiTi, 楷体, STKaiti, "Noto Serif SC", serif;
            `;

            btn.addEventListener('mouseenter', () => {
                btn.style.background = v.isDark ? 'rgba(201, 153, 58, 0.25)' : 'rgba(184, 70, 62, 0.2)';
                btn.style.borderColor = v.isDark ? 'rgba(201, 153, 58, 0.5)' : 'rgba(184, 70, 62, 0.4)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = v.isDark ? 'rgba(201, 153, 58, 0.15)' : 'rgba(184, 70, 62, 0.1)';
                btn.style.borderColor = v.isDark ? 'rgba(201, 153, 58, 0.3)' : 'rgba(184, 70, 62, 0.25)';
            });

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePanel();
            });

            // 插入到侧边栏底部
            this.insertToSidebar(btn);
        },

        insertToSidebar(btn) {
            // 尝试找到角色信息栏（第一个 panel-section）
            const playerPanel = $('.player-panel') || $('#playerPanel');
            if (playerPanel) {
                const firstSection = playerPanel.querySelector('.panel-section');
                if (firstSection) {
                    // 检查是否已有该按钮
                    if (playerPanel.querySelector('#lv-craft-sidebar-btn')) {
                        return;
                    }

                    // 创建按钮容器，放在panel-section内部，避免被边框截断
                    const btnContainer = document.createElement('div');
                    btnContainer.style.cssText = `
                        padding: 0 16px 16px 16px;
                        margin: -10px 0 0 0;
                        border-bottom: 1px solid var(--border-color);
                    `;
                    btnContainer.appendChild(btn);

                    // 在第一个panel-section内部末尾插入
                    firstSection.appendChild(btnContainer);
                    return;
                }
            }

            // 备用方案：插入到侧边栏底部
            const sidebar = $('.player-panel') || $('#playerPanel') || $('.sidebar') || $('#sidebar');
            if (sidebar) {
                if (!sidebar.querySelector('#lv-craft-sidebar-btn')) {
                    sidebar.appendChild(btn);
                }
                return;
            }

            // 如果找不到侧边栏，延迟重试
            setTimeout(() => this.insertToSidebar(btn), 1000);
        },

        async createPanel() {
            if ($('#lv-craft-panel')) {
                this.togglePanel();
                return;
            }

            const v = Theme.getVars();
            const panel = document.createElement('div');
            panel.id = 'lv-craft-panel';
            panel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 95%;
                max-width: 480px;
                max-height: 90vh;
                z-index: 100000;
                background: ${v.bgPanel};
                border: 2px solid ${v.borderGold};
                border-radius: 16px;
                font-size: 13px;
                color: ${v.textPrimary};
                box-shadow: ${v.shadowLg};
                display: none;
                flex-direction: column;
                overflow: hidden;
                font-family: KaiTi, 楷体, STKaiti, "Noto Serif SC", serif;
                transition: all 0.3s ease;
            `;

            // 先生成面板HTML（使用空数据）
            panel.innerHTML = this.generatePanelHTML();
            document.body.appendChild(panel);

            this.bindPanelEvents();
            this.loadConfigToPanel();
            this.makePanelDraggable();
            this.updateTheme();

            // 显示面板
            this.togglePanel();

            // 异步加载数据并更新下拉框
            this.loadRecipesAsync();
        },

        async loadRecipesAsync() {
            try {
                Logger.info('正在加载配方数据...');
                await CraftManager.loadRecipes();
                await CraftManager.loadIncarnationStatus();

                // 更新下拉框选项
                this.updateRecipeSelects();
                Logger.success('配方数据加载完成');
            } catch (e) {
                Logger.error('加载配方失败: ' + e.message);
            }
        },

        updateRecipeSelects() {
            const alchemySelect = $('#lv-alchemy-target');
            const forgeSelect = $('#lv-forge-target');
            const talismanSelect = $('#lv-talisman-target');

            if (alchemySelect) {
                const currentValue = alchemySelect.value;
                alchemySelect.innerHTML = this.generateOptions(CACHE.alchemy, 'pillName');
                if (currentValue) alchemySelect.value = currentValue;
            }
            if (forgeSelect) {
                const currentValue = forgeSelect.value;
                forgeSelect.innerHTML = this.generateOptions(CACHE.forge, 'name');
                if (currentValue) forgeSelect.value = currentValue;
            }
            if (talismanSelect) {
                const currentValue = talismanSelect.value;
                talismanSelect.innerHTML = this.generateOptions(CACHE.talisman, 'name');
                if (currentValue) talismanSelect.value = currentValue;
            }
        },

        generatePanelHTML() {
            const v = Theme.getVars();

            return `
                <!-- 标题栏 -->
                <div id="lv-panel-header" style="
                    background: ${v.gradientGold};
                    padding: 14px 18px;
                    border-bottom: 2px solid ${v.accentGold};
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    -webkit-user-select: none;
                    user-select: none;
                ">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">🔥</span>
                        <span style="font-weight: bold; color: #fff; text-shadow: 1px 1px 2px rgba(0,0,0,0.4); font-size: 16px;">自动炼造</span>
                        <span id="lv-run-status" style="
                            margin-left: 8px;
                            font-size: 11px;
                            color: ${v.textPrimary};
                            background: ${v.bgCard};
                            padding: 3px 10px;
                            border-radius: 12px;
                            font-weight: bold;
                            box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
                        ">⏹ 未运行</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="lv-btn-minimize" style="
                            background: rgba(255,255,255,0.2);
                            border: 1px solid rgba(255,255,255,0.4);
                            color: #fff;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            cursor: pointer;
                            font-size: 16px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            -webkit-tap-highlight-color: transparent;
                            transition: all 0.2s;
                        ">−</button>
                        <button id="lv-btn-close" style="
                            background: rgba(255,255,255,0.2);
                            border: 1px solid rgba(255,255,255,0.4);
                            color: #fff;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            cursor: pointer;
                            font-size: 18px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            -webkit-tap-highlight-color: transparent;
                            transition: all 0.2s;
                        ">×</button>
                    </div>
                </div>

                <!-- 内容区 -->
                <div id="lv-panel-content" style="
                    padding: 16px;
                    overflow-y: auto;
                    flex: 1;
                    -webkit-overflow-scrolling: touch;
                ">
                    <!-- 炼造目标区 -->
                    <div class="lv-section" style="margin-bottom: 16px;">
                        <div style="
                            font-size: 13px;
                            color: ${v.textGold};
                            margin-bottom: 12px;
                            font-weight: bold;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            padding-bottom: 8px;
                            border-bottom: 1px solid ${v.borderColor};
                        ">
                            <span>🎯</span> 炼造目标
                        </div>

                        <!-- 炼丹 -->
                        <div style="margin-bottom: 12px;">
                            <div style="
                                font-size: 12px;
                                color: ${v.textJade};
                                margin-bottom: 6px;
                                font-weight: bold;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                            ">💊 炼丹</div>
                            <select id="lv-target-alchemy" class="lv-select" style="
                                width: 100%;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 10px 12px;
                                border-radius: 8px;
                                font-size: 13px;
                                outline: none;
                                cursor: pointer;
                                transition: all 0.2s;
                            ">
                                <option value="">-- 不自动炼丹 --</option>
                                ${this.generateRecipeOptions(CACHE.alchemy, 'pillName', 'alchemy')}
                            </select>
                        </div>

                        <!-- 炼器 -->
                        <div style="margin-bottom: 12px;">
                            <div style="
                                font-size: 12px;
                                color: ${v.textGold};
                                margin-bottom: 6px;
                                font-weight: bold;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                            ">⚔️ 炼器</div>
                            <select id="lv-target-forge" class="lv-select" style="
                                width: 100%;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 10px 12px;
                                border-radius: 8px;
                                font-size: 13px;
                                outline: none;
                                cursor: pointer;
                                transition: all 0.2s;
                            ">
                                <option value="">-- 不自动炼器 --</option>
                                ${this.generateRecipeOptions(CACHE.forge, 'name', 'forge')}
                            </select>
                        </div>

                        <!-- 制符 -->
                        <div style="margin-bottom: 12px;">
                            <div style="
                                font-size: 12px;
                                color: ${v.textPurple};
                                margin-bottom: 6px;
                                font-weight: bold;
                                display: flex;
                                align-items: center;
                                gap: 4px;
                            ">📜 制符</div>
                            <select id="lv-target-talisman" class="lv-select" style="
                                width: 100%;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 10px 12px;
                                border-radius: 8px;
                                font-size: 13px;
                                outline: none;
                                cursor: pointer;
                                transition: all 0.2s;
                            ">
                                <option value="">-- 不自动制符 --</option>
                                ${this.generateRecipeOptions(CACHE.talisman, 'name', 'talisman')}
                            </select>
                        </div>

                        <!-- 刷新按钮 -->
                        <button id="lv-btn-refresh" class="lv-btn-secondary" style="
                            width: 100%;
                            background: ${v.bgCard};
                            border: 1px solid ${v.borderGold};
                            color: ${v.textGold};
                            padding: 10px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: bold;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 6px;
                            transition: all 0.2s;
                        ">
                            🔄 刷新配方列表
                        </button>
                    </div>

                    <!-- 化身炼造区 -->
                    <div class="lv-card" style="
                        margin-bottom: 16px;
                        padding: 14px;
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 12px;
                    ">
                        <div style="
                            font-size: 13px;
                            color: ${v.textGold};
                            margin-bottom: 12px;
                            font-weight: bold;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            padding-bottom: 8px;
                            border-bottom: 1px solid ${v.borderColor};
                        ">
                            <span>👤</span> 化身炼造
                            <span id="lv-incarnation-status" style="
                                font-size: 10px;
                                color: ${v.textMuted};
                                font-weight: normal;
                                margin-left: auto;
                            ">检测中...</span>
                        </div>

                        <label style="
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            margin-bottom: 12px;
                            cursor: pointer;
                        ">
                            <input type="checkbox" id="lv-incarnation-enabled" style="
                                width: 18px;
                                height: 18px;
                                accent-color: ${v.accentPurple};
                            ">
                            <span style="font-size: 12px;">启用化身自动炼造</span>
                        </label>

                        <div style="margin-bottom: 10px;">
                            <span style="font-size: 11px; color: ${v.textSecondary};">炼造类型:</span>
                            <select id="lv-incarnation-type" class="lv-select" style="
                                width: 100%;
                                margin-top: 6px;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 8px 10px;
                                border-radius: 6px;
                                font-size: 12px;
                            ">
                                <option value="alchemy">💊 炼丹</option>
                                <option value="forge">⚔️ 炼器</option>
                                <option value="talisman">📜 制符</option>
                            </select>
                        </div>

                        <div style="margin-bottom: 10px;">
                            <span style="font-size: 11px; color: ${v.textSecondary};">炼造目标:</span>
                            <select id="lv-incarnation-target" class="lv-select" style="
                                width: 100%;
                                margin-top: 6px;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 8px 10px;
                                border-radius: 6px;
                                font-size: 12px;
                            ">
                                <option value="">-- 选择目标 --</option>
                            </select>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
                            <button id="lv-btn-incarnation-condense" class="lv-btn-secondary" style="
                                background: ${v.bgCard};
                                border: 1px solid ${v.borderGold};
                                color: ${v.textGold};
                                padding: 8px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 11px;
                                font-weight: bold;
                            ">凝聚化身</button>
                            <button id="lv-btn-incarnation-refine" class="lv-btn-secondary" style="
                                background: ${v.bgCard};
                                border: 1px solid ${v.borderGold};
                                color: ${v.textGold};
                                padding: 8px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 11px;
                                font-weight: bold;
                            ">精炼化身</button>
                        </div>
                    </div>

                    <!-- 自动售卖区 -->
                    <div class="lv-card" style="
                        margin-bottom: 16px;
                        padding: 14px;
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 12px;
                    ">
                        <div style="
                            font-size: 13px;
                            color: ${v.textGold};
                            margin-bottom: 12px;
                            font-weight: bold;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            padding-bottom: 8px;
                            border-bottom: 1px solid ${v.borderColor};
                        ">
                            <span>💰</span> 自动售卖
                        </div>

                        <!-- 卖丹药 -->
                        <label style="
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            margin-bottom: 10px;
                            cursor: pointer;
                        ">
                            <input type="checkbox" id="lv-autosell-pills" style="
                                width: 18px;
                                height: 18px;
                                accent-color: ${v.accentJade};
                            ">
                            <span style="color: ${v.textJade}; font-weight: bold; font-size: 12px;">💊 丹药</span>
                            <span style="color: ${v.textMuted}; font-size: 11px;">≤</span>
                            <select id="lv-autosell-pills-rarity" class="lv-select" style="
                                flex: 1;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 6px 10px;
                                border-radius: 6px;
                                font-size: 12px;
                            ">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>

                        <!-- 卖装备 -->
                        <label style="
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            margin-bottom: 10px;
                            cursor: pointer;
                        ">
                            <input type="checkbox" id="lv-autosell-equip" style="
                                width: 18px;
                                height: 18px;
                                accent-color: ${v.accentGold};
                            ">
                            <span style="color: ${v.textGold}; font-weight: bold; font-size: 12px;">⚔️ 装备</span>
                            <span style="color: ${v.textMuted}; font-size: 11px;">≤</span>
                            <select id="lv-autosell-equip-rarity" class="lv-select" style="
                                flex: 1;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 6px 10px;
                                border-radius: 6px;
                                font-size: 12px;
                            ">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>

                        <!-- 卖符箓 -->
                        <label style="
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            cursor: pointer;
                        ">
                            <input type="checkbox" id="lv-autosell-talismans" style="
                                width: 18px;
                                height: 18px;
                                accent-color: ${v.accentPurple};
                            ">
                            <span style="color: ${v.textPurple}; font-weight: bold; font-size: 12px;">📜 符箓</span>
                            <span style="color: ${v.textMuted}; font-size: 11px;">≤</span>
                            <select id="lv-autosell-talismans-rarity" class="lv-select" style="
                                flex: 1;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 6px 10px;
                                border-radius: 6px;
                                font-size: 12px;
                            ">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>
                    </div>

                    <!-- 设置区 -->
                    <div class="lv-card" style="
                        margin-bottom: 16px;
                        padding: 14px;
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 12px;
                    ">
                        <div style="
                            font-size: 13px;
                            color: ${v.textGold};
                            margin-bottom: 12px;
                            font-weight: bold;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            padding-bottom: 8px;
                            border-bottom: 1px solid ${v.borderColor};
                        ">
                            <span>⚙️</span> 设置
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-use-quickbuy" checked style="accent-color: ${v.accentGold};">
                                <span style="font-size: 12px;">自动补充材料</span>
                            </label>

                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-auto-start" style="accent-color: ${v.accentGold};">
                                <span style="font-size: 12px;">自动开始</span>
                            </label>
                        </div>

                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                            <span style="font-size: 12px; color: ${v.textSecondary};">批量数量:</span>
                            <input type="number" id="lv-batch-size" value="10" min="1" max="50" style="
                                width: 70px;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 6px 10px;
                                border-radius: 6px;
                                font-size: 13px;
                                text-align: center;
                            ">
                            <span style="font-size: 12px; color: ${v.textSecondary};">最大补充:</span>
                            <input type="number" id="lv-max-cost" value="5000" min="0" step="100" style="
                                width: 90px;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 6px 10px;
                                border-radius: 6px;
                                font-size: 13px;
                                text-align: center;
                            ">
                        </div>

                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 12px; color: ${v.textSecondary};">执行间隔:</span>
                            <input type="number" id="lv-interval" value="30" min="5" max="300" style="
                                width: 70px;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 6px 10px;
                                border-radius: 6px;
                                font-size: 13px;
                                text-align: center;
                            ">
                            <span style="font-size: 12px; color: ${v.textMuted};">秒</span>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                        <button id="lv-btn-start" class="lv-btn-primary" style="
                            flex: 1;
                            background: ${v.gradientGold};
                            border: none;
                            color: #fff;
                            padding: 12px 16px;
                            border-radius: 10px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                            box-shadow: ${v.shadowSm};
                            transition: all 0.2s;
                            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                        ">▶ 开始炼造</button>

                        <button id="lv-btn-once" class="lv-btn-jade" style="
                            background: ${v.gradientJade};
                            border: none;
                            color: #fff;
                            padding: 12px 16px;
                            border-radius: 10px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                            box-shadow: ${v.shadowSm};
                            transition: all 0.2s;
                            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                        ">⚡ 执行一次</button>

                        <button id="lv-btn-save" class="lv-btn-secondary" style="
                            background: ${v.bgCard};
                            border: 1px solid ${v.borderGold};
                            color: ${v.textGold};
                            padding: 12px 16px;
                            border-radius: 10px;
                            cursor: pointer;
                            font-size: 13px;
                            font-weight: bold;
                            transition: all 0.2s;
                        ">💾</button>
                    </div>

                    <!-- 统计信息 -->
                    <div id="lv-stats" style="
                        margin-bottom: 12px;
                        padding: 12px 14px;
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 10px;
                        font-size: 12px;
                        color: ${v.textSecondary};
                        display: flex;
                        justify-content: space-around;
                        flex-wrap: wrap;
                        gap: 8px;
                    ">
                        <span>炼造: <b id="lv-stat-crafted" style="color: ${v.textJade};">0</b></span>
                        <span>化身: <b id="lv-stat-incarnation" style="color: ${v.textPurple};">0</b></span>
                        <span>售出: <b id="lv-stat-sold" style="color: ${v.textGold};">0</b></span>
                        <span>花费: <b id="lv-stat-spent" style="color: ${v.textRed};">0</b></span>
                    </div>

                    <!-- 日志面板 -->
                    <div id="lv-log-panel" style="
                        max-height: 150px;
                        overflow-y: auto;
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 10px;
                        padding: 12px;
                        font-size: 11px;
                        font-family: 'Consolas', 'Monaco', monospace;
                        display: none;
                        line-height: 1.5;
                    "></div>
                </div>
            `;
        },

        generateRecipeOptions(recipes, nameField, type) {
            if (!recipes || recipes.length === 0) {
                return '<option value="">暂无可用配方</option>';
            }

            const groups = {};
            recipes.forEach(r => {
                const category = r.category || r.slot || r.type || '其他';
                if (!groups[category]) groups[category] = [];
                groups[category].push(r);
            });

            let html = '';
            const categoryNames = {
                'HEAL_HP': '回血丹药', 'HEAL_MP': '回灵丹药', 'HEAL_SPIRIT': '回神识丹药',
                'BREAKTHROUGH': '突破丹药', 'COMBAT_ATK': '战斗丹(攻)', 'COMBAT_DEF': '战斗丹(防)',
                'SPECIAL_ANTIDOTE': '解毒丹', 'SPECIAL_PERMANENT_HP': '永久HP丹',
                'SPECIAL_PERMANENT_ATK': '永久攻击丹', 'SPECIAL_MEDITATION': '清心丹',
                'SPECIAL_FIVE_ROOT': '五行通灵丹', 'ENCOUNTER_BOOST': '招妖丹药',
                'ENCOUNTER_REPEL': '避妖丹药', 'INCARNATION_CULTIVATION': '化身修为丹药',
                'PET_HEAL_HP': '灵兽回血丹', 'PET_HEAL_MP': '灵兽回灵丹', 'PET_HEAL_BOTH': '灵兽双补丹',
                'WEAPON': '武器', 'ARMOR': '防具', 'ACCESSORY': '饰品', 'RING': '储物戒',
                'ATTACK': '攻伐符箓', 'DEFENSE': '防御符箓', 'UTILITY': '功能符箓',
                '秘传图纸': '秘传图纸'
            };

            for (const [category, items] of Object.entries(groups)) {
                const catName = categoryNames[category] || category;
                html += `<optgroup label="${catName}">`;

                items.forEach(r => {
                    const name = r[nameField] || r.name || '未知';
                    const canCraft = r.canCraft || r.canForge;
                    let status = '';
                    let color = '';

                    if (canCraft) {
                        status = '';
                        color = '';
                    } else if (r.canQuickBuy) {
                        status = ` [可补充${r.quickBuyCost}灵石]`;
                        color = ` style="color: ${Theme.getVars().textJade}"`;
                    } else if (r.disableReason === 'stage_low') {
                        status = ' [境界不足]';
                        color = ` style="color: ${Theme.getVars().textMuted}"`;
                    } else if (r.disableReason === 'furnace_low') {
                        status = ' [炉子等级不足]';
                        color = ` style="color: ${Theme.getVars().textMuted}"`;
                    } else if (r.disableReason === 'need_furnace') {
                        status = ' [需炼丹炉]';
                        color = ` style="color: ${Theme.getVars().textMuted}"`;
                    } else if (r.disableReason === 'no_mp') {
                        status = ' [灵力不足]';
                        color = ` style="color: ${Theme.getVars().textMuted}"`;
                    } else {
                        status = ' [未解锁]';
                        color = ` style="color: ${Theme.getVars().textMuted}"`;
                    }

                    html += `<option value="${name}"${color}>${name}${status}</option>`;
                });

                html += '</optgroup>';
            }

            return html;
        },

        bindPanelEvents() {
            // 关闭按钮
            $('#lv-btn-close')?.addEventListener('click', () => this.togglePanel());

            // 最小化按钮
            $('#lv-btn-minimize')?.addEventListener('click', () => this.toggleMinimize());

            // 刷新按钮
            $('#lv-btn-refresh')?.addEventListener('click', async () => {
                const btn = $('#lv-btn-refresh');
                btn.textContent = '🔄 刷新中...';
                btn.disabled = true;
                await CraftManager.loadRecipes();
                this.refreshRecipeSelects();
                btn.textContent = '🔄 刷新配方列表';
                btn.disabled = false;
            });

            // 化身类型切换
            $('#lv-incarnation-type')?.addEventListener('change', () => {
                this.updateIncarnationTargetSelect();
            });

            // 化身操作按钮
            $('#lv-btn-incarnation-condense')?.addEventListener('click', async () => {
                try {
                    const res = await API.condenseIncarnation();
                    if (res.code === 200) {
                        Logger.success('化身凝聚成功');
                        await CraftManager.loadIncarnationStatus();
                    }
                } catch (e) {
                    Logger.error('化身凝聚失败: ' + e.message);
                }
            });

            $('#lv-btn-incarnation-refine')?.addEventListener('click', async () => {
                try {
                    const res = await API.refineIncarnation();
                    if (res.code === 200) {
                        Logger.success('化身精炼成功');
                        await CraftManager.loadIncarnationStatus();
                    }
                } catch (e) {
                    Logger.error('化身精炼失败: ' + e.message);
                }
            });

            // 开始/停止按钮
            $('#lv-btn-start')?.addEventListener('click', () => {
                if (STATE.running) {
                    CraftManager.stop();
                } else {
                    CraftManager.start();
                }
            });

            // 执行一次按钮
            $('#lv-btn-once')?.addEventListener('click', () => {
                this.saveConfigFromPanel();
                CraftManager.executeOnce();
            });

            // 保存按钮
            $('#lv-btn-save')?.addEventListener('click', () => {
                this.saveConfigFromPanel();
                Logger.success('配置已保存');
            });
        },

        updateIncarnationTargetSelect() {
            const type = $('#lv-incarnation-type')?.value || 'alchemy';
            const select = $('#lv-incarnation-target');
            if (!select) return;

            const cache = type === 'alchemy' ? CACHE.alchemy :
                         type === 'forge' ? CACHE.forge : CACHE.talisman;
            const nameField = type === 'alchemy' ? 'pillName' : 'name';

            select.innerHTML = '<option value="">-- 选择目标 --</option>' +
                this.generateRecipeOptions(cache, nameField, type);
        },

        makePanelDraggable() {
            const header = $('#lv-panel-header');
            const panel = $('#lv-craft-panel');
            if (!header || !panel) return;

            let isDragging = false;
            let startX, startY, startLeft, startTop;

            header.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = panel.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                panel.style.transform = 'none';
                panel.style.left = startLeft + 'px';
                panel.style.top = startTop + 'px';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                panel.style.left = (startLeft + dx) + 'px';
                panel.style.top = (startTop + dy) + 'px';
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
        },

        togglePanel() {
            const panel = $('#lv-craft-panel');
            if (!panel) {
                this.createPanel();
                return;
            }

            STATE.panelOpen = !STATE.panelOpen;
            panel.style.display = STATE.panelOpen ? 'flex' : 'none';

            if (STATE.panelOpen) {
                this.refreshRecipeSelects();
                this.updateIncarnationTargetSelect();
                this.updateIncarnationStatus();
            }
        },

        toggleMinimize() {
            const content = $('#lv-panel-content');
            const btn = $('#lv-btn-minimize');
            if (!content || !btn) return;

            STATE.panelMinimized = !STATE.panelMinimized;
            content.style.display = STATE.panelMinimized ? 'none' : 'block';
            btn.textContent = STATE.panelMinimized ? '+' : '−';
        },

        saveConfigFromPanel() {
            CONFIG.targets.alchemy = $('#lv-target-alchemy')?.value || '';
            CONFIG.targets.forge = $('#lv-target-forge')?.value || '';
            CONFIG.targets.talisman = $('#lv-target-talisman')?.value || '';

            CONFIG.targets.incarnation.enabled = $('#lv-incarnation-enabled')?.checked || false;
            CONFIG.targets.incarnation.type = $('#lv-incarnation-type')?.value || 'alchemy';
            CONFIG.targets.incarnation.target = $('#lv-incarnation-target')?.value || '';

            CONFIG.autoSell.pills.enabled = $('#lv-autosell-pills')?.checked || false;
            CONFIG.autoSell.pills.maxRarity = parseInt($('#lv-autosell-pills-rarity')?.value || '2');

            CONFIG.autoSell.equipment.enabled = $('#lv-autosell-equip')?.checked || false;
            CONFIG.autoSell.equipment.maxRarity = parseInt($('#lv-autosell-equip-rarity')?.value || '2');

            CONFIG.autoSell.talismans.enabled = $('#lv-autosell-talismans')?.checked || false;
            CONFIG.autoSell.talismans.maxRarity = parseInt($('#lv-autosell-talismans-rarity')?.value || '2');

            CONFIG.general.useQuickBuy = $('#lv-use-quickbuy')?.checked !== false;
            CONFIG.general.autoStart = $('#lv-auto-start')?.checked || false;
            CONFIG.general.batchSize = parseInt($('#lv-batch-size')?.value || '10');
            CONFIG.general.maxQuickBuyCost = parseInt($('#lv-max-cost')?.value || '5000');
            CONFIG.general.autoCraftInterval = parseInt($('#lv-interval')?.value || '30');

            localStorage.setItem('lv_craft_config_v3', JSON.stringify(CONFIG));
        },

        loadConfigToPanel() {
            const saved = localStorage.getItem('lv_craft_config_v3');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    Object.assign(CONFIG, parsed);
                } catch (e) {
                    Logger.error('加载配置失败');
                }
            }

            const setValue = (id, value) => {
                const el = $(id);
                if (el) el.value = value;
            };

            const setChecked = (id, checked) => {
                const el = $(id);
                if (el) el.checked = checked;
            };

            setValue('#lv-target-alchemy', CONFIG.targets.alchemy);
            setValue('#lv-target-forge', CONFIG.targets.forge);
            setValue('#lv-target-talisman', CONFIG.targets.talisman);

            setChecked('#lv-incarnation-enabled', CONFIG.targets.incarnation.enabled);
            setValue('#lv-incarnation-type', CONFIG.targets.incarnation.type);
            setValue('#lv-incarnation-target', CONFIG.targets.incarnation.target);

            setChecked('#lv-autosell-pills', CONFIG.autoSell.pills.enabled);
            setValue('#lv-autosell-pills-rarity', CONFIG.autoSell.pills.maxRarity);

            setChecked('#lv-autosell-equip', CONFIG.autoSell.equipment.enabled);
            setValue('#lv-autosell-equip-rarity', CONFIG.autoSell.equipment.maxRarity);

            setChecked('#lv-autosell-talismans', CONFIG.autoSell.talismans.enabled);
            setValue('#lv-autosell-talismans-rarity', CONFIG.autoSell.talismans.maxRarity);

            setChecked('#lv-use-quickbuy', CONFIG.general.useQuickBuy);
            setChecked('#lv-auto-start', CONFIG.general.autoStart);
            setValue('#lv-batch-size', CONFIG.general.batchSize);
            setValue('#lv-max-cost', CONFIG.general.maxQuickBuyCost);
            setValue('#lv-interval', CONFIG.general.autoCraftInterval);
        },

        refreshRecipeSelects() {
            const alchemySelect = $('#lv-target-alchemy');
            if (alchemySelect) {
                const current = alchemySelect.value;
                alchemySelect.innerHTML = '<option value="">-- 不自动炼丹 --</option>' +
                    this.generateRecipeOptions(CACHE.alchemy, 'pillName', 'alchemy');
                alchemySelect.value = current;
            }

            const forgeSelect = $('#lv-target-forge');
            if (forgeSelect) {
                const current = forgeSelect.value;
                forgeSelect.innerHTML = '<option value="">-- 不自动炼器 --</option>' +
                    this.generateRecipeOptions(CACHE.forge, 'name', 'forge');
                forgeSelect.value = current;
            }

            const talismanSelect = $('#lv-target-talisman');
            if (talismanSelect) {
                const current = talismanSelect.value;
                talismanSelect.innerHTML = '<option value="">-- 不自动制符 --</option>' +
                    this.generateRecipeOptions(CACHE.talisman, 'name', 'talisman');
                talismanSelect.value = current;
            }
        },

        updateIncarnationStatus() {
            const statusEl = $('#lv-incarnation-status');
            if (!statusEl || !CACHE.incarnationStatus) return;

            const status = CACHE.incarnationStatus;
            if (status.hasIncarnation) {
                statusEl.textContent = `${status.name || '化身'} Lv.${status.level || 0}`;
                statusEl.style.color = Theme.getVars().textJade;
            } else {
                statusEl.textContent = '未凝聚化身';
                statusEl.style.color = Theme.getVars().textMuted;
            }
        },

        updateLogPanel() {
            const panel = $('#lv-log-panel');
            if (!panel) return;

            const v = Theme.getVars();

            if (STATE.logs.length > 0) {
                panel.style.display = 'block';
                panel.innerHTML = STATE.logs.slice(-25).map(log => {
                    const color = log.type === 'error' ? v.textRed :
                                  log.type === 'success' ? v.textJade :
                                  log.type === 'warn' ? v.textGold :
                                  v.textSecondary;
                    const icon = log.type === 'error' ? '❌' :
                                 log.type === 'success' ? '✅' :
                                 log.type === 'warn' ? '⚠️' : 'ℹ️';
                    return `<div style="color: ${color}; margin-bottom: 2px;">${icon} [${log.time}] ${log.msg}</div>`;
                }).join('');
                panel.scrollTop = panel.scrollHeight;
            }
        },

        updateRunStatus() {
            const status = $('#lv-run-status');
            const btn = $('#lv-btn-start');
            const v = Theme.getVars();

            if (STATE.running) {
                if (status) {
                    status.textContent = '▶ 运行中';
                    status.style.color = v.textJade;
                }
                if (btn) {
                    btn.textContent = '⏹ 停止炼造';
                    btn.style.background = v.gradientJade;
                }
            } else {
                if (status) {
                    status.textContent = '⏹ 未运行';
                    status.style.color = v.textPrimary;
                }
                if (btn) {
                    btn.textContent = '▶ 开始炼造';
                    btn.style.background = v.gradientGold;
                }
            }
        },

        updateStats() {
            const crafted = $('#lv-stat-crafted');
            const incarnation = $('#lv-stat-incarnation');
            const sold = $('#lv-stat-sold');
            const spent = $('#lv-stat-spent');

            if (crafted) crafted.textContent = STATE.stats.crafted;
            if (incarnation) incarnation.textContent = STATE.stats.incarnationCrafted;
            if (sold) sold.textContent = STATE.stats.soldPills + STATE.stats.soldEquip + STATE.stats.soldTalismans;
            if (spent) spent.textContent = STATE.stats.spent;
        }
    };

    // ============================================================
    // 炼造管理
    // ============================================================
    const CraftManager = {
        async loadRecipes() {
            try {
                Logger.info('正在加载配方...');

                try {
                    const res = await API.getAlchemyRecipes();
                    if (res.data?.recipes) {
                        CACHE.alchemy = res.data.recipes;
                        Logger.success(`炼丹配方: ${CACHE.alchemy.length}个`);
                    }
                } catch (e) {
                    Logger.warn('炼丹配方加载失败: ' + e.message);
                }

                try {
                    const res = await API.getForgeRecipes();
                    if (res.data?.recipes) {
                        CACHE.forge = res.data.recipes;
                        Logger.success(`炼器配方: ${CACHE.forge.length}个`);
                    }
                } catch (e) {
                    Logger.warn('炼器配方加载失败: ' + e.message);
                }

                try {
                    const res = await API.getTalismanRecipes();
                    if (res.data?.recipes) {
                        CACHE.talisman = res.data.recipes;
                        Logger.success(`制符配方: ${CACHE.talisman.length}个`);
                    }
                } catch (e) {
                    Logger.warn('制符配方加载失败: ' + e.message);
                }

                CACHE.lastUpdate = Date.now();
            } catch (e) {
                Logger.error('加载配方失败: ' + e.message);
            }
        },

        async loadIncarnationStatus() {
            try {
                const res = await API.getIncarnationStatus();
                if (res.code === 200 && res.data) {
                    CACHE.incarnationStatus = res.data;
                    UI.updateIncarnationStatus();
                }
            } catch (e) {
                Logger.warn('化身状态加载失败: ' + e.message);
            }
        },

        start() {
            if (STATE.running) return;

            UI.saveConfigFromPanel();

            const hasTarget = CONFIG.targets.alchemy || CONFIG.targets.forge || CONFIG.targets.talisman;
            const hasIncarnation = CONFIG.targets.incarnation.enabled && CONFIG.targets.incarnation.target;

            if (!hasTarget && !hasIncarnation) {
                Logger.warn('请至少选择一个炼造目标');
                return;
            }

            STATE.running = true;
            UI.updateRunStatus();
            Logger.success('自动炼造已启动');

            this.executeOnce();

            STATE.autoCraftTimer = setInterval(() => {
                this.executeOnce();
            }, CONFIG.general.autoCraftInterval * 1000);
        },

        stop(reason = null) {
            if (!STATE.running) return;

            STATE.running = false;
            if (STATE.autoCraftTimer) {
                clearInterval(STATE.autoCraftTimer);
                STATE.autoCraftTimer = null;
            }

            UI.updateRunStatus();
            if (reason) {
                Logger.warn(`自动炼造已停止: ${reason}`);
            } else {
                Logger.info('自动炼造已停止');
            }
        },

        async executeOnce() {
            if (this.isMeditating()) {
                Logger.warn('冥想中无法炼造，跳过本次执行');
                return;
            }

            // 检查玩家状态
            const statusCheck = await this.checkPlayerStatus();
            if (!statusCheck.canCraft) {
                this.stop(statusCheck.reason);
                return;
            }

            try {
                let craftedCount = 0;

                if (CONFIG.targets.alchemy) {
                    const result = await this.craftByName('alchemy', CONFIG.targets.alchemy);
                    if (result && result.count) craftedCount += result.count;
                }

                if (CONFIG.targets.forge) {
                    const result = await this.craftByName('forge', CONFIG.targets.forge);
                    if (result && result.count) craftedCount += result.count;
                }

                if (CONFIG.targets.talisman) {
                    const result = await this.craftByName('talisman', CONFIG.targets.talisman);
                    if (result && result.count) craftedCount += result.count;
                }

                if (CONFIG.targets.incarnation.enabled && CONFIG.targets.incarnation.target) {
                    await this.craftIncarnation();
                }

                await this.autoSell();

                UI.updateStats();

                // 如果本次没有成功炼制任何物品，可能是资源耗尽
                if (craftedCount === 0 && (CONFIG.targets.alchemy || CONFIG.targets.forge || CONFIG.targets.talisman)) {
                    STATE.consecutiveEmptyCrafts = (STATE.consecutiveEmptyCrafts || 0) + 1;
                    if (STATE.consecutiveEmptyCrafts >= 3) {
                        this.stop('连续多次未成功炼制，可能是神识/灵力/材料不足');
                        STATE.consecutiveEmptyCrafts = 0;
                    }
                } else {
                    STATE.consecutiveEmptyCrafts = 0;
                }

            } catch (e) {
                Logger.error('执行失败: ' + e.message);
            }
        },

        async checkPlayerStatus() {
            try {
                const res = await API.getPlayerInfo();
                if (res.code !== 200 || !res.data) {
                    return { canCraft: false, reason: '无法获取玩家信息' };
                }

                const player = res.data;

                // 检查神识
                if (player.spirit !== undefined && player.maxSpirit !== undefined) {
                    if (player.spirit < 10) {
                        return { canCraft: false, reason: '神识不足（需要至少10点）' };
                    }
                }

                // 检查灵力
                if (player.mp !== undefined && player.maxMp !== undefined) {
                    if (player.mp < 10) {
                        return { canCraft: false, reason: '灵力不足（需要至少10点）' };
                    }
                }

                // 检查灵石（如果开启自动补充）
                if (CONFIG.general.useQuickBuy) {
                    const stones = player.lowerSpiritStone || 0;
                    if (stones < 100) {
                        return { canCraft: false, reason: '灵石不足（需要至少100点用于补充材料）' };
                    }
                }

                return { canCraft: true, reason: null };
            } catch (e) {
                return { canCraft: true, reason: null }; // 获取失败时不阻止炼制
            }
        },

        async craftByName(type, name) {
            const cache = type === 'alchemy' ? CACHE.alchemy :
                         type === 'forge' ? CACHE.forge : CACHE.talisman;

            const recipe = cache.find(r => {
                const itemName = r.pillName || r.name || '';
                return itemName === name;
            });

            if (!recipe) {
                Logger.warn(`未找到配方: ${name}`);
                return { count: 0 };
            }

            const idField = type === 'alchemy' ? 'pillId' : 'recipeId';
            const id = recipe[idField];
            const canCraft = recipe.canCraft || recipe.canForge;
            const canQuickBuy = recipe.canQuickBuy;

            if (!canCraft) {
                if (!canQuickBuy || !CONFIG.general.useQuickBuy) {
                    Logger.warn(`${name} 不可炼制`);
                    return { count: 0 };
                }
                Logger.info(`${name} 材料不足，将使用灵石补充`);
            }

            const requestCount = Math.min(CONFIG.general.batchSize, 50);

            // 计算是否需要补充材料（批量炼制需要 requestCount 次的材料）
            const needBuy = recipe.materials?.some(m => m.have < m.need * requestCount);
            if (needBuy && CONFIG.general.useQuickBuy && canQuickBuy) {
                const totalCost = recipe.quickBuyCost * requestCount;
                if (totalCost > CONFIG.general.maxQuickBuyCost) {
                    Logger.warn(`${name} 批量补充费用过高(${totalCost}灵石)，尝试单次炼制`);
                    // 回退到单次炼制
                    return this.craftSingle(type, name);
                }

                Logger.info(`${name} 补充${requestCount}次材料中...`);
                try {
                    const buyRes = await API.quickBuyMats(type, id, requestCount);
                    if (buyRes.code === 200) {
                        STATE.stats.spent += totalCost;
                        Logger.success(`${name} 材料补充成功，花费${totalCost}灵石`);
                    } else {
                        Logger.error(`${name} 补充失败: ${buyRes.message}`);
                        return { count: 0 };
                    }
                } catch (e) {
                    Logger.error(`${name} 补充异常: ${e.message}`);
                    return { count: 0 };
                }
            } else if (needBuy && !canQuickBuy) {
                Logger.warn(`${name} 材料不足且无法补充`);
                return { count: 0 };
            }
            try {
                let res;
                if (type === 'alchemy') {
                    res = await API.batchCraftAlchemy(id, requestCount);
                } else if (type === 'forge') {
                    res = await API.batchCraftForge(id, requestCount);
                } else {
                    res = await API.batchCraftTalisman(id, requestCount);
                }

                if (res.code === 200) {
                    // 从API返回获取实际炼制数量
                    // 优先从data.count/crafted读取，否则从message解析
                    let actualCount = res.data?.count || res.data?.crafted;
                    if (!actualCount && res.data?.message) {
                        // 从message解析，如 "批量炼丹: 10次「回春丹」 (史诗x1、稀有x2、优良x3、普通x5)"
                        const match = res.data.message.match(/(\d+)次/);
                        if (match) {
                            actualCount = parseInt(match[1]);
                        }
                    }
                    actualCount = actualCount || 1;

                    // 显示API返回的完整消息
                    const msg = res.data?.message || `${name} x${actualCount} 炼制成功`;
                    Logger.success(msg);
                    STATE.stats.crafted += actualCount;
                    return { count: actualCount };
                } else {
                    Logger.error(`${name} 炼制失败: ${res.message}`);
                    return { count: 0 };
                }
            } catch (e) {
                Logger.error(`${name} 炼制异常: ${e.message}`);
                return { count: 0 };
            }
        },

        async craftSingle(type, name) {
            const cache = type === 'alchemy' ? CACHE.alchemy :
                         type === 'forge' ? CACHE.forge : CACHE.talisman;

            const recipe = cache.find(r => {
                const itemName = r.pillName || r.name || '';
                return itemName === name;
            });

            if (!recipe) {
                Logger.warn(`未找到配方: ${name}`);
                return { count: 0 };
            }

            const idField = type === 'alchemy' ? 'pillId' : 'recipeId';
            const id = recipe[idField];

            try {
                let res;
                if (type === 'alchemy') {
                    res = await API.craftAlchemy(id);
                } else if (type === 'forge') {
                    res = await API.craftForge(id);
                } else {
                    res = await API.craftTalisman(id);
                }

                if (res.code === 200) {
                    // 优先从data.count/crafted读取，否则从message解析
                    let actualCount = res.data?.count || res.data?.crafted;
                    if (!actualCount && res.data?.message) {
                        const match = res.data.message.match(/成功炼制.*?x(\d+)/);
                        if (match) {
                            actualCount = parseInt(match[1]);
                        }
                    }
                    actualCount = actualCount || 1;

                    const msg = res.data?.message || `${name} x${actualCount} 单次炼制成功`;
                    Logger.success(msg);
                    STATE.stats.crafted += actualCount;
                    return { count: actualCount };
                } else {
                    Logger.error(`${name} 单次炼制失败: ${res.message}`);
                    return { count: 0 };
                }
            } catch (e) {
                Logger.error(`${name} 单次炼制异常: ${e.message}`);
                return { count: 0 };
            }
        },

        async craftIncarnation() {
            if (!CACHE.incarnationStatus?.hasIncarnation) {
                Logger.warn('未凝聚化身，无法炼造');
                return;
            }

            const type = CONFIG.targets.incarnation.type;
            const targetName = CONFIG.targets.incarnation.target;

            const cache = type === 'alchemy' ? CACHE.alchemy :
                         type === 'forge' ? CACHE.forge : CACHE.talisman;

            const recipe = cache.find(r => {
                const itemName = r.pillName || r.name || '';
                return itemName === targetName;
            });

            if (!recipe) {
                Logger.warn(`未找到化身炼造配方: ${targetName}`);
                return;
            }

            try {
                await API.toggleIncarnationCraft(true);
                Logger.success(`化身开始炼造: ${targetName}`);
                STATE.stats.incarnationCrafted++;
            } catch (e) {
                Logger.error('化身炼造失败: ' + e.message);
            }
        },

        async autoSell() {
            try {
                const res = await API.getInventory();
                if (res.code !== 200 || !res.data) return;

                const items = res.data;
                const toSell = [];

                items.forEach(item => {
                    if (CONFIG.autoSell.pills.enabled && item.type === 'pill') {
                        if (item.rarity <= CONFIG.autoSell.pills.maxRarity) {
                            toSell.push({ itemId: item.itemId, quantity: item.quantity });
                            STATE.stats.soldPills += item.quantity;
                        }
                    }

                    if (CONFIG.autoSell.equipment.enabled && item.type === 'equipment') {
                        if (item.rarity <= CONFIG.autoSell.equipment.maxRarity) {
                            toSell.push({ itemId: item.itemId, quantity: item.quantity });
                            STATE.stats.soldEquip += item.quantity;
                        }
                    }

                    if (CONFIG.autoSell.talismans.enabled && item.type === 'talisman') {
                        if (item.rarity <= CONFIG.autoSell.talismans.maxRarity) {
                            toSell.push({ itemId: item.itemId, quantity: item.quantity });
                            STATE.stats.soldTalismans += item.quantity;
                        }
                    }
                });

                if (toSell.length > 0) {
                    const sellRes = await API.sellItems(toSell);
                    if (sellRes.code === 200) {
                        Logger.success(`自动售出 ${toSell.length} 种物品`);
                    }
                }
            } catch (e) {
                Logger.error('自动售卖失败: ' + e.message);
            }
        },

        isMeditating() {
            if (_win.meditationStartTime && _win.meditationStartTime > 0) return true;
            if (window.meditationStartTime && window.meditationStartTime > 0) return true;

            const meditateBtn = document.getElementById('meditateBtn');
            if (meditateBtn?.classList.contains('meditating')) return true;

            const meditationBar = document.getElementById('meditationBar');
            if (meditationBar && !meditationBar.classList.contains('hidden')) return true;

            return false;
        }
    };

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        if (!location.href.includes('ling.muge.info')) return;

        Theme.initObserver();
        Logger.info('炼造助手 v3.0.0 已加载');

        // 等待游戏DOM完全加载后再创建按钮
        waitForElement('.player-panel', 10000)
            .then(() => {
                UI.createSidebarButton();
                Logger.info('点击侧边栏 🔥炼造 按钮打开配置面板');
            })
            .catch(() => {
                Logger.warn('未找到侧边栏，按钮可能无法显示');
            });

        // 延迟加载配方
        setTimeout(() => {
            CraftManager.loadRecipes();
        }, 3000);

        // 自动开始
        setTimeout(() => {
            if (CONFIG.general.autoStart) {
                CraftManager.start();
            }
        }, 5000);
    }

    // 等待元素出现的辅助函数
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`等待元素 ${selector} 超时`));
            }, timeout);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
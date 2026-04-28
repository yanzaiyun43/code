// ==UserScript==
// @name         灵界 LingVerse 炼造配置面板
// @namespace    lingverse-craft-config
// @version      2.1.24
// @description  炼造自动化配置：支持炼丹/炼器/制符/化身炼造、许愿锁定、自动售卖、深色/浅色模式跟随游戏主题
// @author       LingVerse
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

    // 配置管理 - 所有用户可调整的设置
    const CONFIG = {

        targets: {
            alchemy: '',
            forge: '',
            talisman: '',
            incarnation: {
                enabled: false,
                type: 'alchemy',
                target: ''
            }
        },

        autoSell: {
            useBatchAPI: false,
            batchMaxRarity: 2,
            pills: { enabled: false, maxRarity: 2 },
            equipment: { enabled: false, maxRarity: 2, excludeSlots: [], minEnhanceLevel: 0, keepWithAffix: true },
            confirmed: false
        },

        wishLock: { enabled: false, type: 'alchemy', targetName: '', targetRarity: 4 },

        incarnation: {
            autoFeedPills: false,
            autoEquip: false,
            feedPillType: 'cultivation'
        },

        general: {
            batchSize: 10,
            useQuickBuy: true,
            maxQuickBuyCost: 5000,
            autoStart: false,
            autoCraftInterval: 30,
            enableLogging: true,
            minimizePanel: false,
            

            adaptiveInterval: true,
            minInterval: 10,
            maxInterval: 60,
            successDecrease: 2,
            errorIncrease: 5,
            

            autoStop: {
                enabled: true,
                onInsufficientSpirit: true,
                spiritThreshold: 100,
                onInsufficientMp: true,
                mpThreshold: 10,
                onInsufficientStamina: true,
                staminaThreshold: 10,
                onInventoryFull: true,
                onMeditating: true,
                onMaxCostReached: true,
                maxCraftCost: 100000,
                stopOnError: true,
                maxConsecutiveErrors: 5
            }
        }
    };

    // 状态管理 - 运行时状态和统计
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
            spent: 0,
            incarnationCrafted: 0,
            pillsFed: 0,
            errors: 0,
            lastErrorTime: 0,
            lastSuccessTime: 0
        },
        logs: [],
        playerInfo: null,
        incarnationInfo: null,
        

        monitor: {
            spiritStones: 0,
            maxSpiritStones: 0,
            mp: 0,
            maxMp: 0,
            stamina: 0,
            maxStamina: 0,
            inventoryCount: 0,
            inventoryLimit: 0,
            isMeditating: false,
            consecutiveErrors: 0,
            currentInterval: 30,
            totalSpent: 0,
            lastUpdate: 0
        },
        

        updateMonitor(playerInfo) {
            if (!playerInfo) return;
            // API返回的是lowerStone（下品灵石），不是spiritStones
            this.monitor.spiritStones = playerInfo.lowerStone || playerInfo.spiritStones || 0;
            this.monitor.maxSpiritStones = playerInfo.maxLowerStone || playerInfo.maxSpiritStones || 0;
            // API返回的是mp（灵力），不是stamina
            this.monitor.mp = playerInfo.mp || 0;
            this.monitor.maxMp = playerInfo.maxMp || 0;
            // API返回的是spirit（神识）
            this.monitor.spirit = playerInfo.spirit || 0;
            this.monitor.maxSpirit = playerInfo.maxSpirit || 0;
            // API返回的是inventoryUsed（已使用格子数）和inventoryCapacity（容量上限）
            this.monitor.inventoryCount = playerInfo.inventoryUsed || playerInfo.inventoryCount || 0;
            this.monitor.inventoryLimit = playerInfo.inventoryCapacity || playerInfo.inventoryLimit || 100;
            this.monitor.lastUpdate = Date.now();
        },
        

        recordSuccess() {
            this.stats.crafted++;
            this.stats.lastSuccessTime = Date.now();
            this.monitor.consecutiveErrors = 0;
            

            if (CONFIG.general.adaptiveInterval) {
                this.monitor.currentInterval = Math.max(
                    CONFIG.general.minInterval,
                    this.monitor.currentInterval - CONFIG.general.successDecrease
                );
            }
        },
        

        recordError(errorType = null) {
            this.stats.errors++;
            this.monitor.consecutiveErrors++;
            this.stats.lastErrorTime = Date.now();
            

            if (CONFIG.general.adaptiveInterval) {
                this.monitor.currentInterval = Math.min(
                    CONFIG.general.maxInterval,
                    this.monitor.currentInterval + CONFIG.general.errorIncrease
                );
            }
            
            return this.monitor.consecutiveErrors;
        },
        

        recordSpent(amount) {
            this.stats.spent += amount;
            this.monitor.totalSpent += amount;
        },
        

        resetStats() {
            this.stats.crafted = 0;
            this.stats.soldPills = 0;
            this.stats.soldEquip = 0;
            this.stats.spent = 0;
            this.stats.incarnationCrafted = 0;
            this.stats.pillsFed = 0;
            this.stats.errors = 0;
            this.monitor.consecutiveErrors = 0;
            this.monitor.totalSpent = 0;
            this.monitor.currentInterval = CONFIG.general.autoCraftInterval;
        },
        

        shouldStop() {
            const autoStop = CONFIG.general.autoStop;
            if (!autoStop.enabled) return { shouldStop: false, reason: null };

            // 灵石不足检测
            if (autoStop.onInsufficientSpirit && this.monitor.spiritStones < (autoStop.spiritThreshold || 100)) {
                return { shouldStop: true, reason: `灵石不足(${this.monitor.spiritStones}<${autoStop.spiritThreshold || 100})，请补充灵石` };
            }

            // 灵力不足检测 (mp是灵力)
            if (autoStop.onInsufficientMp && this.monitor.mp < (autoStop.mpThreshold || 10)) {
                return { shouldStop: true, reason: `灵力不足(${this.monitor.mp}<${autoStop.mpThreshold || 10})，请等待恢复` };
            }

            // 神识不足检测 (spirit是神识)
            if (autoStop.onInsufficientStamina && this.monitor.spirit < (autoStop.staminaThreshold || 10)) {
                return { shouldStop: true, reason: `神识不足(${this.monitor.spirit}<${autoStop.staminaThreshold || 10})，请等待恢复` };
            }

            if (autoStop.onInventoryFull && this.monitor.inventoryCount >= this.monitor.inventoryLimit - 5) {
                return { shouldStop: true, reason: '背包即将满，请清理背包' };
            }

            if (autoStop.onMeditating && this.monitor.isMeditating) {
                return { shouldStop: true, reason: '正在冥想中，无法炼造' };
            }

            if (autoStop.onMaxCostReached && this.monitor.totalSpent >= autoStop.maxCraftCost) {
                return { shouldStop: true, reason: `已达到最大炼制花费限制(${autoStop.maxCraftCost}灵石)` };
            }
            

            if (autoStop.stopOnError && this.monitor.consecutiveErrors >= autoStop.maxConsecutiveErrors) {
                return { shouldStop: true, reason: `连续错误${this.monitor.consecutiveErrors}次，已自动停止` };
            }
            
            return { shouldStop: false, reason: null };
        }
    };

    
    // 缓存系统 - 减少重复API请求
    const CACHE = {
        alchemy: [],
        forge: [],
        talisman: [],
        inventory: [],
        playerInfo: null,
        incarnationStatus: null,
        lastUpdate: 0,
        

        config: {
            recipesTTL: 5 * 60 * 1000,
            inventoryTTL: 30 * 1000,
            playerInfoTTL: 10 * 1000,
            shopTTL: 60 * 1000,
            maxRetries: 3
        },
        

        meta: {
            alchemy: { timestamp: 0, loading: false, error: null, retryCount: 0 },
            forge: { timestamp: 0, loading: false, error: null, retryCount: 0 },
            talisman: { timestamp: 0, loading: false, error: null, retryCount: 0 },
            inventory: { timestamp: 0, loading: false, error: null, retryCount: 0 },
            playerInfo: { timestamp: 0, loading: false, error: null, retryCount: 0 },
            shop: { timestamp: 0, loading: false, error: null, retryCount: 0 }
        },
        

        isValid(type) {
            const meta = this.meta[type];
            const ttl = this.config[type + 'TTL'] || 60000;
            return meta && !meta.error && (Date.now() - meta.timestamp) < ttl;
        },
        
        set(type, data) {
            this[type] = data;
            this.meta[type].timestamp = Date.now();
            this.meta[type].error = null;
            this.meta[type].retryCount = 0;
        },
        
        setError(type, error) {
            this.meta[type].error = error;
            this.meta[type].retryCount++;
        },
        
        clear(type) {
            this[type] = Array.isArray(this[type]) ? [] : null;
            this.meta[type].timestamp = 0;
            this.meta[type].error = null;
            this.meta[type].retryCount = 0;
        },
        
        clearAll() {
            ['alchemy', 'forge', 'talisman', 'inventory', 'playerInfo', 'shop'].forEach(type => this.clear(type));
        },
        

        async getOrFetch(type, fetchFn, forceRefresh = false) {

            if (!forceRefresh && this.isValid(type)) {
                Logger.info(`使用缓存的${type}数据`);
                return { code: 200, data: this[type] };
            }
            

            if (this.meta[type].loading) {
                Logger.info(`等待${type}数据加载...`);
                let waitCount = 0;
                while (this.meta[type].loading && waitCount < 50) {
                    await wait(100);
                    waitCount++;
                }
                if (this.isValid(type)) {
                    return { code: 200, data: this[type] };
                }
            }
            

            if (this.meta[type].retryCount >= this.config.maxRetries) {
                Logger.error(`${type}数据加载失败次数过多，请刷新页面重试`);
                return { code: 500, message: '加载失败次数过多' };
            }
            

            this.meta[type].loading = true;
            this.meta[type].error = null;
            
            try {
                const res = await fetchFn();
                if (res.code === 200) {
                    this.set(type, res.data);
                    return res;
                } else {
                    this.setError(type, res.message);
                    return res;
                }
            } catch (e) {
                this.setError(type, e.message);
                throw e;
            } finally {
                this.meta[type].loading = false;
            }
        }
    };

    
    // API管理 - 游戏接口封装和错误处理
    const API = {
        get() {
            if (_win.api) return _win.api;
            if (window.api) return window.api;
            if (typeof api !== 'undefined') return api;
            return null;
        },

        // 错误类型定义
        ErrorTypes: {
            NETWORK: 'network',
            AUTH: 'auth',
            SIGNATURE: 'signature',
            SERVER: 'server',
            CLIENT: 'client',
            RATE_LIMIT: 'rate_limit',
            INSUFFICIENT: 'insufficient',
            COOLDOWN: 'cooldown',
            MEDITATING: 'meditating',
            UNKNOWN: 'unknown'
        },

        parseError(error, response = null) {
            const msg = error.message || '';
            

            if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || 
                msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                return { type: this.ErrorTypes.NETWORK, message: '网络连接失败', retryable: true };
            }
            

            if (msg.includes('401') || msg.includes('未登录') || msg.includes('登录已过期') || 
                msg.includes('token') || msg.includes('Token')) {
                return { type: this.ErrorTypes.AUTH, message: '登录已过期，请刷新页面', retryable: false };
            }
            

            if (msg.includes('403') || msg.includes('签名') || msg.includes('signature') || 
                msg.includes('Signature')) {
                return { type: this.ErrorTypes.SIGNATURE, message: 'API签名错误', retryable: true };
            }
            

            if (msg.includes('429') || msg.includes('too many') || msg.includes('频率') || 
                msg.includes('过快') || msg.includes('请稍后再试')) {
                return { type: this.ErrorTypes.RATE_LIMIT, message: '操作过于频繁，请稍后再试', retryable: true };
            }
            

            if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') ||
                msg.includes('服务器') || msg.includes('server')) {
                return { type: this.ErrorTypes.SERVER, message: '服务器错误', retryable: true };
            }
            

            if (msg.includes('灵石不足') || msg.includes('材料不足') || msg.includes('神识不足') || 
                msg.includes('不足') || msg.includes('insufficient') || msg.includes('not enough')) {
                return { type: this.ErrorTypes.INSUFFICIENT, message: msg, retryable: false };
            }
            

            if (msg.includes('冷却') || msg.includes('cooldown') || msg.includes('cd') || 
                msg.includes('请等待') || msg.includes('稍后')) {
                return { type: this.ErrorTypes.COOLDOWN, message: msg, retryable: true };
            }
            

            if (msg.includes('冥想') || msg.includes('meditat') || msg.includes('修炼中')) {
                return { type: this.ErrorTypes.MEDITATING, message: '正在冥想中，无法操作', retryable: false };
            }
            

            if (msg.includes('400') || msg.includes('404') || msg.includes('参数') || 
                msg.includes('无效') || msg.includes('不存在')) {
                return { type: this.ErrorTypes.CLIENT, message: msg, retryable: false };
            }
            
            return { type: this.ErrorTypes.UNKNOWN, message: msg || '未知错误', retryable: false };
        },

        async request(method, endpoint, data = null, retryCount = 0, maxRetries = 2) {
            const api = this.get();
            if (!api) {
                const error = { type: this.ErrorTypes.CLIENT, message: 'API不可用', retryable: false };
                throw error;
            }

            try {
                const res = method === 'GET'
                    ? await api.get(endpoint)
                    : await api.post(endpoint, data);

                if (!res) {
                    throw new Error('Empty response');
                }

                if (res.code === 401) {
                    const error = new Error('登录已过期，请刷新页面重新登录');
                    error.errorType = this.ErrorTypes.AUTH;
                    error.retryable = false;
                    throw error;
                }

                if (res.code === 403) {
                    if (retryCount < maxRetries) {
                        Logger.warn(`API签名错误，正在重试(${retryCount + 1}/${maxRetries})...`);
                        await new Promise(r => setTimeout(r, 500 * (retryCount + 1)));
                        return this.request(method, endpoint, data, retryCount + 1, maxRetries);
                    }
                    const error = new Error(res.message || 'API签名验证失败');
                    error.errorType = this.ErrorTypes.SIGNATURE;
                    error.retryable = false;
                    throw error;
                }

                if (res.code === 429) {
                    if (retryCount < maxRetries) {
                        const delay = 2000 * (retryCount + 1);
                        Logger.warn(`操作过于频繁，${delay/1000}秒后重试...`);
                        await new Promise(r => setTimeout(r, delay));
                        return this.request(method, endpoint, data, retryCount + 1, maxRetries);
                    }
                    const error = new Error(res.message || '操作过于频繁，请稍后再试');
                    error.errorType = this.ErrorTypes.RATE_LIMIT;
                    error.retryable = false;
                    throw error;
                }

                if (res.code >= 500) {
                    if (retryCount < maxRetries) {
                        Logger.warn(`服务器错误，正在重试(${retryCount + 1}/${maxRetries})...`);
                        await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
                        return this.request(method, endpoint, data, retryCount + 1, maxRetries);
                    }
                    const error = new Error(res.message || '服务器错误');
                    error.errorType = this.ErrorTypes.SERVER;
                    error.retryable = false;
                    throw error;
                }

                if (res.code !== 200) {
                    const error = new Error(res.message || `请求失败: ${endpoint}`);
                    const parsed = this.parseError(error, res);
                    error.errorType = parsed.type;
                    error.retryable = parsed.retryable;
                    throw error;
                }

                if (res.code === undefined && res.data === undefined) {
                    return { code: 200, data: res };
                }

                return res;
            } catch (e) {

                if (e.errorType) throw e;
                

                const parsed = this.parseError(e);
                const error = new Error(parsed.message);
                error.errorType = parsed.type;
                error.retryable = parsed.retryable;
                error.originalError = e;
                

                if (parsed.retryable && retryCount < maxRetries) {
                    const delay = 1000 * (retryCount + 1);
                    Logger.warn(`${parsed.message}，${delay/1000}秒后重试(${retryCount + 1}/${maxRetries})...`);
                    await new Promise(r => setTimeout(r, delay));
                    return this.request(method, endpoint, data, retryCount + 1, maxRetries);
                }
                
                Logger.error(`API ${method} ${endpoint}: ${parsed.message}`);
                throw error;
            }
        },

        // ==================== 玩家信息 ====================
        async getPlayerInfo() {
            return this.request('GET', '/api/player/info');
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

        async previewBatchSell(maxRarity, scope = null) {
            const payload = { maxRarity };
            if (scope && scope !== 'all') payload.scope = scope;
            return this.request('POST', '/api/game/sell-batch/preview', payload);
        },

        async batchSell(maxRarity, scope = null) {
            const payload = { maxRarity };
            if (scope && scope !== 'all') payload.scope = scope;
            return this.request('POST', '/api/game/sell-batch', payload);
        },

        async sellItem(itemId, count = 1) {
            return this.request('POST', '/api/game/sell-item', { itemId, count });
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
        },

        // ==================== 冥想状态 ====================
        async getMeditateStatus() {
            return this.request('GET', '/api/game/meditate/status');
        },

        // ==================== 玩家设置 ====================
        async getPlayerSettings() {
            return this.request('GET', '/api/player/settings');
        },

        // ==================== 装备系统 ====================
        async getCurrentEquipment() {
            return this.request('GET', '/api/game/equipment/current');
        },

        async equipItem(itemId) {
            return this.request('POST', '/api/player/equip', { itemId });
        },

        async unequipItem(itemId) {
            return this.request('POST', '/api/player/unequip', { itemId });
        },

        // ==================== 商店系统 ====================
        async getShop() {
            return this.request('GET', '/api/game/shop');
        },

        async buyItem(templateId, quantity = 1) {
            return this.request('POST', '/api/game/buy', { templateId, quantity });
        },

        // ==================== 突破 ====================
        async breakthrough() {
            return this.request('POST', '/api/game/breakthrough');
        }
    };

    // 日志系统 - 运行时信息输出
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

    
    // 主题管理 - 自动适配游戏深色/浅色模式
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

                isDark,

                bgPrimary: isDark ? '#0a0f1c' : '#f3f2f0',
                bgSecondary: isDark ? '#111827' : '#eae9e7',
                bgCard: isDark ? '#151d2e' : '#f9f9f8',
                bgCardHover: isDark ? '#1a2540' : '#eeedeb',
                bgPanel: isDark ? '#0e1525' : '#f0efed',
                bgInput: isDark ? '#0d1420' : '#ffffff',

                borderColor: isDark ? 'rgba(201, 153, 58, 0.15)' : 'rgba(60, 60, 60, 0.12)',
                borderGold: isDark ? 'rgba(201, 153, 58, 0.3)' : 'rgba(140, 60, 50, 0.25)',
                borderActive: isDark ? 'rgba(201, 153, 58, 0.5)' : 'rgba(140, 60, 50, 0.4)',

                textPrimary: isDark ? '#e8e0d0' : '#1a1a1a',
                textSecondary: isDark ? '#a8a090' : '#4a5a5a',
                textMuted: isDark ? '#6a6560' : '#8a9090',
                textGold: isDark ? '#c9993a' : '#b8463e',
                textJade: isDark ? '#3dab97' : '#3a6a7a',
                textPurple: isDark ? '#9a6ae0' : '#6a5a8a',
                textRed: isDark ? '#e06060' : '#c04040',
                textBlue: isDark ? '#60a0e0' : '#3a5a8a',
                textGreen: isDark ? '#4ade80' : '#16a34a',

                accentGold: isDark ? '#c9993a' : '#b8463e',
                accentJade: isDark ? '#3dab97' : '#3a6a7a',
                accentPurple: isDark ? '#9a6ae0' : '#6a5a8a',
                accentRed: isDark ? '#e06060' : '#c04040',

                gradientGold: isDark
                    ? 'linear-gradient(135deg, #8a6a20 0%, #c9993a 50%, #8a6a20 100%)'
                    : 'linear-gradient(135deg, #b84a40 0%, #d06858 50%, #b84a40 100%)',
                gradientJade: isDark
                    ? 'linear-gradient(135deg, #1a6b5a 0%, #3dab97 100%)'
                    : 'linear-gradient(135deg, #3a6a7a 0%, #5a8a9a 100%)',
                gradientPurple: isDark
                    ? 'linear-gradient(135deg, #6a3a9a 0%, #9a6ae0 100%)'
                    : 'linear-gradient(135deg, #5a4a7a 0%, #7a6a9a 100%)',

                shadowSm: isDark ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 12px rgba(40, 40, 40, 0.06)',
                shadowMd: isDark ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 4px 20px rgba(40, 40, 40, 0.08)',
                shadowLg: isDark ? '0 8px 32px rgba(0, 0, 0, 0.5)' : '0 8px 40px rgba(40, 40, 40, 0.12)',
                shadowGlow: isDark ? '0 0 20px rgba(201, 153, 58, 0.15)' : '0 0 20px rgba(184, 70, 62, 0.1)',

                rarity: {
                    1: isDark ? '#9ca3af' : '#6b7280',
                    2: isDark ? '#60a5fa' : '#3b82f6',
                    3: isDark ? '#fbbf24' : '#d97706',
                    4: isDark ? '#c084fc' : '#9333ea',
                    5: isDark ? '#f87171' : '#dc2626'
                },

                rarityNames: ['', '普通', '优良', '稀有', '史诗', '传说']
            };
        }
    };

    
    // UI管理 - 面板渲染和交互处理
    const UI = {
        elements: {},

        updateTheme() {
            const panel = $('#lv-craft-panel');
            if (!panel) return;

            const v = Theme.getVars();

            panel.style.background = v.bgPanel;
            panel.style.borderColor = v.borderGold;
            panel.style.color = v.textPrimary;
            panel.style.boxShadow = v.shadowLg;

            const header = $('#lv-panel-header');
            if (header) {
                header.style.background = v.gradientGold;
            }

            this.refreshDynamicStyles();
        },

        refreshDynamicStyles() {
            const v = Theme.getVars();

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

            $$('.lv-select, .lv-input').forEach(el => {
                el.style.background = v.bgInput;
                el.style.borderColor = v.borderColor;
                el.style.color = v.textPrimary;
            });

            $$('.lv-card').forEach(card => {
                card.style.background = v.bgCard;
                card.style.borderColor = v.borderColor;
            });

            const logPanel = $('#lv-log-panel');
            if (logPanel) {
                logPanel.style.background = v.bgCard;
                logPanel.style.borderColor = v.borderColor;
            }
        },

        createSidebarButton() {
            if ($('#lv-craft-sidebar-btn')) return;

            const v = Theme.getVars();

            const section = document.createElement('div');
            section.className = 'panel-section';
            section.id = 'lv-craft-section';
            section.style.cssText = `
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--border-color);
            `;

            const title = document.createElement('h3');
            title.className = 'panel-title';
            title.textContent = '炼造助手';
            title.style.cssText = `
                font-size: 13px;
                color: var(--text-gold);
                letter-spacing: 2px;
                margin-bottom: 12px;
                padding-bottom: 6px;
                border-bottom: 1px solid rgba(201, 153, 58, 0.15);
            `;

            const btn = document.createElement('button');
            btn.id = 'lv-craft-sidebar-btn';
            btn.innerHTML = '<span id="lv-btn-text">加载中...</span>';
            btn.disabled = true;
            btn.style.cssText = `
                width: 100%;
                padding: 10px 12px;
                background: ${v.isDark ? 'rgba(128, 128, 128, 0.2)' : 'rgba(128, 128, 128, 0.15)'};
                border: 1px solid ${v.isDark ? 'rgba(128, 128, 128, 0.4)' : 'rgba(128, 128, 128, 0.3)'};
                border-radius: 6px;
                color: ${v.textMuted};
                font-size: 13px;
                font-weight: bold;
                cursor: not-allowed;
                transition: all 0.2s ease;
                display: block;
                text-align: center;
                -webkit-tap-highlight-color: transparent;
                font-family: KaiTi, 楷体, STKaiti, "Noto Serif SC", serif;
            `;

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.togglePanel();
            });

            section.appendChild(title);
            section.appendChild(btn);
            this.insertToSidebar(section);
        },

        enableSidebarButton() {
            const btn = $('#lv-craft-sidebar-btn');
            const btnText = $('#lv-btn-text');
            if (!btn || !btnText) return;

            const v = Theme.getVars();

            btn.disabled = false;
            btnText.textContent = '打开炼造面板';
            btn.style.cursor = 'pointer';
            btn.style.color = v.textGold;
            btn.style.background = v.isDark ? 'rgba(201, 153, 58, 0.2)' : 'rgba(184, 70, 62, 0.15)';
            btn.style.borderColor = v.isDark ? 'rgba(201, 153, 58, 0.4)' : 'rgba(184, 70, 62, 0.3)';

            btn.addEventListener('mouseenter', () => {
                btn.style.background = v.isDark ? 'rgba(201, 153, 58, 0.35)' : 'rgba(184, 70, 62, 0.25)';
                btn.style.borderColor = v.isDark ? 'rgba(201, 153, 58, 0.6)' : 'rgba(184, 70, 62, 0.4)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = v.isDark ? 'rgba(201, 153, 58, 0.2)' : 'rgba(184, 70, 62, 0.15)';
                btn.style.borderColor = v.isDark ? 'rgba(201, 153, 58, 0.4)' : 'rgba(184, 70, 62, 0.3)';
            });

            Logger.info('配方加载完成，炼造助手已就绪');
        },

        insertToSidebar(section) {

            const playerPanel = $('.player-panel') || $('#playerPanel');
            if (playerPanel) {
                const firstSection = playerPanel.querySelector('.panel-section');
                if (firstSection) {

                    if (!playerPanel.querySelector('#lv-craft-section')) {
                        firstSection.insertAdjacentElement('afterend', section);
                    }
                    return;
                }
            }

            const sidebar = $('.player-panel') || $('#playerPanel') || $('.sidebar') || $('#sidebar');
            if (sidebar) {
                if (!sidebar.querySelector('#lv-craft-section')) {
                    sidebar.appendChild(section);
                }
                return;
            }

            setTimeout(() => this.insertToSidebar(section), 1000);
        },

        async createPanel() {
            if ($('#lv-craft-panel')) return;

            const api = API.get();
            const salt = _win.__S || window.__S;
            if (!api || !salt) {
                Logger.warn('游戏正在加载中，请稍后再试');
                return;
            }

            if (CACHE.alchemy.length === 0) {
                await CraftManager.loadRecipes();
            }
            if (CACHE.incarnation === null) {
                await CraftManager.loadIncarnationStatus();
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

            panel.innerHTML = this.generatePanelHTML();
            document.body.appendChild(panel);

            this.bindPanelEvents();
            this.loadConfigToPanel();
            this.makePanelDraggable();
            this.updateTheme();
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
                        <span style="font-size: 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">炼</span>
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
                        ">未运行</span>
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
                            user-select: none;
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
                            ">炼丹</div>
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
                            ">炼器</div>
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
                            ">制符</div>
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
                            刷新配方列表
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
                                <option value="alchemy">炼丹</option>
                                <option value="forge">炼器</option>
                                <option value="talisman">制符</option>
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

                    <!-- 许愿锁定区 -->
                    <div class="lv-card" style="
                        margin-bottom: 16px;
                        padding: 14px;
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 12px;
                    ">
                        <div style="
                            font-size: 13px;
                            color: ${v.textJade};
                            margin-bottom: 12px;
                            font-weight: bold;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            padding-bottom: 8px;
                            border-bottom: 1px solid ${v.borderColor};
                        ">
                            <span>⭐</span> 许愿锁定
                        </div>

                        <label style="
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            margin-bottom: 12px;
                            padding: 8px;
                            background: ${v.isDark ? 'rgba(76,175,80,0.1)' : 'rgba(76,175,80,0.08)'};
                            border-radius: 8px;
                            cursor: pointer;
                        ">
                            <input type="checkbox" id="lv-wish-enabled" style="
                                width: 18px;
                                height: 18px;
                                accent-color: ${v.accentJade};
                            ">
                            <div style="flex: 1;">
                                <div style="color: ${v.textJade}; font-weight: bold; font-size: 12px;">启用许愿锁定</div>
                                <div style="color: ${v.textMuted}; font-size: 11px;">自动设置许愿目标提高成功率</div>
                            </div>
                        </label>

                        <div style="margin-bottom: 10px;">
                            <span style="font-size: 11px; color: ${v.textSecondary};">许愿类型:</span>
                            <select id="lv-wish-type" class="lv-select" style="
                                width: 100%;
                                margin-top: 6px;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 8px 10px;
                                border-radius: 6px;
                                font-size: 12px;
                            ">
                                <option value="alchemy">炼丹</option>
                                <option value="forge">炼器</option>
                                <option value="talisman">制符</option>
                            </select>
                        </div>

                        <div style="margin-bottom: 10px;">
                            <span style="font-size: 11px; color: ${v.textSecondary};">许愿目标:</span>
                            <select id="lv-wish-target" class="lv-select" style="
                                width: 100%;
                                margin-top: 6px;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 8px 10px;
                                border-radius: 6px;
                                font-size: 12px;
                            ">
                                <option value="">-- 选择许愿目标 --</option>
                            </select>
                        </div>

                        <div style="margin-bottom: 10px;">
                            <span style="font-size: 11px; color: ${v.textSecondary};">目标品质:</span>
                            <select id="lv-wish-rarity" class="lv-select" style="
                                width: 100%;
                                margin-top: 6px;
                                background: ${v.bgInput};
                                border: 1px solid ${v.borderColor};
                                color: ${v.textPrimary};
                                padding: 8px 10px;
                                border-radius: 6px;
                                font-size: 12px;
                            ">
                                <option value="1">普通</option>
                                <option value="2">优秀</option>
                                <option value="3">稀有</option>
                                <option value="4" selected>史诗</option>
                                <option value="5">传说</option>
                            </select>
                        </div>
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

                    <!-- 高级设置折叠面板 -->
                    <div class="lv-card" style="
                        margin-bottom: 16px;
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 12px;
                        overflow: hidden;
                    ">
                        <div id="lv-advanced-toggle" style="
                            padding: 14px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            background: ${v.isDark ? 'rgba(201,153,58,0.08)' : 'rgba(184,70,62,0.05)'};
                            transition: all 0.2s;
                        " onmouseover="this.style.background='${v.isDark ? 'rgba(201,153,58,0.15)' : 'rgba(184,70,62,0.1)'}'" onmouseout="this.style.background='${v.isDark ? 'rgba(201,153,58,0.08)' : 'rgba(184,70,62,0.05)'}'">
                            <div style="
                                font-size: 13px;
                                color: ${v.textGold};
                                font-weight: bold;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                            ">
                                <span id="lv-advanced-icon">▶</span> 高级设置
                            </div>
                            <span style="font-size: 11px; color: ${v.textMuted};">自适应间隔 / 自动停止</span>
                        </div>
                        
                        <div id="lv-advanced-content" style="display: none; padding: 14px; border-top: 1px solid ${v.borderColor};">
                            <!-- 自适应间隔设置 -->
                            <div style="margin-bottom: 16px;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 12px;">
                                    <input type="checkbox" id="lv-adaptive-interval" checked style="accent-color: ${v.accentGold};">
                                    <span style="font-size: 12px; font-weight: bold; color: ${v.textPrimary};">启用自适应间隔</span>
                                    <span style="font-size: 11px; color: ${v.textMuted};">(成功加速/失败减速)</span>
                                </label>
                                
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-left: 26px;">
                                    <div>
                                        <span style="font-size: 11px; color: ${v.textSecondary};">最小间隔</span>
                                        <input type="number" id="lv-min-interval" value="10" min="5" max="60" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        ">
                                    </div>
                                    <div>
                                        <span style="font-size: 11px; color: ${v.textSecondary};">最大间隔</span>
                                        <input type="number" id="lv-max-interval" value="60" min="10" max="300" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        ">
                                    </div>
                                    <div>
                                        <span style="font-size: 11px; color: ${v.textSecondary};">成功加速(秒)</span>
                                        <input type="number" id="lv-success-decrease" value="2" min="0" max="10" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        ">
                                    </div>
                                    <div>
                                        <span style="font-size: 11px; color: ${v.textSecondary};">失败减速(秒)</span>
                                        <input type="number" id="lv-error-increase" value="5" min="0" max="20" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        ">
                                    </div>
                                </div>
                            </div>

                            <!-- 分隔线 -->
                            <div style="height: 1px; background: ${v.borderColor}; margin: 12px 0;"></div>

                            <!-- 自动售卖设置 -->
                            <div style="margin-bottom: 16px;">
                                <div style="
                                    background: ${v.isDark ? 'rgba(184,70,62,0.15)' : 'rgba(184,70,62,0.1)'};
                                    border: 1px solid ${v.accentRed};
                                    border-radius: 8px;
                                    padding: 12px;
                                    margin-bottom: 12px;
                                ">
                                    <div style="
                                        display: flex;
                                        align-items: center;
                                        gap: 8px;
                                        margin-bottom: 8px;
                                        color: ${v.accentRed};
                                        font-weight: bold;
                                        font-size: 12px;
                                    ">
                                        <span style="font-size: 16px;">⚠️</span>
                                        <span>自动售卖风险提示</span>
                                    </div>
                                    <div style="
                                        font-size: 11px;
                                        color: ${v.textSecondary};
                                        line-height: 1.6;
                                    ">
                                        启用自动售卖后，系统会出售背包中<strong style="color: ${v.textPrimary};">所有</strong>符合条件的物品，<strong style="color: ${v.accentRed};">不仅仅是本次炼制的</strong>。请谨慎设置品质上限，避免误售珍贵物品。
                                    </div>
                                    <label style="
                                        display: flex;
                                        align-items: center;
                                        gap: 8px;
                                        margin-top: 10px;
                                        cursor: pointer;
                                        font-size: 11px;
                                        color: ${v.textPrimary};
                                    ">
                                        <input type="checkbox" id="lv-autosell-confirm" style="accent-color: ${v.accentRed};">
                                        <span style="font-weight: bold;">我已了解风险，启用自动售卖</span>
                                    </label>
                                </div>

                                <!-- 自动售卖配置区域（默认禁用，需确认后才可编辑） -->
                                <div id="lv-autosell-config" style="opacity: 0.5; pointer-events: none;">
                                    <div style="font-size: 12px; color: ${v.textGold}; font-weight: bold; margin-bottom: 10px;">
                                        自动售卖配置
                                    </div>
                                    
                                    <!-- 批量出售模式 -->
                                    <label style="
                                        display: flex;
                                        align-items: center;
                                        gap: 10px;
                                        margin-bottom: 10px;
                                        padding: 8px;
                                        background: ${v.isDark ? 'rgba(201,153,58,0.1)' : 'rgba(184,70,62,0.08)'};
                                        border-radius: 8px;
                                        cursor: pointer;
                                    ">
                                        <input type="checkbox" id="lv-autosell-batch-mode" style="
                                            width: 18px;
                                            height: 18px;
                                            accent-color: ${v.accentGold};
                                        ">
                                        <div style="flex: 1;">
                                            <div style="color: ${v.textGold}; font-weight: bold; font-size: 12px;">批量出售模式</div>
                                            <div style="color: ${v.textMuted}; font-size: 11px;">一键出售所有类型物品（更快）</div>
                                        </div>
                                        <select id="lv-autosell-batch-rarity" class="lv-select" style="
                                            width: 80px;
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

                                    <!-- 分隔线 -->
                                    <div id="lv-autosell-separator" style="
                                        height: 1px;
                                        background: ${v.borderColor};
                                        margin: 10px 0;
                                    "></div>

                                    <!-- 卖丹药 -->
                                    <label id="lv-autosell-pills-row" style="
                                        display: flex;
                                        align-items: center;
                                        gap: 10px;
                                        margin-bottom: 8px;
                                        cursor: pointer;
                                    ">
                                        <input type="checkbox" id="lv-autosell-pills" style="
                                            width: 18px;
                                            height: 18px;
                                            accent-color: ${v.accentJade};
                                        ">
                                        <span style="color: ${v.textJade}; font-weight: bold; font-size: 12px;">丹药</span>
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
                                    <label id="lv-autosell-equip-row" style="
                                        display: flex;
                                        align-items: center;
                                        gap: 10px;
                                        margin-bottom: 8px;
                                        cursor: pointer;
                                    ">
                                        <input type="checkbox" id="lv-autosell-equip" style="
                                            width: 18px;
                                            height: 18px;
                                            accent-color: ${v.accentGold};
                                        ">
                                        <span style="color: ${v.textGold}; font-weight: bold; font-size: 12px;">装备</span>
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
                                </div>
                            </div>

                            <!-- 自动停止设置 -->
                            <div>
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 12px;">
                                    <input type="checkbox" id="lv-autostop-enabled" checked style="accent-color: ${v.accentRed};">
                                    <span style="font-size: 12px; font-weight: bold; color: ${v.textPrimary};">启用自动停止</span>
                                </label>
                                
                                <div style="margin-left: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lv-autostop-spirit" checked style="accent-color: ${v.accentGold};">
                                        <span>灵石不足</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lv-autostop-mp" checked style="accent-color: ${v.accentGold};">
                                        <span>灵力不足</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lv-autostop-stamina" checked style="accent-color: ${v.accentGold};">
                                        <span>神识不足</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lv-autostop-inventory" checked style="accent-color: ${v.accentGold};">
                                        <span>背包满</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lv-autostop-meditating" checked style="accent-color: ${v.accentGold};">
                                        <span>冥想中</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lv-autostop-cost" checked style="accent-color: ${v.accentGold};">
                                        <span>达到最大花费</span>
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
                                        <input type="checkbox" id="lv-autostop-error" checked style="accent-color: ${v.accentGold};">
                                        <span>连续错误</span>
                                    </label>
                                </div>

                                <!-- 阈值设置 -->
                                <div style="margin-left: 26px; margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                                    <div>
                                        <span style="font-size: 11px; color: ${v.textSecondary};">灵石阈值</span>
                                        <input type="number" id="lv-spirit-threshold" value="100" min="0" step="100" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        " title="灵石低于此值时停止">
                                    </div>
                                    <div>
                                        <span style="font-size: 11px; color: ${v.textSecondary};">灵力阈值</span>
                                        <input type="number" id="lv-mp-threshold" value="10" min="0" step="1" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        " title="灵力低于此值时停止">
                                    </div>
                                    <div>
                                        <span style="font-size: 11px; color: ${v.textSecondary};">神识阈值</span>
                                        <input type="number" id="lv-stamina-threshold" value="10" min="0" step="1" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        " title="神识低于此值时停止">
                                    </div>
                                </div>
                                
                                <div style="margin-left: 26px; margin-top: 12px; display: flex; gap: 10px;">
                                    <div style="flex: 1;">
                                        <span style="font-size: 11px; color: ${v.textSecondary};">最大花费(灵石)</span>
                                        <input type="number" id="lv-max-craft-cost" value="100000" min="1000" step="1000" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        ">
                                    </div>
                                    <div style="flex: 1;">
                                        <span style="font-size: 11px; color: ${v.textSecondary};">最大连续错误</span>
                                        <input type="number" id="lv-max-errors" value="5" min="1" max="20" style="
                                            width: 100%;
                                            background: ${v.bgInput};
                                            border: 1px solid ${v.borderColor};
                                            color: ${v.textPrimary};
                                            padding: 6px 10px;
                                            border-radius: 6px;
                                            font-size: 12px;
                                            margin-top: 4px;
                                        ">
                                    </div>
                                </div>
                            </div>
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
                        ">开始炼造</button>

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
                        ">执行一次</button>

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

            $('#lv-btn-close')?.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closePanel();
            });

            $('#lv-craft-panel')?.addEventListener('click', (e) => {
                if (e.target.id === 'lv-craft-panel') {
                    this.closePanel();
                }
            });

            $('#lv-btn-minimize')?.addEventListener('click', () => this.toggleMinimize());

            $('#lv-btn-refresh')?.addEventListener('click', async () => {
                const btn = $('#lv-btn-refresh');
                btn.textContent = '刷新中...';
                btn.disabled = true;
                await CraftManager.loadRecipes();
                this.refreshRecipeSelects();
                btn.textContent = '刷新配方列表';
                btn.disabled = false;
            });

            $('#lv-incarnation-type')?.addEventListener('change', () => {
                this.updateIncarnationTargetSelect();
            });

            $('#lv-wish-type')?.addEventListener('change', () => {
                this.updateWishTargetSelect();
            });

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

            $('#lv-btn-start')?.addEventListener('click', () => {
                if (STATE.running) {
                    CraftManager.stop();
                } else {
                    CraftManager.start();
                }
            });

            $('#lv-btn-once')?.addEventListener('click', () => {
                this.saveConfigFromPanel();
                CraftManager.executeOnce();
            });

            $('#lv-btn-save')?.addEventListener('click', () => {
                this.saveConfigFromPanel();
                Logger.success('配置已保存');
            });

            $('#lv-autosell-confirm')?.addEventListener('change', () => {
                this.updateAutoSellEnabled();
            });

            $('#lv-autosell-batch-mode')?.addEventListener('change', () => {
                this.updateBatchSellMode();
            });

            $('#lv-advanced-toggle')?.addEventListener('click', () => {
                const content = $('#lv-advanced-content');
                const icon = $('#lv-advanced-icon');
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '▼';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '▶';
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && STATE.panelOpen) {
                    this.closePanel();
                }
            });
        },

        updateAutoSellEnabled() {
            const confirmed = $('#lv-autosell-confirm')?.checked || false;
            const configArea = $('#lv-autosell-config');
            if (configArea) {
                if (confirmed) {
                    configArea.style.opacity = '1';
                    configArea.style.pointerEvents = 'auto';
                } else {
                    configArea.style.opacity = '0.5';
                    configArea.style.pointerEvents = 'none';
                    // 取消勾选时，同时禁用所有自动售卖选项
                    const batchMode = $('#lv-autosell-batch-mode');
                    const pills = $('#lv-autosell-pills');
                    const equip = $('#lv-autosell-equip');
                    if (batchMode) batchMode.checked = false;
                    if (pills) pills.checked = false;
                    if (equip) equip.checked = false;
                    this.updateBatchSellMode();
                }
            }
        },

        updateBatchSellMode() {
            const isBatchMode = $('#lv-autosell-batch-mode')?.checked || false;
            const separator = $('#lv-autosell-separator');
            const pillsRow = $('#lv-autosell-pills-row');
            const equipRow = $('#lv-autosell-equip-row');

            if (isBatchMode) {
                if (separator) separator.style.display = 'none';
                if (pillsRow) pillsRow.style.display = 'none';
                if (equipRow) equipRow.style.display = 'none';
            } else {
                if (separator) separator.style.display = 'block';
                if (pillsRow) pillsRow.style.display = 'flex';
                if (equipRow) equipRow.style.display = 'flex';
            }
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

        updateWishTargetSelect() {
            const type = $('#lv-wish-type')?.value || 'alchemy';
            const select = $('#lv-wish-target');
            if (!select) return;

            const cache = type === 'alchemy' ? CACHE.alchemy :
                         type === 'forge' ? CACHE.forge : CACHE.talisman;
            const nameField = type === 'alchemy' ? 'pillName' : 'name';

            select.innerHTML = '<option value="">-- 选择许愿目标 --</option>' +
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

        async togglePanel() {
            const panel = $('#lv-craft-panel');
            if (!panel) {
                await this.createPanel();

                const newPanel = $('#lv-craft-panel');
                if (newPanel) {
                    STATE.panelOpen = true;
                    newPanel.style.display = 'flex';
                    this.refreshRecipeSelects();
                    this.updateIncarnationTargetSelect();
                    this.updateIncarnationStatus();
                }
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

        closePanel() {
            const panel = $('#lv-craft-panel');
            if (panel) {
                STATE.panelOpen = false;
                panel.style.display = 'none';
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

            CONFIG.autoSell.useBatchAPI = $('#lv-autosell-batch-mode')?.checked || false;
            CONFIG.autoSell.batchMaxRarity = parseInt($('#lv-autosell-batch-rarity')?.value || '2');

            CONFIG.autoSell.pills.enabled = $('#lv-autosell-pills')?.checked || false;
            CONFIG.autoSell.pills.maxRarity = parseInt($('#lv-autosell-pills-rarity')?.value || '2');

            CONFIG.autoSell.equipment.enabled = $('#lv-autosell-equip')?.checked || false;
            CONFIG.autoSell.confirmed = $('#lv-autosell-confirm')?.checked || false;
            CONFIG.autoSell.equipment.maxRarity = parseInt($('#lv-autosell-equip-rarity')?.value || '2');

            CONFIG.wishLock.enabled = $('#lv-wish-enabled')?.checked || false;
            CONFIG.wishLock.type = $('#lv-wish-type')?.value || 'alchemy';
            CONFIG.wishLock.targetName = $('#lv-wish-target')?.value || '';
            CONFIG.wishLock.targetRarity = parseInt($('#lv-wish-rarity')?.value || '4');

            CONFIG.general.useQuickBuy = $('#lv-use-quickbuy')?.checked !== false;
            CONFIG.general.autoStart = $('#lv-auto-start')?.checked || false;
            CONFIG.general.batchSize = parseInt($('#lv-batch-size')?.value || '10');
            CONFIG.general.maxQuickBuyCost = parseInt($('#lv-max-cost')?.value || '5000');
            CONFIG.general.autoCraftInterval = parseInt($('#lv-interval')?.value || '30');

            CONFIG.general.adaptiveInterval = $('#lv-adaptive-interval')?.checked !== false;
            CONFIG.general.minInterval = parseInt($('#lv-min-interval')?.value || '10');
            CONFIG.general.maxInterval = parseInt($('#lv-max-interval')?.value || '60');
            CONFIG.general.successDecrease = parseInt($('#lv-success-decrease')?.value || '2');
            CONFIG.general.errorIncrease = parseInt($('#lv-error-increase')?.value || '5');

            CONFIG.general.autoStop.enabled = $('#lv-autostop-enabled')?.checked !== false;
            CONFIG.general.autoStop.onInsufficientSpirit = $('#lv-autostop-spirit')?.checked !== false;
            CONFIG.general.autoStop.spiritThreshold = parseInt($('#lv-spirit-threshold')?.value || '100');
            CONFIG.general.autoStop.onInsufficientMp = $('#lv-autostop-mp')?.checked !== false;
            CONFIG.general.autoStop.mpThreshold = parseInt($('#lv-mp-threshold')?.value || '10');
            CONFIG.general.autoStop.onInsufficientStamina = $('#lv-autostop-stamina')?.checked !== false;
            CONFIG.general.autoStop.staminaThreshold = parseInt($('#lv-stamina-threshold')?.value || '10');
            CONFIG.general.autoStop.onInventoryFull = $('#lv-autostop-inventory')?.checked !== false;
            CONFIG.general.autoStop.onMeditating = $('#lv-autostop-meditating')?.checked !== false;
            CONFIG.general.autoStop.onMaxCostReached = $('#lv-autostop-cost')?.checked !== false;
            CONFIG.general.autoStop.stopOnError = $('#lv-autostop-error')?.checked !== false;
            CONFIG.general.autoStop.maxCraftCost = parseInt($('#lv-max-craft-cost')?.value || '100000');
            CONFIG.general.autoStop.maxConsecutiveErrors = parseInt($('#lv-max-errors')?.value || '5');

            localStorage.setItem('lv_craft_config_v3', JSON.stringify(CONFIG));
        },

        // 深度合并配置对象
        mergeConfig(target, source) {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    // 递归合并对象
                    target[key] = target[key] || {};
                    this.mergeConfig(target[key], source[key]);
                } else {
                    // 直接赋值基本类型
                    target[key] = source[key];
                }
            }
        },

        loadConfigToPanel() {
            const saved = localStorage.getItem('lv_craft_config_v3');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // 深度合并配置，确保新字段有默认值
                    this.mergeConfig(CONFIG, parsed);
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

            // 安全获取配置值，提供默认值
            const getVal = (obj, key, def) => obj && obj[key] !== undefined ? obj[key] : def;

            setValue('#lv-target-alchemy', getVal(CONFIG.targets, 'alchemy', ''));
            setValue('#lv-target-forge', getVal(CONFIG.targets, 'forge', ''));
            setValue('#lv-target-talisman', getVal(CONFIG.targets, 'talisman', ''));

            setChecked('#lv-incarnation-enabled', getVal(CONFIG.targets.incarnation, 'enabled', false));
            setValue('#lv-incarnation-type', getVal(CONFIG.targets.incarnation, 'type', 'alchemy'));
            setValue('#lv-incarnation-target', getVal(CONFIG.targets.incarnation, 'target', ''));

            setChecked('#lv-autosell-batch-mode', getVal(CONFIG.autoSell, 'useBatchAPI', false));
            setValue('#lv-autosell-batch-rarity', getVal(CONFIG.autoSell, 'batchMaxRarity', 2));

            setChecked('#lv-autosell-pills', getVal(CONFIG.autoSell.pills, 'enabled', false));
            setValue('#lv-autosell-pills-rarity', getVal(CONFIG.autoSell.pills, 'maxRarity', 2));

            setChecked('#lv-autosell-equip', getVal(CONFIG.autoSell.equipment, 'enabled', false));
            setValue('#lv-autosell-equip-rarity', getVal(CONFIG.autoSell.equipment, 'maxRarity', 2));

            // 自动售卖确认
            setChecked('#lv-autosell-confirm', getVal(CONFIG.autoSell, 'confirmed', false));
            this.updateAutoSellEnabled();

            // 许愿锁定设置
            setChecked('#lv-wish-enabled', getVal(CONFIG.wishLock, 'enabled', false));
            setValue('#lv-wish-type', getVal(CONFIG.wishLock, 'type', 'alchemy'));
            this.updateWishTargetSelect();
            setValue('#lv-wish-target', getVal(CONFIG.wishLock, 'targetName', ''));
            setValue('#lv-wish-rarity', getVal(CONFIG.wishLock, 'targetRarity', 4));

            UI.updateBatchSellMode();

            setChecked('#lv-use-quickbuy', getVal(CONFIG.general, 'useQuickBuy', true));
            setChecked('#lv-auto-start', getVal(CONFIG.general, 'autoStart', false));
            setValue('#lv-batch-size', getVal(CONFIG.general, 'batchSize', 10));
            setValue('#lv-max-cost', getVal(CONFIG.general, 'maxQuickBuyCost', 5000));
            setValue('#lv-interval', getVal(CONFIG.general, 'autoCraftInterval', 30));

            setChecked('#lv-adaptive-interval', getVal(CONFIG.general, 'adaptiveInterval', true));
            setValue('#lv-min-interval', getVal(CONFIG.general, 'minInterval', 10));
            setValue('#lv-max-interval', getVal(CONFIG.general, 'maxInterval', 60));
            setValue('#lv-success-decrease', getVal(CONFIG.general, 'successDecrease', 2));
            setValue('#lv-error-increase', getVal(CONFIG.general, 'errorIncrease', 5));

            // 自动停止设置 - 确保autoStop对象存在
            const autoStop = CONFIG.general.autoStop || {};
            setChecked('#lv-autostop-enabled', getVal(autoStop, 'enabled', true));
            setChecked('#lv-autostop-spirit', getVal(autoStop, 'onInsufficientSpirit', true));
            setValue('#lv-spirit-threshold', getVal(autoStop, 'spiritThreshold', 100));
            setChecked('#lv-autostop-mp', getVal(autoStop, 'onInsufficientMp', true));
            setValue('#lv-mp-threshold', getVal(autoStop, 'mpThreshold', 10));
            setChecked('#lv-autostop-stamina', getVal(autoStop, 'onInsufficientStamina', true));
            setValue('#lv-stamina-threshold', getVal(autoStop, 'staminaThreshold', 10));
            setChecked('#lv-autostop-inventory', getVal(autoStop, 'onInventoryFull', true));
            setChecked('#lv-autostop-meditating', getVal(autoStop, 'onMeditating', true));
            setChecked('#lv-autostop-cost', getVal(autoStop, 'onMaxCostReached', true));
            setChecked('#lv-autostop-error', getVal(autoStop, 'stopOnError', true));
            setValue('#lv-max-craft-cost', getVal(autoStop, 'maxCraftCost', 100000));
            setValue('#lv-max-errors', getVal(autoStop, 'maxConsecutiveErrors', 5));
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
                    status.textContent = '运行中';
                    status.style.color = v.textJade;
                }
                if (btn) {
                    btn.textContent = '停止炼造';
                    btn.style.background = v.gradientJade;
                }
            } else {
                if (status) {
                    status.textContent = '未运行';
                    status.style.color = v.textPrimary;
                }
                if (btn) {
                    btn.textContent = '开始炼造';
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
            if (sold) sold.textContent = STATE.stats.soldPills + STATE.stats.soldEquip;
            if (spent) spent.textContent = STATE.stats.spent;
        }
    };

    
    // 炼造管理 - 核心业务逻辑控制
    const CraftManager = {
        async loadRecipes(forceRefresh = false) {
            try {
                if (!forceRefresh && CACHE.isValid('alchemy') && CACHE.isValid('forge') && CACHE.isValid('talisman')) {
                    Logger.info('使用缓存的配方数据');
                    UI.refreshRecipeSelects();
                    return;
                }

                Logger.info('正在加载配方...');

                try {
                    const res = await CACHE.getOrFetch('alchemy', () => API.getAlchemyRecipes(), forceRefresh);
                    if (res.data?.recipes) {
                        CACHE.alchemy = res.data.recipes;
                        Logger.success(`炼丹配方: ${CACHE.alchemy.length}个`);
                    }
                } catch (e) {
                    Logger.warn('炼丹配方加载失败: ' + e.message);
                }

                try {
                    const res = await CACHE.getOrFetch('forge', () => API.getForgeRecipes(), forceRefresh);
                    if (res.data?.recipes) {
                        CACHE.forge = res.data.recipes;
                        Logger.success(`炼器配方: ${CACHE.forge.length}个`);
                    }
                } catch (e) {
                    Logger.warn('炼器配方加载失败: ' + e.message);
                }

                try {
                    const res = await CACHE.getOrFetch('talisman', () => API.getTalismanRecipes(), forceRefresh);
                    if (res.data?.recipes) {
                        CACHE.talisman = res.data.recipes;
                        Logger.success(`制符配方: ${CACHE.talisman.length}个`);
                    }
                } catch (e) {
                    Logger.warn('制符配方加载失败: ' + e.message);
                }

                CACHE.lastUpdate = Date.now();
                UI.refreshRecipeSelects();

                UI.enableSidebarButton();
            } catch (e) {
                Logger.error('加载配方失败: ' + e.message);

                UI.enableSidebarButton();
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
            STATE.resetStats();
            UI.updateRunStatus();
            Logger.success('自动炼造已启动');

            const runWithAdaptiveInterval = async () => {
                if (!STATE.running) return;
                
                await this.executeOnce();
                
                if (STATE.running) {

                    const interval = CONFIG.general.adaptiveInterval 
                        ? STATE.monitor.currentInterval 
                        : CONFIG.general.autoCraftInterval;
                    
                    STATE.autoCraftTimer = setTimeout(runWithAdaptiveInterval, interval * 1000);
                }
            };
            
            runWithAdaptiveInterval();
        },

        stop(reason = null) {
            if (!STATE.running) return;

            STATE.running = false;
            if (STATE.autoCraftTimer) {
                clearTimeout(STATE.autoCraftTimer);
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
            // 检测冥想状态 - 冥想中跳过本次但不停止，下次继续检测
            const isMeditating = await this.isMeditating();
            STATE.monitor.isMeditating = isMeditating;
            if (isMeditating) {
                Logger.warn('冥想中无法炼造，跳过本次执行，退出冥想后将自动恢复');
                // 冥想时不停止，只是跳过本次，下次执行时重新检测
                return;
            }

            const statusCheck = await this.checkPlayerStatus();
            if (!statusCheck.canCraft) {
                this.stop(statusCheck.reason);
                return;
            }

            const stopCheck = STATE.shouldStop();
            if (stopCheck.shouldStop) {
                this.stop(stopCheck.reason);
                return;
            }

            // 设置许愿目标
            await this.setWishTarget();

            try {
                let craftedCount = 0;
                let hasError = false;

                if (CONFIG.targets.alchemy) {
                    try {
                        const result = await this.craftByName('alchemy', CONFIG.targets.alchemy);
                        if (result && result.count) {
                            craftedCount += result.count;
                            STATE.recordSuccess();
                        }
                    } catch (e) {
                        hasError = true;
                        const errorCount = STATE.recordError(e.errorType);
                        Logger.error(`炼丹失败: ${e.message}`);
                        

                        if (e.errorType === API.ErrorTypes.INSUFFICIENT && 
                            (e.message.includes('灵石') || e.message.includes('神识'))) {
                            const stopCheck = STATE.shouldStop();
                            if (stopCheck.shouldStop) {
                                this.stop(stopCheck.reason);
                                return;
                            }
                        }
                    }
                }

                if (CONFIG.targets.forge) {
                    try {
                        const result = await this.craftByName('forge', CONFIG.targets.forge);
                        if (result && result.count) {
                            craftedCount += result.count;
                            STATE.recordSuccess();
                        }
                    } catch (e) {
                        hasError = true;
                        const errorCount = STATE.recordError(e.errorType);
                        Logger.error(`炼器失败: ${e.message}`);
                    }
                }

                if (CONFIG.targets.talisman) {
                    try {
                        const result = await this.craftByName('talisman', CONFIG.targets.talisman);
                        if (result && result.count) {
                            craftedCount += result.count;
                            STATE.recordSuccess();
                        }
                    } catch (e) {
                        hasError = true;
                        const errorCount = STATE.recordError(e.errorType);
                        Logger.error(`制符失败: ${e.message}`);
                    }
                }

                if (CONFIG.targets.incarnation.enabled && CONFIG.targets.incarnation.target) {
                    try {
                        await this.craftIncarnation();
                        STATE.recordSuccess();
                    } catch (e) {
                        hasError = true;
                        STATE.recordError(e.errorType);
                        Logger.error(`化身炼造失败: ${e.message}`);
                    }
                }

                await this.autoSell();

                UI.updateStats();

                if (craftedCount === 0 && (CONFIG.targets.alchemy || CONFIG.targets.forge || CONFIG.targets.talisman)) {
                    STATE.consecutiveEmptyCrafts = (STATE.consecutiveEmptyCrafts || 0) + 1;
                    if (STATE.consecutiveEmptyCrafts >= 3) {
                        this.stop('连续多次未成功炼制，可能是神识/灵力/材料不足');
                        STATE.consecutiveEmptyCrafts = 0;
                    }
                } else {
                    STATE.consecutiveEmptyCrafts = 0;
                }

                if (!hasError && craftedCount > 0) {
                    STATE.monitor.consecutiveErrors = 0;
                }

                if (CONFIG.general.adaptiveInterval) {
                    Logger.info(`当前炼制间隔: ${STATE.monitor.currentInterval}秒`);
                }

            } catch (e) {
                Logger.error('执行失败: ' + e.message);
                STATE.recordError();
            }
        },

        async checkPlayerStatus() {
            try {
                const res = await API.getPlayerInfo();
                if (res.code !== 200 || !res.data) {
                    return { canCraft: false, reason: '无法获取玩家信息' };
                }

                const player = res.data;

                // 更新状态监控
                STATE.updateMonitor(player);

                // 使用 shouldStop 的统一检测逻辑
                const stopCheck = STATE.shouldStop();
                if (stopCheck.shouldStop) {
                    return { canCraft: false, reason: stopCheck.reason };
                }

                // 快速购买模式下的额外灵石检查
                if (CONFIG.general.useQuickBuy) {
                    const stones = player.lowerStone || player.spiritStones || 0;
                    const threshold = CONFIG.general.autoStop.spiritThreshold || 100;
                    if (stones < threshold) {
                        return { canCraft: false, reason: `灵石不足(${stones}<${threshold})，无法快速购买材料` };
                    }
                }

                return { canCraft: true, reason: null };
            } catch (e) {
                // API 调用失败时允许继续，避免网络问题中断炼造
                return { canCraft: true, reason: null };
            }
        },

        // 设置许愿目标
        async setWishTarget() {
            if (!CONFIG.wishLock.enabled || !CONFIG.wishLock.targetName) return;

            const type = CONFIG.wishLock.type || 'alchemy';
            const cache = type === 'alchemy' ? CACHE.alchemy :
                         type === 'forge' ? CACHE.forge : CACHE.talisman;
            const nameField = type === 'alchemy' ? 'pillName' : 'name';
            const idField = type === 'alchemy' ? 'pillId' : 'recipeId';

            try {
                // 在对应配方中查找目标
                const recipe = cache.find(r => r[nameField] === CONFIG.wishLock.targetName);
                if (!recipe || !recipe[idField]) {
                    Logger.warn(`许愿目标未找到: ${CONFIG.wishLock.targetName}`);
                    return;
                }

                // targetId格式: id_品质 (如 pill123_4)
                const targetId = `${recipe[idField]}_${CONFIG.wishLock.targetRarity}`;
                const res = await API.setWishTarget(targetId);
                if (res.code === 200) {
                    const typeName = type === 'alchemy' ? '炼丹' : type === 'forge' ? '炼器' : '制符';
                    Logger.info(`已设置${typeName}许愿目标: ${CONFIG.wishLock.targetName} (品质${CONFIG.wishLock.targetRarity})`);
                } else {
                    Logger.warn(`设置许愿目标失败: ${res.message || '未知错误'}`);
                }
            } catch (e) {
                Logger.warn(`设置许愿目标失败: ${e.message}`);
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
            // 优先使用API返回的canQuickBuy，如果没有则根据quickBuyCost判断
            const canQuickBuy = recipe.canQuickBuy !== undefined ? recipe.canQuickBuy : (recipe.quickBuyCost > 0);

            // 调试日志
            Logger.info(`${name} 配方信息: canCraft=${canCraft}, canQuickBuy=${canQuickBuy}, quickBuyCost=${recipe.quickBuyCost}, id=${id}`);

            if (!canCraft) {
                if (!canQuickBuy || !CONFIG.general.useQuickBuy) {
                    Logger.warn(`${name} 不可炼制(canQuickBuy=${canQuickBuy}, useQuickBuy=${CONFIG.general.useQuickBuy})`);
                    return { count: 0 };
                }
                Logger.info(`${name} 材料不足，将使用灵石补充`);
            }

            // 使用配置的batchSize作为目标炼制次数
            const requestCount = Math.min(CONFIG.general.batchSize, 50);

            // 计算基于材料的最大可炼制次数
            let maxCraftableCount = requestCount;
            if (recipe.materials && recipe.materials.length > 0) {
                const materialLimits = recipe.materials.map(m => {
                    if (!m.need || m.need <= 0) return requestCount;
                    return Math.floor((m.have || 0) / m.need);
                });
                maxCraftableCount = Math.min(...materialLimits, requestCount);
                Logger.info(`${name} 材料情况: 目标${requestCount}次, 可炼${maxCraftableCount}次, 材料详情:`, recipe.materials.map(m => `${m.name}:${m.have}/${m.need}`).join(', '));
            }

            // 检查材料是否足够
            const needBuy = recipe.materials?.some(m => m.have < m.need * requestCount);
            if (needBuy && CONFIG.general.useQuickBuy) {
                // 计算需要补充的份数 = 目标次数 - 现有材料可炼次数
                const buyAmount = requestCount - maxCraftableCount;
                const totalCost = recipe.quickBuyCost * buyAmount;
                
                Logger.info(`${name} 需要补充: ${buyAmount}份, 预计费用: ${totalCost}灵石, canQuickBuy=${canQuickBuy}`);
                
                if (totalCost > CONFIG.general.maxQuickBuyCost) {
                    Logger.warn(`${name} 批量补充费用过高(${totalCost}灵石)，尝试单次炼制`);
                    return this.craftSingle(type, name);
                }

                Logger.info(`${name} 补充${buyAmount}份材料中...`);
                try {
                    const buyRes = await API.quickBuyMats(type, id, buyAmount);
                    if (buyRes.code === 200) {
                        STATE.stats.spent += totalCost;
                        Logger.success(`${name} 材料补充成功，花费${totalCost}灵石`);
                    } else if (buyRes.message && buyRes.message.includes('无需补充')) {
                        // 材料已经足够，直接尝试炼制
                        Logger.info(`${name} 材料已足够，直接炼制${maxCraftableCount}次`);
                        // 调整请求数量为实际可炼次数
                        const adjustedRequestCount = maxCraftableCount;
                        let res;
                        if (type === 'alchemy') {
                            res = await API.batchCraftAlchemy(id, adjustedRequestCount);
                        } else if (type === 'forge') {
                            res = await API.batchCraftForge(id, adjustedRequestCount);
                        } else {
                            res = await API.batchCraftTalisman(id, adjustedRequestCount);
                        }
                        if (res.code === 200) {
                            let actualCount = res.data?.count || res.data?.crafted;
                            if (!actualCount && res.data?.message) {
                                const match = res.data.message.match(/(\d+)次/);
                                if (match) actualCount = parseInt(match[1]);
                            }
                            actualCount = actualCount || adjustedRequestCount;
                            Logger.success(res.data?.message || `${name} x${actualCount} 炼制成功`);
                            STATE.stats.crafted += actualCount;
                            return { count: actualCount };
                        } else {
                            Logger.error(`${name} 炼制失败: ${res.message}`);
                            return { count: 0 };
                        }
                    } else {
                        Logger.error(`${name} 补充失败: ${buyRes.message}`);
                        return { count: 0 };
                    }
                } catch (e) {
                    if (e.message && e.message.includes('无需补充')) {
                        // 材料已经足够，直接尝试炼制
                        Logger.info(`${name} 材料已足够，直接炼制${maxCraftableCount}次`);
                        const adjustedRequestCount = maxCraftableCount;
                        let res;
                        if (type === 'alchemy') {
                            res = await API.batchCraftAlchemy(id, adjustedRequestCount);
                        } else if (type === 'forge') {
                            res = await API.batchCraftForge(id, adjustedRequestCount);
                        } else {
                            res = await API.batchCraftTalisman(id, adjustedRequestCount);
                        }
                        if (res.code === 200) {
                            let actualCount = res.data?.count || res.data?.crafted;
                            if (!actualCount && res.data?.message) {
                                const match = res.data.message.match(/(\d+)次/);
                                if (match) actualCount = parseInt(match[1]);
                            }
                            actualCount = actualCount || adjustedRequestCount;
                            Logger.success(res.data?.message || `${name} x${actualCount} 炼制成功`);
                            STATE.stats.crafted += actualCount;
                            return { count: actualCount };
                        } else {
                            Logger.error(`${name} 炼制失败: ${res.message}`);
                            return { count: 0 };
                        }
                    }
                    Logger.error(`${name} 补充异常: ${e.message}`);
                    return { count: 0 };
                }
            } else if (needBuy && !CONFIG.general.useQuickBuy) {
                Logger.warn(`${name} 材料不足且自动补充已禁用`);
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

                    let actualCount = res.data?.count || res.data?.crafted;
                    if (!actualCount && res.data?.message) {

                        const match = res.data.message.match(/(\d+)次/);
                        if (match) {
                            actualCount = parseInt(match[1]);
                        }
                    }
                    actualCount = actualCount || 1;

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

                if (CONFIG.autoSell.useBatchAPI) {
                    const maxRarity = CONFIG.autoSell.batchMaxRarity;

                    const previewRes = await API.previewBatchSell(maxRarity, 'all');
                    if (previewRes.code === 200 && previewRes.data && previewRes.data.count > 0) {
                        const { count, totalGold, items } = previewRes.data;
                        Logger.info(`批量出售预览: ${count}件，预计获得${totalGold}灵石`);

                        let pillCount = 0, equipCount = 0;
                        (items || []).forEach(item => {
                            if (item.type === 'pill') pillCount += item.count;
                            else if (item.type === 'equipment') equipCount += item.count;
                        });
                        Logger.info(`包含 - 丹药:${pillCount} 装备:${equipCount}`);

                        const sellRes = await API.batchSell(maxRarity, 'all');
                        if (sellRes.code === 200 && sellRes.data) {
                            const { count: soldCount, totalGold: gotGold } = sellRes.data;
                            STATE.stats.soldPills += pillCount;
                            STATE.stats.soldEquip += equipCount;
                            Logger.success(`批量售出 ${soldCount} 件物品，获得 ${gotGold} 灵石`);
                        }
                    }
                    return;
                }

                if (CONFIG.autoSell.equipment.enabled) {
                    const maxRarity = CONFIG.autoSell.equipment.maxRarity;
                    const previewRes = await API.previewBatchSell(maxRarity, 'equip');
                    if (previewRes.code === 200 && previewRes.data && previewRes.data.count > 0) {

                        const equipCount = previewRes.data.count || 0;

                        if (equipCount > 0) {
                            const sellRes = await API.batchSell(maxRarity, 'equip');
                            if (sellRes.code === 200 && sellRes.data) {
                                STATE.stats.soldEquip += equipCount;
                                Logger.success(`自动售出 ${equipCount} 件装备`);
                            }
                        }
                    }
                }

                if (CONFIG.autoSell.pills.enabled) {
                    const maxRarity = CONFIG.autoSell.pills.maxRarity;
                    const previewRes = await API.previewBatchSell(maxRarity, 'pill');
                    if (previewRes.code === 200 && previewRes.data && previewRes.data.count > 0) {
                        const pillCount = previewRes.data.count || 0;

                        if (pillCount > 0) {
                            const sellRes = await API.batchSell(maxRarity, 'pill');
                            if (sellRes.code === 200 && sellRes.data) {
                                STATE.stats.soldPills += pillCount;
                                Logger.success(`自动售出 ${pillCount} 个丹药`);
                            }
                        }
                    }
                }

            } catch (e) {
                Logger.error('自动售卖失败: ' + e.message);
            }
        },

        async isMeditating() {
            // 优先使用API获取最新的冥想状态，避免页面变量未更新
            try {
                const res = await API.getMeditateStatus();
                if (res.code === 200 && res.data) {
                    if (res.data.isMeditating || res.data.startTime > 0) {
                        return true;
                    }
                    // API返回未冥想，直接返回false（优先相信API）
                    return false;
                }
            } catch (e) {
                // API失败时回退到页面变量检测
            }

            // 回退：使用页面变量和DOM检测
            if (_win.meditationStartTime && _win.meditationStartTime > 0) return true;
            if (window.meditationStartTime && window.meditationStartTime > 0) return true;

            const meditateBtn = document.getElementById('meditateBtn');
            if (meditateBtn?.classList.contains('meditating')) return true;

            const meditationBar = document.getElementById('meditationBar');
            if (meditationBar && !meditationBar.classList.contains('hidden')) return true;

            return false;
        }
    };

    // 初始化入口
    async function init() {
        if (!location.href.includes('ling.muge.info')) return;

        Theme.initObserver();
        Logger.info('炼造助手 v3.0.0 已加载');

        // 创建侧边栏按钮
        waitForElement('.player-panel', 10000)
            .then(() => {
                UI.createSidebarButton();
                Logger.info('点击侧边栏 炼造 按钮打开配置面板');
            })
            .catch(() => {
                Logger.warn('未找到侧边栏，按钮可能无法显示');
            });

        waitForAPI().then(() => {

            CraftManager.loadRecipes();

            if (CONFIG.general.autoStart) {
                CraftManager.start();
            }
        });
    }

    // 等待游戏API就绪
    async function waitForAPI(timeout = 30000) {
        const startTime = Date.now();
        let lastError = null;

        while (Date.now() - startTime < timeout) {
            const api = API.get();
            const salt = _win.__S || window.__S;

            if (api && salt) {
                try {
                    const testRes = await api.get('/api/player/info');
                    if (testRes && (testRes.code === 200 || testRes.data)) {
                        Logger.info('API连接成功');
                        return;
                    }
                } catch (e) {
                    lastError = e.message;

                }
            }
            await new Promise(r => setTimeout(r, 500));
        }

        const api = API.get();
        const salt = _win.__S || window.__S;
        if (!api) {
            Logger.error('API对象未找到，脚本可能无法正常工作');
        } else if (!salt) {
            Logger.error('API盐值未设置，脚本可能无法正常工作');
        } else if (lastError) {
            Logger.error(`API连接失败: ${lastError}`);
        } else {
            Logger.warn('API连接超时，部分功能可能无法使用');
        }
    }

    // 等待DOM元素出现
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
// ==UserScript==
// @name         灵界 LingVerse 天道试炼刷取助手
// @namespace    lingverse-trial-bot
// @version      1.1.5
// @description  天道试炼塔自动化：自动重置、自动战斗、自动选择天赋、统计藏宝图收益
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

    // 配置管理 - 所有数值都可在面板修改
    const CONFIG = {
        // 基本设置
        enabled: false,
        maxStoneCost: 50000,         // 最大灵石花费限制
        maxRuns: 0,                  // 最大刷取次数 (0为无限制)
        targetMaps: 0,               // 目标藏宝图数量 (0为无限制)

        // 战斗设置
        delayBetweenFights: 1000,    // 战斗间隔(毫秒)
        delayAfterReset: 2000,       // 重置后等待时间(毫秒)
        delayAfterBuff: 500,         // 选择天赋后等待时间(毫秒)
        maxFightTime: 30000,         // 单次战斗最大等待时间(毫秒)

        // 天赋设置
        autoSelectBuff: true,        // 自动选择天赋
        buffStrategy: 'attack',      // 天赋选择策略: attack/defense/balance/random
        minBuffRarity: 1,            // 最小天赋品质 (1普通,2稀有,3传说)
        autoRefreshBuff: false,      // 是否自动刷新天赋选项
        refreshBuffOnNoLegendary: false, // 没有传说天赋时自动刷新
        maxBuffRefreshTimes: 3,      // 最大天赋刷新次数

        // 停止条件
        stopOnRecord: false,         // 达到新纪录时停止
        stopOnFloor: 0,              // 达到指定层数时停止 (0为不启用)
        stopWhenNoFreeReset: false,  // 没有免费重置时停止
        stopOnError: true,           // 出错时停止
        maxConsecutiveErrors: 3,     // 最大连续错误次数

        // 高级设置
        useAdPoints: false,          // 使用仙缘代替灵石
        saveCombatLogs: true,        // 保存战斗日志
        autoClosePanel: false,       // 运行结束后自动关闭面板
        showFightDetails: true,      // 显示战斗详情

        // 藏宝图交易设置
        autoSellMaps: false,         // 灵石不足时自动出售藏宝图
        minMapPrice: 2000,           // 最低出售价格
        sellMapWhenStoneBelow: 5000, // 灵石低于此值时出售
        maxMapsToSell: 0,            // 最大出售数量 (0=全部)
        sellMapStrategy: 'highest'   // 出售策略: highest(最高价优先)/all(全部)
    };

    // 状态管理
    const STATE = {
        running: false,
        panelOpen: false,
        panelMinimized: false,
        consecutiveErrors: 0,
        buffRefreshCount: 0,

        stats: {
            totalRuns: 0,              // 总刷取次数
            totalFloors: 0,            // 总通关层数
            totalMaps: 0,              // 总获得藏宝图
            totalStoneSpent: 0,        // 总花费灵石
            totalAdPointsSpent: 0,     // 总花费仙缘
            bestFloor: 0,              // 最高纪录
            currentRunFloors: 0,       // 当前轮次通关层数
            startTime: null,           // 开始时间
            totalFightTime: 0          // 总战斗时间
        },

        currentTrial: {
            hasActiveTrial: false,
            currentFloor: 0,
            freeResetAvailable: false
        },

        logs: [],
        lastResetTime: 0
    };

    // API管理
    const API = {
        get() {
            if (_win.api) return _win.api;
            if (window.api) return window.api;
            if (typeof api !== 'undefined') return api;
            return null;
        },

        async request(method, endpoint, data = null, timeout = 30000) {
            const api = this.get();
            if (!api) throw new Error('API不可用');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const res = method === 'GET'
                    ? await api.get(endpoint)
                    : await api.post(endpoint, data);

                clearTimeout(timeoutId);

                if (!res) throw new Error('Empty response');
                if (res.code === 401) throw new Error('登录已过期');
                if (res.code === 429) throw new Error('请求过于频繁');
                if (res.code !== 200) throw new Error(res.message || `请求失败: ${endpoint}`);

                STATE.consecutiveErrors = 0;
                return res;
            } catch (e) {
                clearTimeout(timeoutId);
                if (e.name === 'AbortError') {
                    throw new Error('请求超时');
                }
                STATE.consecutiveErrors++;
                Logger.error(`API ${method} ${endpoint}: ${e.message}`);
                throw e;
            }
        },

        // 获取试炼信息
        async getTrialInfo() {
            return this.request('GET', '/api/trial-tower/info');
        },

        // 开始/重置试炼
        async startTrial(useAdPoints = false) {
            return this.request('POST', '/api/trial-tower/start', { useAdPoints });
        },

        // 挑战当前层
        async fight() {
            return this.request('POST', '/api/trial-tower/fight', null, CONFIG.maxFightTime);
        },

        // 选择天赋
        async chooseBuff(buffId) {
            return this.request('POST', '/api/trial-tower/choose-buff', { buffId });
        },

        // 放弃试炼
        async giveUp() {
            return this.request('POST', '/api/trial-tower/give-up');
        },

        // 刷新天赋选项
        async refreshBuff(useAdPoints = false) {
            return this.request('POST', '/api/trial-tower/refresh-buff', { useAdPoints });
        },

        // 获取背包物品
        async getInventory() {
            return this.request('GET', '/api/game/inventory');
        },

        // 获取玩家信息
        async getPlayerInfo() {
            return this.request('GET', '/api/player/info');
        },

        // 获取求购列表
        async getBuyRequests() {
            return this.request('GET', '/api/game/market/buy-requests?sort=price_desc');
        },

        // 应求出售
        async sellToRequest(requestId, quantity) {
            return this.request('POST', '/api/game/market/sell-to-request', { requestId, quantity });
        }
    };

    // 日志系统
    const Logger = {
        log(msg, type = 'info') {
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            const colors = {
                info: '#60a0e0',
                success: '#3dab97',
                warn: '#e0a030',
                error: '#e06060',
                gold: '#c9993a'
            };

            console.log(`%c[试炼助手 ${time}] %c${msg}`, 'color:#888', `color:${colors[type] || colors.info}`);

            STATE.logs.push({ time, msg, type });
            if (STATE.logs.length > 200) STATE.logs.shift();

            UI.updateLogPanel();
        },

        info(msg) { this.log(msg, 'info'); },
        success(msg) { this.log(msg, 'success'); },
        warn(msg) { this.log(msg, 'warn'); },
        error(msg) { this.log(msg, 'error'); },
        gold(msg) { this.log(msg, 'gold'); }
    };

    // 天赋选择策略
    const BuffStrategy = {
        // 攻击优先
        attack(buffs) {
            const priority = ['斩杀', '暴击', '连击', '攻击', '吸血', '灵根共鸣'];
            return this.selectByPriority(buffs, priority);
        },

        // 防御优先
        defense(buffs) {
            const priority = ['不死', '反伤', '防御', '气血', '回血', '再生'];
            return this.selectByPriority(buffs, priority);
        },

        // 平衡策略
        balance(buffs) {
            // 优先传说品质，其次根据当前属性选择
            const legendary = buffs.find(b => b.rarity === '传说');
            if (legendary) return legendary;
            const rare = buffs.find(b => b.rarity === '稀有');
            if (rare) return rare;
            return buffs[0];
        },

        // 随机选择
        random(buffs) {
            return buffs[Math.floor(Math.random() * buffs.length)];
        },

        // 根据优先级选择
        selectByPriority(buffs, priority) {
            // 先按品质筛选
            const filtered = buffs.filter(b => {
                if (CONFIG.minBuffRarity === 3) return b.rarity === '传说';
                if (CONFIG.minBuffRarity === 2) return b.rarity === '传说' || b.rarity === '稀有';
                return true;
            });

            if (filtered.length === 0) return buffs[0];

            // 按优先级排序
            for (const key of priority) {
                const match = filtered.find(b => b.name.includes(key) || b.desc.includes(key));
                if (match) return match;
            }

            return filtered[0];
        }
    };

    // 试炼管理器
    const TrialManager = {
        async start() {
            if (STATE.running) {
                Logger.warn('试炼助手已在运行中');
                return;
            }

            // 检查连续错误次数
            if (STATE.consecutiveErrors >= CONFIG.maxConsecutiveErrors) {
                Logger.error(`连续错误${STATE.consecutiveErrors}次，请检查网络或刷新页面`);
                return;
            }

            STATE.running = true;
            STATE.stats.startTime = Date.now();
            STATE.buffRefreshCount = 0;
            UI.updateStatus('运行中');
            UI.updateButtonStates();
            Logger.success('试炼助手已启动');

            try {
                await this.runLoop();
            } catch (e) {
                Logger.error(`运行异常: ${e.message}`);
                if (CONFIG.stopOnError) {
                    this.stop();
                }
            }
        },

        stop() {
            if (!STATE.running) return;

            STATE.running = false;
            UI.updateStatus('已停止');
            UI.updateButtonStates();

            // 计算运行时间
            if (STATE.stats.startTime) {
                const runTime = Math.floor((Date.now() - STATE.stats.startTime) / 1000);
                const mins = Math.floor(runTime / 60);
                const secs = runTime % 60;
                Logger.info(`运行结束，耗时 ${mins}分${secs}秒`);
            }

            Logger.warn('试炼助手已停止');

            if (CONFIG.autoClosePanel) {
                setTimeout(() => UI.closePanel(), 2000);
            }
        },

        async runLoop() {
            while (STATE.running) {
                // 检查停止条件
                if (await this.checkStopConditions()) {
                    this.stop();
                    return;
                }

                try {
                    await this.runOnce();
                } catch (e) {
                    Logger.error(`本轮运行失败: ${e.message}`);

                    if (CONFIG.stopOnError && STATE.consecutiveErrors >= CONFIG.maxConsecutiveErrors) {
                        Logger.error(`连续错误${STATE.consecutiveErrors}次，停止运行`);
                        this.stop();
                        return;
                    }

                    await wait(3000);
                }

                await wait(CONFIG.delayAfterReset);
            }
        },

        async checkStopConditions() {
            // 检查最大次数
            if (CONFIG.maxRuns > 0 && STATE.stats.totalRuns >= CONFIG.maxRuns) {
                Logger.info(`已达到最大刷取次数 ${CONFIG.maxRuns}`);
                return true;
            }

            // 检查灵石花费限制
            if (STATE.stats.totalStoneSpent >= CONFIG.maxStoneCost) {
                Logger.info(`已达到灵石花费限制 ${CONFIG.maxStoneCost}`);
                return true;
            }

            // 检查目标藏宝图
            if (CONFIG.targetMaps > 0 && STATE.stats.totalMaps >= CONFIG.targetMaps) {
                Logger.info(`已达到目标藏宝图数量 ${CONFIG.targetMaps}`);
                return true;
            }

            // 检查免费重置
            if (CONFIG.stopWhenNoFreeReset && !STATE.currentTrial.freeResetAvailable) {
                Logger.info('本周免费重置次数已用完');
                return true;
            }

            return false;
        },

        async runOnce() {
            Logger.info(`开始第 ${STATE.stats.totalRuns + 1} 轮试炼`);

            // 获取试炼信息
            const infoRes = await API.getTrialInfo();
            const info = infoRes.data;

            STATE.currentTrial = {
                hasActiveTrial: info.hasActiveTrial,
                currentFloor: info.activeFloor || 0,
                freeResetAvailable: info.freeResetAvailable
            };

            // 如果有进行中的试炼，先放弃
            if (info.hasActiveTrial) {
                Logger.info('发现有进行中的试炼，正在放弃...');
                await API.giveUp();
                await wait(1000);
            }

            // 检查免费重置
            if (!info.freeResetAvailable && CONFIG.stopWhenNoFreeReset) {
                Logger.info('本周免费重置次数已用完，停止运行');
                this.stop();
                return;
            }

            // 如果不是免费重置，检查灵石是否足够，不足则尝试出售藏宝图
            const isFree = info.freeResetAvailable;
            const useAd = CONFIG.useAdPoints;

            if (!isFree && !useAd) {
                // 获取当前灵石
                const playerRes = await API.getPlayerInfo();
                const playerData = playerRes.data || {};
                const currentStone = playerData.lowerStone || playerData.spiritStones || 0;

                // 如果灵石不足1000，尝试出售藏宝图
                if (currentStone < 1000) {
                    Logger.warn(`灵石不足 (${currentStone} < 1000)，尝试出售藏宝图...`);
                    const soldMaps = await MapTrader.checkAndSellMaps();
                    if (soldMaps) {
                        await wait(1000);
                        // 重新获取灵石数量确认是否足够
                        const newPlayerRes = await API.getPlayerInfo();
                        const newPlayerData = newPlayerRes.data || {};
                        const newStone = newPlayerRes.data.lowerStone || newPlayerData.spiritStones || 0;
                        if (newStone < 1000) {
                            Logger.error(`出售藏宝图后灵石仍不足 (${newStone} < 1000)，停止运行`);
                            this.stop();
                            return;
                        }
                    } else {
                        Logger.error('无法出售藏宝图，灵石不足，停止运行');
                        this.stop();
                        return;
                    }
                }
            }

            // 开始新的试炼
            if (!isFree) {
                if (useAd) {
                    STATE.stats.totalAdPointsSpent += 1;
                    Logger.info('消耗 1 仙缘重置试炼');
                } else {
                    STATE.stats.totalStoneSpent += 1000;
                    Logger.info('消耗 1000 灵石重置试炼');
                }
            } else {
                Logger.info('本周免费重置试炼');
            }

            await API.startTrial(useAd);
            STATE.stats.totalRuns++;
            STATE.stats.currentRunFloors = 0;
            STATE.buffRefreshCount = 0;
            Logger.success('试炼已开始');

            await wait(CONFIG.delayAfterReset);

            // 自动挑战循环
            while (STATE.running) {
                // 检查层数停止条件
                if (CONFIG.stopOnFloor > 0 && STATE.stats.currentRunFloors >= CONFIG.stopOnFloor) {
                    Logger.info(`已达到目标层数 ${CONFIG.stopOnFloor}，放弃当前试炼`);
                    await API.giveUp();
                    break;
                }

                const result = await this.fightOnce();
                if (!result.victory) {
                    Logger.info(`本轮结束，通关 ${STATE.stats.currentRunFloors} 层`);
                    break;
                }
                await wait(CONFIG.delayBetweenFights);
            }
        },

        async fightOnce() {
            const fightStartTime = Date.now();
            Logger.info(`挑战第 ${STATE.stats.currentRunFloors + 1} 层...`);

            const res = await API.fight();
            const data = res.data;

            const fightDuration = Date.now() - fightStartTime;
            STATE.stats.totalFightTime += fightDuration;

            if (data.victory) {
                STATE.stats.currentRunFloors++;
                STATE.stats.totalFloors++;

                if (CONFIG.showFightDetails) {
                    Logger.success(`通关第 ${data.floor} 层 (耗时${fightDuration}ms)`);
                }

                // 检查是否获得藏宝图
                if (data.rewardMaps > 0) {
                    STATE.stats.totalMaps += data.rewardMaps;
                    Logger.gold(`获得藏宝图 x${data.rewardMaps} (累计${STATE.stats.totalMaps})`);

                    // 获得藏宝图后检查是否需要出售
                    if (CONFIG.autoSellMaps) {
                        const soldMaps = await MapTrader.checkAndSellMaps();
                        if (soldMaps) {
                            await wait(1000);
                        }
                    }
                }

                // 选择天赋
                if (data.buffs && data.buffs.length > 0 && CONFIG.autoSelectBuff) {
                    await this.handleBuffSelection(data.buffs);
                }

                return { victory: true };
            } else {
                // 失败结算
                if (data.rewardMaps > 0) {
                    STATE.stats.totalMaps += data.rewardMaps;
                    Logger.gold(`获得藏宝图 x${data.rewardMaps} (累计${STATE.stats.totalMaps})`);
                }

                // 检查是否新纪录
                if (data.isNewRecord && data.floor > STATE.stats.bestFloor) {
                    STATE.stats.bestFloor = data.floor;
                    Logger.success(`新纪录！最高 ${data.floor} 层`);

                    if (CONFIG.stopOnRecord) {
                        Logger.info('达到新纪录，停止运行');
                        this.stop();
                    }
                }

                return { victory: false };
            }
        },

        async handleBuffSelection(buffs) {
            // 检查是否需要刷新天赋
            const hasLegendary = buffs.some(b => b.rarity === '传说');
            const hasRare = buffs.some(b => b.rarity === '稀有');

            if (CONFIG.refreshBuffOnNoLegendary && !hasLegendary && STATE.buffRefreshCount < CONFIG.maxBuffRefreshTimes) {
                Logger.info('没有传说天赋，尝试刷新...');
                try {
                    await API.refreshBuff(CONFIG.useAdPoints);
                    STATE.buffRefreshCount++;
                    Logger.success(`天赋已刷新 (${STATE.buffRefreshCount}/${CONFIG.maxBuffRefreshTimes})`);
                    // 刷新后需要重新获取试炼信息来选择天赋
                    await wait(CONFIG.delayAfterBuff);
                    return;
                } catch (e) {
                    Logger.warn(`刷新天赋失败: ${e.message}`);
                }
            }

            // 选择天赋
            const strategy = BuffStrategy[CONFIG.buffStrategy] || BuffStrategy.attack;
            const selected = strategy(buffs);

            if (selected) {
                Logger.info(`选择天赋: [${selected.rarity}] ${selected.name}`);
                await API.chooseBuff(selected.id);
                await wait(CONFIG.delayAfterBuff);
            }
        }
    };

    // 藏宝图交易管理器
    const MapTrader = {
        // 检查是否需要出售藏宝图
        async checkAndSellMaps() {
            if (!CONFIG.autoSellMaps) return false;

            try {
                // 获取玩家信息
                const playerRes = await API.getPlayerInfo();
                const playerData = playerRes.data || {};
                const currentStone = playerData.lowerStone || playerData.spiritStones || 0;

                // 检查灵石是否低于阈值
                if (currentStone >= CONFIG.sellMapWhenStoneBelow) {
                    return false;
                }

                Logger.warn(`灵石不足 (${currentStone} < ${CONFIG.sellMapWhenStoneBelow})，尝试出售藏宝图...`);

                // 获取背包中的藏宝图
                const invRes = await API.getInventory();
                const inventory = invRes.data || [];

                // 查找藏宝图
                const mapItems = inventory.filter(item =>
                    item.name && item.name.includes('藏宝图') &&
                    !item.isEquipped && !item.isLocked &&
                    !(item.tradeCooldown && item.tradeCooldown > Date.now())
                );

                Logger.info(`背包中藏宝图: ${mapItems.length} 种`);
                mapItems.forEach((item, idx) => {
                    Logger.info(`藏宝图${idx+1}: ${item.name}, 数量${item.quantity || 1}, templateId=${item.templateId}`);
                });

                if (mapItems.length === 0) {
                    Logger.warn('背包中没有可出售的藏宝图');
                    return false;
                }

                // 计算可出售的藏宝图总数
                let totalMaps = mapItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
                if (CONFIG.maxMapsToSell > 0) {
                    totalMaps = Math.min(totalMaps, CONFIG.maxMapsToSell);
                }

                Logger.info(`找到 ${totalMaps} 个可出售的藏宝图`);

                // 获取求购列表
                const buyReqRes = await API.getBuyRequests();
                const allRequests = buyReqRes.data || [];
                Logger.info(`获取到 ${allRequests.length} 个求购单`);

                const buyRequests = allRequests.filter(req =>
                    req.name && req.name.includes('藏宝图') &&
                    req.unitPrice >= CONFIG.minMapPrice &&
                    !req.isMine
                );

                Logger.info(`符合条件的藏宝图求购单: ${buyRequests.length} 个 (价格≥${CONFIG.minMapPrice})`);

                if (buyRequests.length === 0) {
                    Logger.warn(`未找到价格 ≥ ${CONFIG.minMapPrice} 的藏宝图求购单`);
                    return false;
                }

                // 打印求购单详情
                buyRequests.forEach((req, idx) => {
                    Logger.info(`求购单${idx+1}: ${req.name} @ ${req.unitPrice}灵石, 剩余${req.remainingQty}个`);
                });

                // 按价格排序（从高到低）
                buyRequests.sort((a, b) => b.unitPrice - a.unitPrice);

                let soldCount = 0;
                let earnedStone = 0;

                // 出售藏宝图
                for (const mapItem of mapItems) {
                    if (soldCount >= totalMaps) break;

                    const itemQty = mapItem.quantity || 1;
                    let remainingQty = itemQty;
                    Logger.info(`尝试出售: ${mapItem.name} (templateId=${mapItem.templateId}), 数量${itemQty}`);

                    for (const request of buyRequests) {
                        if (remainingQty <= 0 || soldCount >= totalMaps) break;
                        if (request.remainingQty <= 0) continue;

                        // 检查是否是同一种藏宝图
                        if (request.templateId !== mapItem.templateId) {
                            Logger.info(`  跳过求购单: templateId不匹配 (物品=${mapItem.templateId}, 求购=${request.templateId})`);
                            continue;
                        }

                        const sellQty = Math.min(remainingQty, request.remainingQty, totalMaps - soldCount);

                        try {
                            const sellRes = await API.sellToRequest(request.id, sellQty);
                            if (sellRes.code === 200) {
                                const earning = sellQty * request.unitPrice;
                                earnedStone += earning;
                                soldCount += sellQty;
                                remainingQty -= sellQty;
                                request.remainingQty -= sellQty;
                                Logger.success(`出售 ${sellQty} 个藏宝图 @ ${request.unitPrice}灵石，获得 ${earning} 灵石`);
                            }
                        } catch (e) {
                            Logger.error(`出售失败: ${e.message}`);
                        }

                        await wait(500);
                    }
                }

                if (soldCount > 0) {
                    Logger.gold(`藏宝图出售完成: 售出 ${soldCount} 个，共获得 ${earnedStone} 灵石`);
                    return true;
                } else {
                    Logger.warn('未能成功出售任何藏宝图');
                    return false;
                }

            } catch (e) {
                Logger.error(`出售藏宝图时出错: ${e.message}`);
                return false;
            }
        }
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
                }
            };
        }
    };

    // UI管理
    const UI = {
        createPanel() {
            if ($('#lv-trial-panel')) return;

            const v = Theme.getVars();
            const panel = document.createElement('div');
            panel.id = 'lv-trial-panel';
            panel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 95%;
                max-width: 520px;
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
                transition: background 0.3s, color 0.3s;
            `;

            panel.innerHTML = this.generatePanelHTML();
            document.body.appendChild(panel);

            this.bindEvents();
            this.loadConfig();
            this.makeDraggable();
            this.updateTheme();
        },

        updateTheme() {
            const panel = $('#lv-trial-panel');
            if (!panel) return;

            const v = Theme.getVars();

            panel.style.background = v.bgPanel;
            panel.style.borderColor = v.borderGold;
            panel.style.color = v.textPrimary;
            panel.style.boxShadow = v.shadowLg;

            const header = $('#lv-trial-header');
            if (header) {
                header.style.background = v.gradientGold;
            }

            const status = $('#lv-trial-status');
            if (status) {
                status.style.color = v.textPrimary;
                status.style.background = v.bgCard;
            }

            const content = $('#lv-trial-content');
            if (content) {
                content.style.color = v.textPrimary;
            }

            // 更新所有卡片背景
            $$('.lv-trial-card').forEach(card => {
                card.style.background = v.bgCard;
                card.style.borderColor = v.borderColor;
            });

            // 更新所有输入框
            $$('.lv-trial-input').forEach(input => {
                input.style.background = v.bgInput;
                input.style.borderColor = v.borderColor;
                input.style.color = v.textPrimary;
            });

            // 更新所有选择框
            $$('.lv-trial-select').forEach(select => {
                select.style.background = v.bgInput;
                select.style.borderColor = v.borderColor;
                select.style.color = v.textPrimary;
            });

            // 更新日志区域
            const logPanel = $('#lv-trial-logs');
            if (logPanel) {
                logPanel.style.background = v.bgCard;
                logPanel.style.borderColor = v.borderColor;
            }
        },

        generatePanelHTML() {
            const v = Theme.getVars();
            return `
                <div id="lv-trial-header" style="
                    background: ${v.gradientGold};
                    padding: 14px 18px;
                    border-bottom: 2px solid ${v.accentGold};
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    user-select: none;
                ">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">塔</span>
                        <span style="font-weight: bold; color: #fff; font-size: 16px;">试炼助手</span>
                        <span id="lv-trial-status" style="
                            margin-left: 8px;
                            font-size: 11px;
                            color: ${v.textPrimary};
                            background: ${v.bgCard};
                            padding: 3px 10px;
                            border-radius: 12px;
                            font-weight: bold;
                        ">未运行</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="lv-trial-minimize" style="
                            background: rgba(255,255,255,0.2);
                            border: 1px solid rgba(255,255,255,0.4);
                            color: #fff;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            cursor: pointer;
                            font-size: 16px;
                        ">−</button>
                        <button id="lv-trial-close" style="
                            background: rgba(255,255,255,0.2);
                            border: 1px solid rgba(255,255,255,0.4);
                            color: #fff;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            cursor: pointer;
                            font-size: 18px;
                        ">×</button>
                    </div>
                </div>

                <div id="lv-trial-content" style="padding: 16px; overflow-y: auto; flex: 1;">
                    <!-- 统计信息 -->
                    <div class="lv-trial-card" style="
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 10px;
                        padding: 12px;
                        margin-bottom: 16px;
                    ">
                        <div style="font-size: 12px; color: ${v.textGold}; margin-bottom: 10px; font-weight: bold;">运行统计</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-size: 11px;">
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">刷取次数</div>
                                <div id="lv-stat-runs" style="color: ${v.textJade}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">总层数</div>
                                <div id="lv-stat-floors" style="color: ${v.textJade}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">藏宝图</div>
                                <div id="lv-stat-maps" style="color: ${v.textGold}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">花费灵石</div>
                                <div id="lv-stat-stone" style="color: ${v.textRed}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">最高纪录</div>
                                <div id="lv-stat-best" style="color: ${v.textPurple}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">运行时间</div>
                                <div id="lv-stat-time" style="color: ${v.textBlue}; font-size: 14px; font-weight: bold;">0:00</div>
                            </div>
                        </div>
                    </div>

                    <!-- 基本设置 -->
                    <div class="lv-section" style="margin-bottom: 16px;">
                        <div class="lv-section-title" style="font-size: 12px; color: ${v.textGold}; margin-bottom: 10px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                            <span>▸</span> 基本设置
                        </div>
                        <div class="lv-section-content">
                            <div class="lv-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最大灵石花费</span>
                                    <input type="number" id="lv-max-stone" value="50000" step="1000" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                </div>
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最大刷取次数</span>
                                    <input type="number" id="lv-max-runs" value="0" min="0" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                    <span style="font-size: 10px; color: ${v.textMuted};">0 = 无限制</span>
                                </div>
                            </div>

                            <div class="lv-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">目标藏宝图数</span>
                                    <input type="number" id="lv-target-maps" value="0" min="0" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                    <span style="font-size: 10px; color: ${v.textMuted};">0 = 无限制</span>
                                </div>
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">目标层数(停止)</span>
                                    <input type="number" id="lv-stop-floor" value="0" min="0" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                    <span style="font-size: 10px; color: ${v.textMuted};">0 = 不启用</span>
                                </div>
                            </div>

                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-use-ad" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">使用仙缘代替灵石</span>
                            </label>

                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-stop-no-free" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">没有免费重置时停止</span>
                            </label>
                        </div>
                    </div>

                    <!-- 战斗设置 -->
                    <div class="lv-section" style="margin-bottom: 16px;">
                        <div class="lv-section-title" style="font-size: 12px; color: ${v.textGold}; margin-bottom: 10px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                            <span>▸</span> 战斗设置
                        </div>
                        <div class="lv-section-content">
                            <div class="lv-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">战斗间隔(ms)</span>
                                    <input type="number" id="lv-delay-fight" value="1000" min="500" step="100" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                </div>
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">重置等待(ms)</span>
                                    <input type="number" id="lv-delay-reset" value="2000" min="500" step="100" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                </div>
                            </div>

                            <div class="lv-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">天赋等待(ms)</span>
                                    <input type="number" id="lv-delay-buff" value="500" min="100" step="100" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                </div>
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">战斗超时(ms)</span>
                                    <input type="number" id="lv-fight-timeout" value="30000" min="5000" step="1000" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                </div>
                            </div>

                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-show-details" checked style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">显示战斗详情</span>
                            </label>
                        </div>
                    </div>

                    <!-- 天赋设置 -->
                    <div class="lv-section" style="margin-bottom: 16px;">
                        <div class="lv-section-title" style="font-size: 12px; color: ${v.textGold}; margin-bottom: 10px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                            <span>▸</span> 天赋设置
                        </div>
                        <div class="lv-section-content">
                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; cursor: pointer;">
                                <input type="checkbox" id="lv-auto-buff" checked style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">自动选择天赋</span>
                            </label>

                            <div style="margin-bottom: 10px;">
                                <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">选择策略:</span>
                                <select id="lv-buff-strategy" class="lv-trial-select" style="
                                    width: 100%;
                                    margin-top: 4px;
                                    background: ${v.bgInput};
                                    border: 1px solid ${v.borderColor};
                                    color: ${v.textPrimary};
                                    padding: 8px 10px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                ">
                                    <option value="attack">攻击优先 (斩杀/暴击/连击)</option>
                                    <option value="defense">防御优先 (不死/反伤/防御)</option>
                                    <option value="balance">平衡策略 (优先高品质)</option>
                                    <option value="random">随机选择</option>
                                </select>
                            </div>

                            <div style="margin-bottom: 10px;">
                                <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最小天赋品质:</span>
                                <select id="lv-min-rarity" class="lv-trial-select" style="
                                    width: 100%;
                                    margin-top: 4px;
                                    background: ${v.bgInput};
                                    border: 1px solid ${v.borderColor};
                                    color: ${v.textPrimary};
                                    padding: 8px 10px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                ">
                                    <option value="1">普通及以上</option>
                                    <option value="2">稀有及以上</option>
                                    <option value="3">仅传说</option>
                                </select>
                            </div>

                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-refresh-buff" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">无传说时自动刷新天赋</span>
                            </label>

                            <div style="display: flex; gap: 10px;">
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最大刷新次数</span>
                                    <input type="number" id="lv-max-refresh" value="3" min="1" max="10" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 藏宝图交易 -->
                    <div class="lv-section" style="margin-bottom: 16px;">
                        <div class="lv-section-title" style="font-size: 12px; color: ${v.textGold}; margin-bottom: 10px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                            <span>▸</span> 藏宝图交易
                        </div>
                        <div class="lv-section-content">
                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; cursor: pointer;">
                                <input type="checkbox" id="lv-auto-sell-maps" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">灵石不足时自动出售藏宝图</span>
                            </label>

                            <div class="lv-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最低出售价格</span>
                                    <input type="number" id="lv-min-map-price" value="2000" min="100" step="100" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                </div>
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">灵石低于时出售</span>
                                    <input type="number" id="lv-sell-stone-below" value="5000" min="1000" step="500" class="lv-trial-input" style="
                                        width: 100%;
                                        margin-top: 4px;
                                        background: ${v.bgInput};
                                        border: 1px solid ${v.borderColor};
                                        color: ${v.textPrimary};
                                        padding: 6px 10px;
                                        border-radius: 6px;
                                        font-size: 12px;
                                    ">
                                </div>
                            </div>

                            <div style="margin-bottom: 10px;">
                                <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最大出售数量</span>
                                <input type="number" id="lv-max-maps-sell" value="0" min="0" class="lv-trial-input" style="
                                    width: 100%;
                                    margin-top: 4px;
                                    background: ${v.bgInput};
                                    border: 1px solid ${v.borderColor};
                                    color: ${v.textPrimary};
                                    padding: 6px 10px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                ">
                                <span style="font-size: 10px; color: ${v.textMuted};">0 = 出售全部</span>
                            </div>
                        </div>
                    </div>

                    <!-- 停止条件 -->
                    <div class="lv-section" style="margin-bottom: 16px;">
                        <div class="lv-section-title" style="font-size: 12px; color: ${v.textGold}; margin-bottom: 10px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                            <span>▸</span> 停止条件
                        </div>
                        <div class="lv-section-content">
                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-stop-record" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">达到新纪录时停止</span>
                            </label>

                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-stop-error" checked style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">出错时停止</span>
                            </label>

                            <div style="margin-bottom: 10px;">
                                <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最大连续错误次数</span>
                                <input type="number" id="lv-max-errors" value="3" min="1" max="10" class="lv-trial-input" style="
                                    width: 100%;
                                    margin-top: 4px;
                                    background: ${v.bgInput};
                                    border: 1px solid ${v.borderColor};
                                    color: ${v.textPrimary};
                                    padding: 6px 10px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                ">
                            </div>

                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="lv-auto-close" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">结束后自动关闭面板</span>
                            </label>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                        <button id="lv-trial-start" style="
                            flex: 1;
                            background: ${v.gradientGold};
                            border: none;
                            color: #fff;
                            padding: 12px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                        ">开始刷取</button>
                        <button id="lv-trial-stop" style="
                            flex: 1;
                            background: ${v.bgCard};
                            border: 1px solid ${v.textRed}80;
                            color: ${v.textRed};
                            padding: 12px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: bold;
                            opacity: 0.5;
                        ">停止</button>
                    </div>

                    <!-- 日志面板 -->
                    <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 12px; color: ${v.textSecondary};">运行日志</span>
                        <button id="lv-clear-log" style="
                            font-size: 11px;
                            padding: 4px 10px;
                            background: ${v.bgCard};
                            border: 1px solid ${v.borderColor};
                            color: ${v.textMuted};
                            border-radius: 6px;
                            cursor: pointer;
                        ">清除</button>
                    </div>
                    <div id="lv-trial-logs" class="lv-trial-card" style="
                        max-height: 180px;
                        overflow-y: auto;
                        background: ${v.bgCard};
                        border: 1px solid ${v.borderColor};
                        border-radius: 10px;
                        padding: 12px;
                        font-size: 11px;
                        font-family: 'Consolas', 'Monaco', monospace;
                        line-height: 1.5;
                    "></div>
                </div>
            `;
        },

        bindEvents() {
            $('#lv-trial-close')?.addEventListener('click', () => this.closePanel());
            $('#lv-trial-minimize')?.addEventListener('click', () => this.toggleMinimize());

            $('#lv-trial-start')?.addEventListener('click', () => {
                this.saveConfig();
                TrialManager.start();
            });

            $('#lv-trial-stop')?.addEventListener('click', () => {
                TrialManager.stop();
            });

            $('#lv-clear-log')?.addEventListener('click', () => {
                STATE.logs = [];
                this.updateLogPanel();
            });

            // 点击面板外部关闭
            $('#lv-trial-panel')?.addEventListener('click', (e) => {
                if (e.target.id === 'lv-trial-panel') this.closePanel();
            });

            // ESC键关闭
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && STATE.panelOpen) {
                    this.closePanel();
                }
            });
        },

        makeDraggable() {
            const header = $('#lv-trial-header');
            const panel = $('#lv-trial-panel');
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

        toggleMinimize() {
            const content = $('#lv-trial-content');
            const btn = $('#lv-trial-minimize');
            if (!content || !btn) return;

            STATE.panelMinimized = !STATE.panelMinimized;
            content.style.display = STATE.panelMinimized ? 'none' : 'block';
            btn.textContent = STATE.panelMinimized ? '+' : '−';
        },

        saveConfig() {
            CONFIG.maxStoneCost = parseInt($('#lv-max-stone')?.value || '50000');
            CONFIG.maxRuns = parseInt($('#lv-max-runs')?.value || '0');
            CONFIG.targetMaps = parseInt($('#lv-target-maps')?.value || '0');
            CONFIG.stopOnFloor = parseInt($('#lv-stop-floor')?.value || '0');
            CONFIG.useAdPoints = $('#lv-use-ad')?.checked || false;
            CONFIG.stopWhenNoFreeReset = $('#lv-stop-no-free')?.checked || false;

            CONFIG.delayBetweenFights = parseInt($('#lv-delay-fight')?.value || '1000');
            CONFIG.delayAfterReset = parseInt($('#lv-delay-reset')?.value || '2000');
            CONFIG.delayAfterBuff = parseInt($('#lv-delay-buff')?.value || '500');
            CONFIG.maxFightTime = parseInt($('#lv-fight-timeout')?.value || '30000');
            CONFIG.showFightDetails = $('#lv-show-details')?.checked !== false;

            CONFIG.autoSelectBuff = $('#lv-auto-buff')?.checked !== false;
            CONFIG.buffStrategy = $('#lv-buff-strategy')?.value || 'attack';
            CONFIG.minBuffRarity = parseInt($('#lv-min-rarity')?.value || '1');
            CONFIG.refreshBuffOnNoLegendary = $('#lv-refresh-buff')?.checked || false;
            CONFIG.maxBuffRefreshTimes = parseInt($('#lv-max-refresh')?.value || '3');

            CONFIG.stopOnRecord = $('#lv-stop-record')?.checked || false;
            CONFIG.stopOnError = $('#lv-stop-error')?.checked !== false;
            CONFIG.maxConsecutiveErrors = parseInt($('#lv-max-errors')?.value || '3');
            CONFIG.autoClosePanel = $('#lv-auto-close')?.checked || false;

            // 藏宝图交易设置
            CONFIG.autoSellMaps = $('#lv-auto-sell-maps')?.checked || false;
            CONFIG.minMapPrice = parseInt($('#lv-min-map-price')?.value || '2000');
            CONFIG.sellMapWhenStoneBelow = parseInt($('#lv-sell-stone-below')?.value || '5000');
            CONFIG.maxMapsToSell = parseInt($('#lv-max-maps-sell')?.value || '0');

            localStorage.setItem('lv_trial_config_v2', JSON.stringify(CONFIG));
            Logger.info('配置已保存');
        },

        loadConfig() {
            const saved = localStorage.getItem('lv_trial_config_v2');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    Object.assign(CONFIG, data);
                } catch (e) {}
            }

            // 基本设置
            if ($('#lv-max-stone')) $('#lv-max-stone').value = CONFIG.maxStoneCost;
            if ($('#lv-max-runs')) $('#lv-max-runs').value = CONFIG.maxRuns;
            if ($('#lv-target-maps')) $('#lv-target-maps').value = CONFIG.targetMaps;
            if ($('#lv-stop-floor')) $('#lv-stop-floor').value = CONFIG.stopOnFloor;
            if ($('#lv-use-ad')) $('#lv-use-ad').checked = CONFIG.useAdPoints;
            if ($('#lv-stop-no-free')) $('#lv-stop-no-free').checked = CONFIG.stopWhenNoFreeReset;

            // 战斗设置
            if ($('#lv-delay-fight')) $('#lv-delay-fight').value = CONFIG.delayBetweenFights;
            if ($('#lv-delay-reset')) $('#lv-delay-reset').value = CONFIG.delayAfterReset;
            if ($('#lv-delay-buff')) $('#lv-delay-buff').value = CONFIG.delayAfterBuff;
            if ($('#lv-fight-timeout')) $('#lv-fight-timeout').value = CONFIG.maxFightTime;
            if ($('#lv-show-details')) $('#lv-show-details').checked = CONFIG.showFightDetails;

            // 天赋设置
            if ($('#lv-auto-buff')) $('#lv-auto-buff').checked = CONFIG.autoSelectBuff;
            if ($('#lv-buff-strategy')) $('#lv-buff-strategy').value = CONFIG.buffStrategy;
            if ($('#lv-min-rarity')) $('#lv-min-rarity').value = CONFIG.minBuffRarity;
            if ($('#lv-refresh-buff')) $('#lv-refresh-buff').checked = CONFIG.refreshBuffOnNoLegendary;
            if ($('#lv-max-refresh')) $('#lv-max-refresh').value = CONFIG.maxBuffRefreshTimes;

            // 停止条件
            if ($('#lv-stop-record')) $('#lv-stop-record').checked = CONFIG.stopOnRecord;
            if ($('#lv-stop-error')) $('#lv-stop-error').checked = CONFIG.stopOnError;
            if ($('#lv-max-errors')) $('#lv-max-errors').value = CONFIG.maxConsecutiveErrors;
            if ($('#lv-auto-close')) $('#lv-auto-close').checked = CONFIG.autoClosePanel;

            // 藏宝图交易设置
            if ($('#lv-auto-sell-maps')) $('#lv-auto-sell-maps').checked = CONFIG.autoSellMaps;
            if ($('#lv-min-map-price')) $('#lv-min-map-price').value = CONFIG.minMapPrice;
            if ($('#lv-sell-stone-below')) $('#lv-sell-stone-below').value = CONFIG.sellMapWhenStoneBelow;
            if ($('#lv-max-maps-sell')) $('#lv-max-maps-sell').value = CONFIG.maxMapsToSell;
        },

        togglePanel() {
            const panel = $('#lv-trial-panel');
            if (!panel) {
                this.createPanel();
                setTimeout(() => this.togglePanel(), 100);
                return;
            }

            STATE.panelOpen = !STATE.panelOpen;
            panel.style.display = STATE.panelOpen ? 'flex' : 'none';

            if (STATE.panelOpen) {
                this.updateStats();
            }
        },

        closePanel() {
            STATE.panelOpen = false;
            const panel = $('#lv-trial-panel');
            if (panel) panel.style.display = 'none';
        },

        updateStatus(status) {
            const el = $('#lv-trial-status');
            if (el) {
                el.textContent = status;
                el.style.color = status === '运行中' ? '#3dab97' : '#e8e0d0';
            }
        },

        updateButtonStates() {
            const startBtn = $('#lv-trial-start');
            const stopBtn = $('#lv-trial-stop');

            if (startBtn) {
                startBtn.style.opacity = STATE.running ? '0.5' : '1';
                startBtn.style.pointerEvents = STATE.running ? 'none' : 'auto';
            }
            if (stopBtn) {
                stopBtn.style.opacity = STATE.running ? '1' : '0.5';
                stopBtn.style.pointerEvents = STATE.running ? 'auto' : 'none';
            }
        },

        updateStats() {
            const setText = (id, val) => {
                const el = $(id);
                if (el) el.textContent = val;
            };

            setText('#lv-stat-runs', STATE.stats.totalRuns);
            setText('#lv-stat-floors', STATE.stats.totalFloors);
            setText('#lv-stat-maps', STATE.stats.totalMaps);
            setText('#lv-stat-stone', STATE.stats.totalStoneSpent);
            setText('#lv-stat-best', STATE.stats.bestFloor);

            // 运行时间
            if (STATE.stats.startTime) {
                const runTime = Math.floor((Date.now() - STATE.stats.startTime) / 1000);
                const mins = Math.floor(runTime / 60);
                const secs = runTime % 60;
                setText('#lv-stat-time', `${mins}:${secs.toString().padStart(2, '0')}`);
            }
        },

        updateLogPanel() {
            const panel = $('#lv-trial-logs');
            if (!panel) return;

            const html = STATE.logs.map(log => {
                const colors = {
                    info: '#60a0e0',
                    success: '#3dab97',
                    warn: '#e0a030',
                    error: '#e06060',
                    gold: '#c9993a'
                };
                return `<div style="color: ${colors[log.type] || colors.info}; margin-bottom: 3px;">
                    <span style="color: #6a6560;">[${log.time}]</span> ${log.msg}
                </div>`;
            }).join('');

            panel.innerHTML = html || '<div style="color: #6a6560; text-align: center;">暂无日志</div>';
            panel.scrollTop = panel.scrollHeight;

            // 同时更新统计
            this.updateStats();
        },

        createSidebarButton() {
            if ($('#lv-trial-sidebar-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'lv-trial-sidebar-btn';
            btn.textContent = '试炼助手';
            btn.style.cssText = `
                width: 100%;
                padding: 10px 12px;
                background: rgba(201, 153, 58, 0.2);
                border: 1px solid rgba(201, 153, 58, 0.4);
                border-radius: 6px;
                color: #c9993a;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                margin-top: 8px;
                font-family: KaiTi, 楷体, STKaiti, "Noto Serif SC", serif;
                transition: all 0.2s;
            `;

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(201, 153, 58, 0.35)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(201, 153, 58, 0.2)';
            });

            btn.addEventListener('click', () => this.togglePanel());

            // 插入到炼造按钮后面
            const craftSection = $('#lv-craft-section');
            if (craftSection) {
                craftSection.appendChild(btn);
                return;
            }

            // 如果没有找到炼造按钮，插入到侧边栏第一个section后面
            const playerPanel = $('.player-panel') || $('#playerPanel');
            if (playerPanel) {
                const firstSection = playerPanel.querySelector('.panel-section');
                if (firstSection) {
                    firstSection.insertAdjacentElement('afterend', btn);
                    return;
                }
                // 兜底：直接append到侧边栏
                playerPanel.appendChild(btn);
            }
        }
    };

    // 初始化
    function init() {
        if (!location.href.includes('ling.muge.info')) return;

        Logger.info('天道试炼助手 v1.1.0 已加载');

        // 添加全局样式移除按钮焦点轮廓
        const style = document.createElement('style');
        style.textContent = `
            #lv-trial-panel button,
            #lv-trial-panel input,
            #lv-trial-panel select,
            #lv-trial-sidebar-btn {
                outline: none !important;
                -webkit-tap-highlight-color: transparent !important;
            }
            #lv-trial-panel button:focus,
            #lv-trial-panel input:focus,
            #lv-trial-panel select:focus,
            #lv-trial-sidebar-btn:focus {
                outline: none !important;
                box-shadow: none !important;
            }
            #lv-trial-panel button:active,
            #lv-trial-sidebar-btn:active {
                outline: none !important;
            }
        `;
        document.head.appendChild(style);

        // 初始化主题观察者
        Theme.initObserver();

        // 等待侧边栏加载
        const checkSidebar = setInterval(() => {
            const sidebar = $('.player-panel') || $('#playerPanel');
            if (sidebar) {
                clearInterval(checkSidebar);
                UI.createSidebarButton();
                Logger.info('点击侧边栏「试炼助手」按钮打开面板');
            }
        }, 1000);

        // 5秒后停止检查
        setTimeout(() => clearInterval(checkSidebar), 10000);
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

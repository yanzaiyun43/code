// ==UserScript==
// @name         灵界 LingVerse 天道试炼刷取助手
// @namespace    lingverse-trial-bot
// @version      2.1.18
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
    const bot_CONFIG = {
        // 基本设置
        bot_enabled: false,
        bot_maxStoneCost: 50000,         // 最大灵石花费限制
        bot_maxRuns: 0,                  // 最大刷取次数 (0为无限制)
        bot_targetMaps: 0,               // 目标藏宝图数量 (0为无限制)

        // 战斗设置
        bot_delayBetweenFights: 1000,    // 战斗间隔(毫秒)
        bot_delayAfterReset: 2000,       // 重置后等待时间(毫秒)
        bot_delayAfterBuff: 500,         // 选择天赋后等待时间(毫秒)
        bot_maxFightTime: 30000,         // 单次战斗最大等待时间(毫秒)

        // 天赋设置
        bot_autoSelectBuff: true,        // 自动选择天赋
        bot_buffStrategy: 'attack',      // 天赋选择策略: attack/defense/balance/random
        bot_minBuffRarity: 1,            // 最小天赋品质 (1普通,2稀有,3传说)
        bot_autoRefreshBuff: false,      // 是否自动刷新天赋选项
        bot_refreshBuffOnNoLegendary: false, // 没有传说天赋时自动刷新
        bot_maxBuffRefreshTimes: 3,      // 最大天赋刷新次数

        // 停止条件
        bot_stopOnRecord: false,         // 达到新纪录时停止
        bot_stopOnFloor: 0,              // 达到指定层数时停止 (0为不启用)
        bot_stopWhenNoFreeReset: false,  // 没有免费重置时停止
        bot_stopOnError: true,           // 出错时停止
        bot_maxConsecutiveErrors: 3,     // 最大连续错误次数
        bot_stopWhenNoBuyRequest: false, // 没有符合条件的求购单时停止

        // 高级设置
        bot_useAdPoints: false,          // 使用仙缘代替灵石
        bot_saveCombatLogs: true,        // 保存战斗日志
        bot_autoClosePanel: false,       // 运行结束后自动关闭面板
        bot_showFightDetails: true,      // 显示战斗详情

        // 藏宝图交易设置
        bot_autoSellMaps: false,         // 灵石不足时自动出售藏宝图
        bot_minMapPrice: 2000,           // 最低出售价格
        bot_sellMapWhenStoneBelow: 5000, // 灵石低于此值时出售
        bot_maxMapsToSell: 0,            // 最大出售数量 (0=全部)
        bot_sellMapStrategy: 'highest',  // 出售策略: highest(最高价优先)/all(全部)
        bot_sellMapWhenCountAbove: 0,    // 藏宝图数量超过此值时出售 (0=不启用)

        // 自动放弃设置
        bot_autoGiveUp: false,           // 是否启用达到指定层数后自动放弃
        bot_giveUpAtFloor: 0             // 达到此层数后自动放弃 (0=不启用, 5/10/15...)
    };

    // 状态管理
    const bot_STATE = {
        bot_running: false,
        bot_panelOpen: false,
        bot_panelMinimized: false,
        bot_consecutiveErrors: 0,
        bot_buffRefreshCount: 0,

        stats: {
            bot_totalRuns: 0,              // 总刷取次数
            bot_totalFloors: 0,            // 总通关层数
            bot_totalMaps: 0,              // 总获得藏宝图
            bot_totalStoneSpent: 0,        // 总花费灵石
            bot_totalAdPointsSpent: 0,     // 总花费仙缘
            bot_bestFloor: 0,              // 最高纪录
            bot_currentRunFloors: 0,       // 当前轮次通关层数
            bot_startTime: null,           // 开始时间
            bot_totalFightTime: 0          // 总战斗时间
        },

        bot_currentTrial: {
            hasActiveTrial: false,
            currentFloor: 0,
            freeResetAvailable: false
        },

        logs: [],
        bot_lastResetTime: 0
    };

    // API管理
    const bot_API = {
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

                bot_STATE.bot_consecutiveErrors = 0;
                return res;
            } catch (e) {
                clearTimeout(timeoutId);
                if (e.name === 'AbortError') {
                    throw new Error('请求超时');
                }
                bot_STATE.bot_consecutiveErrors++;
                bot_Logger.error(`bot_API ${method} ${endpoint}: ${e.message}`);
                throw e;
            }
        },

        // 获取试炼信息
        async getTrialInfo() {
            return this.request('GET', '/api/trial-tower/info');
        },

        // 开始/重置试炼
        async startTrial(bot_useAdPoints = false) {
            return this.request('POST', '/api/trial-tower/start', { bot_useAdPoints });
        },

        // 挑战当前层
        async fight() {
            return this.request('POST', '/api/trial-tower/fight', null, bot_CONFIG.bot_maxFightTime);
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
        async refreshBuff(bot_useAdPoints = false) {
            return this.request('POST', '/api/trial-tower/refresh-buff', { bot_useAdPoints });
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

    // 工具函数
    const bot_Utils = {
        // 计算坊市交易手续费（与游戏保持一致）
        calcTradeFee(unitPrice, quantity) {
            const p = Number(unitPrice) || 0;
            const q = Number(quantity) || 0;
            if (p <= 0 || q <= 0) return 0;
            let rate = 0.05;
            if (p >= 10000000) rate = 0.15;
            else if (p >= 1000000) rate = 0.12;
            else if (p >= 100000) rate = 0.08;
            return Math.max(1, Math.floor(p * q * rate));
        }
    };

    // 日志系统
    const bot_Logger = {
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

            bot_STATE.logs.push({ time, msg, type });
            if (bot_STATE.logs.length > 200) bot_STATE.logs.shift();

            bot_UI.updateLogPanel();
        },

        info(msg) { this.log(msg, 'info'); },
        success(msg) { this.log(msg, 'success'); },
        warn(msg) { this.log(msg, 'warn'); },
        error(msg) { this.log(msg, 'error'); },
        gold(msg) { this.log(msg, 'gold'); }
    };

    // 天赋选择策略
    const bot_BuffStrategy = {
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
                if (bot_CONFIG.bot_minBuffRarity === 3) return b.rarity === '传说';
                if (bot_CONFIG.bot_minBuffRarity === 2) return b.rarity === '传说' || b.rarity === '稀有';
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
    const bot_TrialManager = {
        async start() {
            if (bot_STATE.bot_running) {
                bot_Logger.warn('试炼助手已在运行中');
                return;
            }

            // 检查连续错误次数
            if (bot_STATE.bot_consecutiveErrors >= bot_CONFIG.bot_maxConsecutiveErrors) {
                bot_Logger.error(`连续错误${bot_STATE.bot_consecutiveErrors}次，请检查网络或刷新页面`);
                return;
            }

            bot_STATE.bot_running = true;

            // 重置本次运行统计
            bot_STATE.stats = {
                bot_totalRuns: 0,
                bot_totalFloors: 0,
                bot_totalMaps: 0,
                bot_totalStoneSpent: 0,
                bot_totalAdPointsSpent: 0,
                bot_bestFloor: 0,
                bot_currentRunFloors: 0,
                bot_startTime: Date.now(),
                bot_totalFightTime: 0
            };

            bot_STATE.bot_buffRefreshCount = 0;
            bot_UI.updateStatus('运行中');
            bot_UI.updateButtonStates();
            bot_UI.updateStats();
            bot_Logger.success('试炼助手已启动');

            try {
                await this.runLoop();
            } catch (e) {
                bot_Logger.error(`运行异常: ${e.message}`);
                if (bot_CONFIG.bot_stopOnError) {
                    this.stop();
                }
            }
        },

        stop() {
            if (!bot_STATE.bot_running) return;

            bot_STATE.bot_running = false;
            bot_UI.updateStatus('已停止');
            bot_UI.updateButtonStates();

            // 计算运行时间
            if (bot_STATE.stats.bot_startTime) {
                const runTime = Math.floor((Date.now() - bot_STATE.stats.bot_startTime) / 1000);
                const mins = Math.floor(runTime / 60);
                const secs = runTime % 60;
                bot_Logger.info(`运行结束，耗时 ${mins}分${secs}秒`);
            }

            // 显示本次运行统计
            const stats = bot_STATE.stats;
            if (stats.bot_totalRuns > 0) {
                bot_Logger.info(`本次运行统计: 刷取${stats.bot_totalRuns}次, 通关${stats.bot_totalFloors}层`);
                // 使用金色高亮显示藏宝图数量
                bot_Logger.gold(`藏宝图获取: ${stats.bot_totalMaps}张`);
                bot_Logger.info(`灵石花费: ${stats.bot_totalStoneSpent.toLocaleString()}`);
                if (stats.bot_bestFloor > 0) {
                    bot_Logger.success(`🏆 最高纪录: 第${stats.bot_bestFloor}层`);
                }
            }

            bot_Logger.warn('试炼助手已停止');

            if (bot_CONFIG.bot_autoClosePanel) {
                setTimeout(() => bot_UI.closePanel(), 2000);
            }
        },

        async runLoop() {
            while (bot_STATE.bot_running) {
                // 检查停止条件
                if (await this.checkStopConditions()) {
                    this.stop();
                    return;
                }

                try {
                    await this.runOnce();
                } catch (e) {
                    bot_Logger.error(`本轮运行失败: ${e.message}`);

                    if (bot_CONFIG.bot_stopOnError && bot_STATE.bot_consecutiveErrors >= bot_CONFIG.bot_maxConsecutiveErrors) {
                        bot_Logger.error(`连续错误${bot_STATE.bot_consecutiveErrors}次，停止运行`);
                        this.stop();
                        return;
                    }

                    await wait(3000);
                }

                await wait(bot_CONFIG.bot_delayAfterReset);
            }
        },

        async checkStopConditions() {
            // 检查最大次数
            if (bot_CONFIG.bot_maxRuns > 0 && bot_STATE.stats.bot_totalRuns >= bot_CONFIG.bot_maxRuns) {
                bot_Logger.info(`已达到最大刷取次数 ${bot_CONFIG.bot_maxRuns}`);
                return true;
            }

            // 检查灵石花费限制
            if (bot_STATE.stats.bot_totalStoneSpent >= bot_CONFIG.bot_maxStoneCost) {
                bot_Logger.info(`已达到灵石花费限制 ${bot_CONFIG.bot_maxStoneCost}`);
                return true;
            }

            // 检查目标藏宝图
            if (bot_CONFIG.bot_targetMaps > 0 && bot_STATE.stats.bot_totalMaps >= bot_CONFIG.bot_targetMaps) {
                bot_Logger.info(`已达到目标藏宝图数量 ${bot_CONFIG.bot_targetMaps}`);
                return true;
            }

            // 检查免费重置
            if (bot_CONFIG.bot_stopWhenNoFreeReset && !bot_STATE.bot_currentTrial.freeResetAvailable) {
                bot_Logger.info('本周免费重置次数已用完');
                return true;
            }

            return false;
        },

        async runOnce() {
            bot_Logger.info(`开始第 ${bot_STATE.stats.bot_totalRuns + 1} 轮试炼`);

            // 获取试炼信息
            const infoRes = await bot_API.getTrialInfo();
            const info = infoRes.data;

            bot_STATE.bot_currentTrial = {
                hasActiveTrial: info.hasActiveTrial,
                currentFloor: info.activeFloor || 0,
                freeResetAvailable: info.freeResetAvailable
            };

            // 如果有进行中的试炼，先放弃
            if (info.hasActiveTrial) {
                bot_Logger.info('发现有进行中的试炼，正在放弃...');
                await bot_API.giveUp();
                await wait(1000);
            }

            // 检查免费重置
            if (!info.freeResetAvailable && bot_CONFIG.bot_stopWhenNoFreeReset) {
                bot_Logger.info('本周免费重置次数已用完，停止运行');
                this.stop();
                return;
            }

            // 如果不是免费重置，检查灵石是否足够，不足则尝试出售藏宝图
            const isFree = info.freeResetAvailable;
            const useAd = bot_CONFIG.bot_useAdPoints;

            if (!isFree && !useAd) {
                // 获取当前灵石
                const playerRes = await bot_API.getPlayerInfo();
                const playerData = playerRes.data || {};
                const currentStone = playerData.lowerStone || playerData.spiritStones || 0;

                // 如果灵石不足1000，尝试出售藏宝图（强制出售，不受autoSellMaps配置限制）
                if (currentStone < 1000) {
                    bot_Logger.warn(`灵石不足 (${currentStone} < 1000)，尝试出售藏宝图...`);
                    const soldMaps = await bot_MapTrader.forceSellMaps();
                    if (soldMaps) {
                        await wait(1000);
                        // 重新获取灵石数量确认是否足够
                        const newPlayerRes = await bot_API.getPlayerInfo();
                        const newPlayerData = newPlayerRes.data || {};
                        const newStone = newPlayerRes.data.lowerStone || newPlayerData.spiritStones || 0;
                        if (newStone < 1000) {
                            bot_Logger.error(`出售藏宝图后灵石仍不足 (${newStone} < 1000)，停止运行`);
                            this.stop();
                            return;
                        }
                    } else {
                        bot_Logger.error('无法出售藏宝图，灵石不足，停止运行');
                        this.stop();
                        return;
                    }
                }
            }

            // 检查背包藏宝图数量是否超过阈值（每次开始试炼前都检查）
            if (bot_CONFIG.bot_sellMapWhenCountAbove > 0) {
                const soldMaps = await bot_MapTrader.checkAndSellMaps();
                if (soldMaps) {
                    await wait(1000);
                }
            }

            // 开始新的试炼
            if (!isFree) {
                if (useAd) {
                    bot_STATE.stats.bot_totalAdPointsSpent += 1;
                    bot_Logger.info('消耗 1 仙缘重置试炼');
                } else {
                    bot_STATE.stats.bot_totalStoneSpent += 1000;
                    bot_Logger.info('消耗 1000 灵石重置试炼');
                }
            } else {
                bot_Logger.info('本周免费重置试炼');
            }

            await bot_API.startTrial(useAd);
            bot_STATE.stats.bot_totalRuns++;
            bot_STATE.stats.bot_currentRunFloors = 0;
            bot_STATE.bot_buffRefreshCount = 0;
            bot_Logger.success('试炼已开始');

            await wait(bot_CONFIG.bot_delayAfterReset);

            // 自动挑战循环
            while (bot_STATE.bot_running) {
                // 检查层数停止条件
                if (bot_CONFIG.bot_stopOnFloor > 0 && bot_STATE.stats.bot_currentRunFloors >= bot_CONFIG.bot_stopOnFloor) {
                    bot_Logger.info(`已达到目标层数 ${bot_CONFIG.bot_stopOnFloor}，放弃当前试炼`);
                    await bot_API.giveUp();
                    break;
                }

                // 检查自动放弃条件（达到指定层数后主动放弃以获取藏宝图）
                if (bot_CONFIG.bot_autoGiveUp && bot_CONFIG.bot_giveUpAtFloor > 0 &&
                    bot_STATE.stats.bot_currentRunFloors >= bot_CONFIG.bot_giveUpAtFloor) {
                    const currentFloors = bot_STATE.stats.bot_currentRunFloors;
                    const mapsGot = Math.floor(currentFloors / 5);
                    bot_Logger.info(`[调试] 当前通关层数: ${currentFloors}, 计算藏宝图: ${mapsGot}`);
                    if (mapsGot > 0) {
                        bot_Logger.gold(`已达到设定层数 ${bot_CONFIG.bot_giveUpAtFloor}，主动放弃，可获取 ${mapsGot} 张藏宝图`);
                    } else {
                        bot_Logger.warn(`已达到设定层数 ${bot_CONFIG.bot_giveUpAtFloor}，但层数不足5层，无法获取藏宝图`);
                    }
                    await bot_API.giveUp();
                    break;
                }

                const result = await this.fightOnce();
                if (!result.victory) {
                    bot_Logger.info(`本轮结束，通关 ${bot_STATE.stats.bot_currentRunFloors} 层`);
                    break;
                }
                await wait(bot_CONFIG.bot_delayBetweenFights);
            }
        },

        async fightOnce() {
            const fightStartTime = Date.now();
            bot_Logger.info(`挑战第 ${bot_STATE.stats.bot_currentRunFloors + 1} 层...`);

            const res = await bot_API.fight();
            const data = res.data;

            const fightDuration = Date.now() - fightStartTime;
            bot_STATE.stats.bot_totalFightTime += fightDuration;

            if (data.victory) {
                bot_STATE.stats.bot_currentRunFloors++;
                bot_STATE.stats.bot_totalFloors++;

                if (bot_CONFIG.bot_showFightDetails) {
                    bot_Logger.success(`通关第 ${data.floor} 层 (耗时${fightDuration}ms)`);
                }

                // 调试：查看rewardMaps值
                bot_Logger.info(`[调试] 第${data.floor}层 rewardMaps=${data.rewardMaps}, 类型=${typeof data.rewardMaps}`);

                // 检查是否获得藏宝图
                if (data.rewardMaps > 0) {
                    bot_STATE.stats.bot_totalMaps += data.rewardMaps;
                    bot_Logger.gold(`获得藏宝图 x${data.rewardMaps} (累计${bot_STATE.stats.bot_totalMaps})`);

                    // 获得藏宝图后检查是否需要出售（数量阈值独立触发，不需要启用 autoSellMaps）
                    const shouldCheckSell = bot_CONFIG.bot_autoSellMaps || bot_CONFIG.bot_sellMapWhenCountAbove > 0;
                    if (shouldCheckSell) {
                        const soldMaps = await bot_MapTrader.checkAndSellMaps();
                        if (soldMaps) {
                            await wait(1000);
                        } else if (bot_CONFIG.bot_stopWhenNoBuyRequest && bot_CONFIG.bot_autoSellMaps) {
                            bot_Logger.error('未能出售藏宝图且无符合条件的求购单，停止运行');
                            bot_TrialManager.stop();
                            return { victory: false, stopReason: 'no_buy_request' };
                        }
                    }
                }

                // 选择天赋
                if (data.buffs && data.buffs.length > 0 && bot_CONFIG.bot_autoSelectBuff) {
                    await this.handleBuffSelection(data.buffs);
                }

                return { victory: true };
            } else {
                // 失败结算
                if (data.rewardMaps > 0) {
                    bot_STATE.stats.bot_totalMaps += data.rewardMaps;
                    bot_Logger.gold(`获得藏宝图 x${data.rewardMaps} (累计${bot_STATE.stats.bot_totalMaps})`);
                }

                // 检查是否新纪录
                if (data.isNewRecord && data.floor > bot_STATE.stats.bot_bestFloor) {
                    bot_STATE.stats.bot_bestFloor = data.floor;
                    bot_Logger.success(`新纪录！最高 ${data.floor} 层`);

                    if (bot_CONFIG.bot_stopOnRecord) {
                        bot_Logger.info('达到新纪录，停止运行');
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

            if (bot_CONFIG.bot_refreshBuffOnNoLegendary && !hasLegendary && bot_STATE.bot_buffRefreshCount < bot_CONFIG.bot_maxBuffRefreshTimes) {
                bot_Logger.info('没有传说天赋，尝试刷新...');
                try {
                    await bot_API.refreshBuff(bot_CONFIG.bot_useAdPoints);
                    bot_STATE.bot_buffRefreshCount++;
                    bot_Logger.success(`天赋已刷新 (${bot_STATE.bot_buffRefreshCount}/${bot_CONFIG.bot_maxBuffRefreshTimes})`);
                    // 刷新后需要重新获取试炼信息来选择天赋
                    await wait(bot_CONFIG.bot_delayAfterBuff);
                    return;
                } catch (e) {
                    bot_Logger.warn(`刷新天赋失败: ${e.message}`);
                }
            }

            // 选择天赋
            const strategy = bot_BuffStrategy[bot_CONFIG.bot_buffStrategy] || bot_BuffStrategy.attack;
            const selected = strategy(buffs);

            if (selected) {
                bot_Logger.info(`选择天赋: [${selected.rarity}] ${selected.name}`);
                await bot_API.chooseBuff(selected.id);
                await wait(bot_CONFIG.bot_delayAfterBuff);
            }
        }
    };

    // 藏宝图交易管理器
    const bot_MapTrader = {
        // 强制出售藏宝图（用于灵石不足时，不受配置限制）
        async forceSellMaps() {
            try {
                bot_Logger.warn('强制出售藏宝图以补充灵石...');
                return await this._doSellMaps();
            } catch (e) {
                bot_Logger.error(`强制出售藏宝图时出错: ${e.message}`);
                return false;
            }
        },

        // 检查是否需要出售藏宝图（根据配置）
        async checkAndSellMaps() {
            try {
                // 获取玩家信息
                const playerRes = await bot_API.getPlayerInfo();
                const playerData = playerRes.data || {};
                const currentStone = playerData.lowerStone || playerData.spiritStones || 0;

                // 检查灵石是否低于阈值（需要启用 autoSellMaps）
                const stoneBelowTriggered = bot_CONFIG.bot_autoSellMaps &&
                    currentStone < bot_CONFIG.bot_sellMapWhenStoneBelow;

                // 检查藏宝图数量是否超过阈值（独立触发，不需要启用 autoSellMaps）
                let countAboveTriggered = false;
                let mapCount = 0;
                if (bot_CONFIG.bot_sellMapWhenCountAbove > 0) {
                    const invRes = await bot_API.getInventory();
                    const inventory = invRes.data || [];
                    const mapItems = inventory.filter(item =>
                        item.name && item.name.includes('藏宝图') &&
                        !item.isEquipped && !item.isLocked &&
                        !(item.tradeCooldown && item.tradeCooldown > Date.now())
                    );
                    mapCount = mapItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
                    countAboveTriggered = mapCount > bot_CONFIG.bot_sellMapWhenCountAbove;
                }

                // 触发出售条件
                if (stoneBelowTriggered) {
                    bot_Logger.warn(`灵石不足 (${currentStone} < ${bot_CONFIG.bot_sellMapWhenStoneBelow})，尝试出售藏宝图...`);
                    return await this._doSellMaps();
                }

                if (countAboveTriggered) {
                    bot_Logger.warn(`藏宝图数量 (${mapCount}) 超过阈值 (${bot_CONFIG.bot_sellMapWhenCountAbove})，尝试出售...`);
                    return await this._doSellMaps();
                }

                return false;
            } catch (e) {
                bot_Logger.error(`出售藏宝图时出错: ${e.message}`);
                return false;
            }
        },

        // 实际执行出售逻辑
        async _doSellMaps() {
            try {
                // 获取背包中的藏宝图
                const invRes = await bot_API.getInventory();
                const inventory = invRes.data || [];

                // 查找藏宝图
                const mapItems = inventory.filter(item =>
                    item.name && item.name.includes('藏宝图') &&
                    !item.isEquipped && !item.isLocked &&
                    !(item.tradeCooldown && item.tradeCooldown > Date.now())
                );

                if (mapItems.length === 0) {
                    bot_Logger.warn('背包中没有可出售的藏宝图');
                    return false;
                }

                // 计算可出售的藏宝图总数
                let bot_totalMaps = mapItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
                if (bot_CONFIG.bot_maxMapsToSell > 0) {
                    bot_totalMaps = Math.min(bot_totalMaps, bot_CONFIG.bot_maxMapsToSell);
                }

                bot_Logger.info(`找到 ${bot_totalMaps} 个可出售的藏宝图`);

                // 获取求购列表
                const buyReqRes = await bot_API.getBuyRequests();
                const buyRequests = (buyReqRes.data || []).filter(req =>
                    req.name && req.name.includes('藏宝图') &&
                    req.unitPrice >= bot_CONFIG.bot_minMapPrice &&
                    !req.isMine
                );

                if (buyRequests.length === 0) {
                    bot_Logger.warn(`未找到价格 ≥ ${bot_CONFIG.bot_minMapPrice} 的藏宝图求购单`);
                    return false;
                }

                // 按价格排序（从高到低）
                buyRequests.sort((a, b) => b.unitPrice - a.unitPrice);

                let soldCount = 0;
                let earnedStone = 0;

                // 出售藏宝图
                for (const mapItem of mapItems) {
                    if (soldCount >= bot_totalMaps) break;

                    const itemQty = mapItem.quantity || 1;
                    let remainingQty = itemQty;

                    for (const request of buyRequests) {
                        if (remainingQty <= 0 || soldCount >= bot_totalMaps) break;
                        if (request.remainingQty <= 0) continue;

                        // 检查是否是同一种藏宝图
                        if (request.templateId !== mapItem.templateId) continue;

                        const sellQty = Math.min(remainingQty, request.remainingQty, bot_totalMaps - soldCount);

                        try {
                            const sellRes = await bot_API.sellToRequest(request.id, sellQty);
                            if (sellRes.code === 200) {
                                const grossEarning = sellQty * request.unitPrice;
                                const fee = bot_Utils.calcTradeFee(request.unitPrice, sellQty);
                                const netEarning = grossEarning - fee;
                                earnedStone += netEarning;
                                soldCount += sellQty;
                                remainingQty -= sellQty;
                                request.remainingQty -= sellQty;
                                bot_Logger.success(`出售 ${sellQty} 个藏宝图 @ ${request.unitPrice}灵石，获得 ${netEarning} 灵石(手续费${fee})`);
                            }
                        } catch (e) {
                            bot_Logger.error(`出售失败: ${e.message}`);
                        }

                        await wait(500);
                    }
                }

                if (soldCount > 0) {
                    bot_Logger.gold(`藏宝图出售完成: 售出 ${soldCount} 个，共获得 ${earnedStone} 灵石`);
                    return true;
                } else {
                    bot_Logger.warn('未能成功出售任何藏宝图');
                    bot_Logger.info('可能原因: 1.没有符合条件的求购单 2.藏宝图类型不匹配 3.求购价格低于设置 4.藏宝图被锁定或有交易冷却');
                    return false;
                }

            } catch (e) {
                bot_Logger.error(`出售藏宝图时出错: ${e.message}`);
                return false;
            }
        }
    };

    // 主题管理 - 自动适配游戏深色/浅色模式
    const bot_Theme = {
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
                bot_UI.updateTheme();
            });
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class']
            });

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                bot_UI.updateTheme();
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
    const bot_UI = {
        createPanel() {
            if ($('#bot_trial_panel')) return;

            const v = bot_Theme.getVars();
            const panel = document.createElement('div');
            panel.id = 'bot_trial_panel';
            panel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 92%;
                max-width: 480px;
                max-height: 85vh;
                z-index: 100000;
                background: ${v.bgPanel};
                border: 2px solid ${v.borderGold};
                border-radius: 12px;
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
            const panel = $('#bot_trial_panel');
            if (!panel) return;

            const v = bot_Theme.getVars();

            panel.style.background = v.bgPanel;
            panel.style.borderColor = v.borderGold;
            panel.style.color = v.textPrimary;
            panel.style.boxShadow = v.shadowLg;

            const header = $('#bot_trial_header');
            if (header) {
                header.style.background = v.gradientGold;
            }

            const status = $('#bot_trial_status');
            if (status) {
                status.style.color = v.textPrimary;
                status.style.background = v.bgCard;
            }

            const content = $('#bot_trial_content');
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
            const logPanel = $('#bot_trial_logs');
            if (logPanel) {
                logPanel.style.background = v.bgCard;
                logPanel.style.borderColor = v.borderColor;
            }
        },

        generatePanelHTML() {
            const v = bot_Theme.getVars();
            return `
                <div id="bot_trial_header" style="
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
                        <span id="bot_trial_status" style="
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
                        <button id="bot_trial_minimize" style="
                            background: rgba(255,255,255,0.2);
                            border: 1px solid rgba(255,255,255,0.4);
                            color: #fff;
                            width: 32px;
                            height: 32px;
                            border-radius: 50%;
                            cursor: pointer;
                            font-size: 16px;
                        ">−</button>
                        <button id="bot_trial_close" style="
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

                <div id="bot_trial_content" style="padding: 16px; overflow-y: auto; flex: 1;">
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
                                <div id="bot_stat_runs" style="color: ${v.textJade}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">总层数</div>
                                <div id="bot_stat_floors" style="color: ${v.textJade}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">藏宝图</div>
                                <div id="bot_stat_maps" style="color: ${v.textGold}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">花费灵石</div>
                                <div id="bot_stat_stone" style="color: ${v.textRed}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">最高纪录</div>
                                <div id="bot_stat_best" style="color: ${v.textPurple}; font-size: 16px; font-weight: bold;">0</div>
                            </div>
                            <div style="text-align: center; padding: 6px; background: ${v.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'}; border-radius: 6px;">
                                <div style="color: ${v.textMuted}; font-size: 10px;">运行时间</div>
                                <div id="bot_stat_time" style="color: ${v.textBlue}; font-size: 14px; font-weight: bold;">0:00</div>
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
                                    <input type="number" id="bot_max_stone" value="50000" step="1000" class="lv-trial-input" style="
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
                                    <input type="number" id="bot_max_runs" value="0" min="0" class="lv-trial-input" style="
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
                                    <input type="number" id="bot_target_maps" value="0" min="0" class="lv-trial-input" style="
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
                                    <input type="number" id="bot_stop_floor" value="0" min="0" class="lv-trial-input" style="
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
                                <input type="checkbox" id="bot_use_ad" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">使用仙缘代替灵石</span>
                            </label>

                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                <input type="checkbox" id="bot_stop_no_free" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">没有免费重置时停止</span>
                            </label>

                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                <input type="checkbox" id="bot_auto_giveup" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">达到层数后自动放弃</span>
                            </label>

                            <div style="margin-bottom: 10px;">
                                <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">达到此层数后放弃(每5层给藏宝图)</span>
                                <input type="number" id="bot_giveup_floor" value="0" min="0" step="5" class="lv-trial-input" style="
                                    width: 100%;
                                    margin-top: 4px;
                                    background: ${v.bgInput};
                                    border: 1px solid ${v.borderColor};
                                    color: ${v.textPrimary};
                                    padding: 6px 10px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                ">
                                <span style="font-size: 10px; color: ${v.textMuted};">0 = 不启用，建议设为5/10/15...</span>
                            </div>
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
                                    <input type="number" id="bot_delay_fight" value="1000" min="500" step="100" class="lv-trial-input" style="
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
                                    <input type="number" id="bot_delay_reset" value="2000" min="500" step="100" class="lv-trial-input" style="
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
                                    <input type="number" id="bot_delay_buff" value="500" min="100" step="100" class="lv-trial-input" style="
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
                                    <input type="number" id="bot_fight_timeout" value="30000" min="5000" step="1000" class="lv-trial-input" style="
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
                                <input type="checkbox" id="bot_show_details" checked style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">显示战斗详情</span>
                            </label>
                        </div>
                    </div>

                    <!-- 藏宝图交易 -->
                    <div class="lv-section" style="margin-bottom: 16px;">
                        <div class="lv-section-title" style="font-size: 12px; color: ${v.textGold}; margin-bottom: 10px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                            <span>▸</span> 藏宝图交易
                        </div>
                        <div class="lv-section-content">
                            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; cursor: pointer;">
                                <input type="checkbox" id="bot_auto_sell_maps" style="width: 16px; height: 16px;">
                                <span style="font-size: 12px;">灵石不足时自动出售藏宝图</span>
                            </label>

                            <div class="lv-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <div style="flex: 1;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最低出售价格</span>
                                    <input type="number" id="bot_min_map_price" value="2000" min="100" step="100" class="lv-trial-input" style="
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
                                    <input type="number" id="bot_sell_stone_below" value="5000" min="1000" step="500" class="lv-trial-input" style="
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
                                <input type="number" id="bot_max_maps_sell" value="0" min="0" class="lv-trial-input" style="
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

                            <div style="margin-bottom: 10px;">
                                <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">数量超过时出售</span>
                                <input type="number" id="bot_sell_count_above" value="0" min="0" class="lv-trial-input" style="
                                    width: 100%;
                                    margin-top: 4px;
                                    background: ${v.bgInput};
                                    border: 1px solid ${v.borderColor};
                                    color: ${v.textPrimary};
                                    padding: 6px 10px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                ">
                                <span style="font-size: 10px; color: ${v.textMuted};">0 = 不启用（当藏宝图数量超过此值时自动出售）</span>
                            </div>
                        </div>
                    </div>

                    <!-- 高级设置（折叠） -->
                    <div class="lv-section" style="margin-bottom: 16px;">
                        <div id="bot_advanced_toggle" style="font-size: 12px; color: ${v.textGold}; margin-bottom: 10px; font-weight: bold; display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 8px; background: ${v.isDark ? 'rgba(201, 153, 58, 0.1)' : 'rgba(201, 153, 58, 0.05)'}; border-radius: 6px; border: 1px solid ${v.isDark ? 'rgba(201, 153, 58, 0.2)' : 'rgba(201, 153, 58, 0.15)'};">
                            <span id="bot_advanced_arrow" style="transition: transform 0.2s;">▸</span> 高级设置
                        </div>
                        <div id="bot_advanced_content" style="display: none;">
                            <!-- 天赋设置 -->
                            <div style="margin-bottom: 16px; padding: 12px; background: ${v.isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)'}; border-radius: 8px;">
                                <div style="font-size: 11px; color: ${v.textSecondary}; margin-bottom: 10px; font-weight: bold;">天赋设置</div>
                                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; cursor: pointer;">
                                    <input type="checkbox" id="bot_auto_buff" checked style="width: 16px; height: 16px;">
                                    <span style="font-size: 12px;">自动选择天赋</span>
                                </label>

                                <div style="margin-bottom: 10px;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">选择策略:</span>
                                    <select id="bot_buff_strategy" class="lv-trial-select" style="
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
                                    <select id="bot_min_rarity" class="lv-trial-select" style="
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
                                    <input type="checkbox" id="bot_refresh_buff" style="width: 16px; height: 16px;">
                                    <span style="font-size: 12px;">无传说时自动刷新天赋</span>
                                </label>

                                <div style="display: flex; gap: 10px;">
                                    <div style="flex: 1;">
                                        <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最大刷新次数</span>
                                        <input type="number" id="bot_max_refresh" value="3" min="1" max="10" class="lv-trial-input" style="
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

                            <!-- 停止条件 -->
                            <div style="padding: 12px; background: ${v.isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)'}; border-radius: 8px;">
                                <div style="font-size: 11px; color: ${v.textSecondary}; margin-bottom: 10px; font-weight: bold;">停止条件</div>
                                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                    <input type="checkbox" id="bot_stop_record" style="width: 16px; height: 16px;">
                                    <span style="font-size: 12px;">达到新纪录时停止</span>
                                </label>

                                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                    <input type="checkbox" id="bot_stop_error" checked style="width: 16px; height: 16px;">
                                    <span style="font-size: 12px;">出错时停止</span>
                                </label>

                                <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;">
                                    <input type="checkbox" id="bot_stop_no_buy" style="width: 16px; height: 16px;">
                                    <span style="font-size: 12px;">无求购单时停止</span>
                                </label>

                                <div style="margin-bottom: 10px;">
                                    <span class="lv-label" style="font-size: 11px; color: ${v.textSecondary};">最大连续错误次数</span>
                                    <input type="number" id="bot_max_errors" value="3" min="1" max="10" class="lv-trial-input" style="
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
                                    <input type="checkbox" id="bot_auto_close" style="width: 16px; height: 16px;">
                                    <span style="font-size: 12px;">结束后自动关闭面板</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                        <button id="bot_trial_start" style="
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
                        <button id="bot_trial_stop" style="
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
                        <button id="bot_clear_log" style="
                            font-size: 11px;
                            padding: 4px 10px;
                            background: ${v.bgCard};
                            border: 1px solid ${v.borderColor};
                            color: ${v.textMuted};
                            border-radius: 6px;
                            cursor: pointer;
                        ">清除</button>
                    </div>
                    <div id="bot_trial_logs" class="lv-trial-card" style="
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
            $('#bot_trial_close')?.addEventListener('click', () => this.closePanel());
            $('#bot_trial_minimize')?.addEventListener('click', () => this.toggleMinimize());

            $('#bot_trial_start')?.addEventListener('click', () => {
                this.saveConfig();
                bot_TrialManager.start();
            });

            $('#bot_trial_stop')?.addEventListener('click', () => {
                bot_TrialManager.stop();
            });

            $('#bot_clear_log')?.addEventListener('click', () => {
                bot_STATE.logs = [];
                this.updateLogPanel();
            });

            // 高级设置折叠/展开
            $('#bot_advanced_toggle')?.addEventListener('click', () => {
                const content = $('#bot_advanced_content');
                const arrow = $('#bot_advanced_arrow');
                if (content && arrow) {
                    const isHidden = content.style.display === 'none';
                    content.style.display = isHidden ? 'block' : 'none';
                    arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
                }
            });

            // 点击面板外部关闭
            $('#bot_trial_panel')?.addEventListener('click', (e) => {
                if (e.target.id === 'bot_trial_panel') this.closePanel();
            });

            // ESC键关闭
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && bot_STATE.bot_panelOpen) {
                    this.closePanel();
                }
            });
        },

        makeDraggable() {
            const header = $('#bot_trial_header');
            const panel = $('#bot_trial_panel');
            if (!header || !panel) return;

            let isDragging = false;
            let startX, startY, startLeft, startTop;

            // 鼠标事件
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

            // 触摸事件（移动端支持）
            header.addEventListener('touchstart', (e) => {
                isDragging = true;
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                const rect = panel.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                panel.style.transform = 'none';
                panel.style.left = startLeft + 'px';
                panel.style.top = startTop + 'px';
            }, { passive: false });

            document.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const touch = e.touches[0];
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;
                panel.style.left = (startLeft + dx) + 'px';
                panel.style.top = (startTop + dy) + 'px';
            }, { passive: false });

            document.addEventListener('touchend', () => {
                isDragging = false;
            });
        },

        toggleMinimize() {
            const panel = $('#bot_trial_panel');
            const content = $('#bot_trial_content');
            const btn = $('#bot_trial_minimize');
            if (!panel || !content || !btn) return;

            bot_STATE.bot_panelMinimized = !bot_STATE.bot_panelMinimized;
            content.style.display = bot_STATE.bot_panelMinimized ? 'none' : 'block';
            btn.textContent = bot_STATE.bot_panelMinimized ? '+' : '−';

            // 添加/移除收起状态类，用于CSS样式控制
            if (bot_STATE.bot_panelMinimized) {
                panel.classList.add('bot-minimized');
            } else {
                panel.classList.remove('bot-minimized');
            }
        },

        saveConfig() {
            bot_CONFIG.bot_maxStoneCost = parseInt($('#bot_max_stone')?.value || '50000');
            bot_CONFIG.bot_maxRuns = parseInt($('#bot_max_runs')?.value || '0');
            bot_CONFIG.bot_targetMaps = parseInt($('#bot_target_maps')?.value || '0');
            bot_CONFIG.bot_stopOnFloor = parseInt($('#bot_stop_floor')?.value || '0');
            bot_CONFIG.bot_useAdPoints = $('#bot_use_ad')?.checked || false;
            bot_CONFIG.bot_stopWhenNoFreeReset = $('#bot_stop_no_free')?.checked || false;
            bot_CONFIG.bot_autoGiveUp = $('#bot_auto_giveup')?.checked || false;
            bot_CONFIG.bot_giveUpAtFloor = parseInt($('#bot_giveup_floor')?.value || '0');

            bot_CONFIG.bot_delayBetweenFights = parseInt($('#bot_delay_fight')?.value || '1000');
            bot_CONFIG.bot_delayAfterReset = parseInt($('#bot_delay_reset')?.value || '2000');
            bot_CONFIG.bot_delayAfterBuff = parseInt($('#bot_delay_buff')?.value || '500');
            bot_CONFIG.bot_maxFightTime = parseInt($('#bot_fight_timeout')?.value || '30000');
            bot_CONFIG.bot_showFightDetails = $('#bot_show_details')?.checked !== false;

            bot_CONFIG.bot_autoSelectBuff = $('#bot_auto_buff')?.checked !== false;
            bot_CONFIG.bot_buffStrategy = $('#bot_buff_strategy')?.value || 'attack';
            bot_CONFIG.bot_minBuffRarity = parseInt($('#bot_min_rarity')?.value || '1');
            bot_CONFIG.bot_refreshBuffOnNoLegendary = $('#bot_refresh_buff')?.checked || false;
            bot_CONFIG.bot_maxBuffRefreshTimes = parseInt($('#bot_max_refresh')?.value || '3');

            bot_CONFIG.bot_stopOnRecord = $('#bot_stop_record')?.checked || false;
            bot_CONFIG.bot_stopOnError = $('#bot_stop_error')?.checked !== false;
            bot_CONFIG.bot_stopWhenNoBuyRequest = $('#bot_stop_no_buy')?.checked || false;
            bot_CONFIG.bot_maxConsecutiveErrors = parseInt($('#bot_max_errors')?.value || '3');
            bot_CONFIG.bot_autoClosePanel = $('#bot_auto_close')?.checked || false;

            // 藏宝图交易设置
            bot_CONFIG.bot_autoSellMaps = $('#bot_auto_sell_maps')?.checked || false;
            bot_CONFIG.bot_minMapPrice = parseInt($('#bot_min_map_price')?.value || '2000');
            bot_CONFIG.bot_sellMapWhenStoneBelow = parseInt($('#bot_sell_stone_below')?.value || '5000');
            bot_CONFIG.bot_maxMapsToSell = parseInt($('#bot_max_maps_sell')?.value || '0');
            bot_CONFIG.bot_sellMapWhenCountAbove = parseInt($('#bot_sell_count_above')?.value || '0');

            localStorage.setItem('lv_trial_config_v2', JSON.stringify(bot_CONFIG));
            bot_Logger.info('配置已保存');
        },

        loadConfig() {
            const saved = localStorage.getItem('lv_trial_config_v2');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    Object.assign(bot_CONFIG, data);
                } catch (e) {}
            }

            // 基本设置
            if ($('#bot_max_stone')) $('#bot_max_stone').value = bot_CONFIG.bot_maxStoneCost;
            if ($('#bot_max_runs')) $('#bot_max_runs').value = bot_CONFIG.bot_maxRuns;
            if ($('#bot_target_maps')) $('#bot_target_maps').value = bot_CONFIG.bot_targetMaps;
            if ($('#bot_stop_floor')) $('#bot_stop_floor').value = bot_CONFIG.bot_stopOnFloor;
            if ($('#bot_use_ad')) $('#bot_use_ad').checked = bot_CONFIG.bot_useAdPoints;
            if ($('#bot_stop_no_free')) $('#bot_stop_no_free').checked = bot_CONFIG.bot_stopWhenNoFreeReset;
            if ($('#bot_auto_giveup')) $('#bot_auto_giveup').checked = bot_CONFIG.bot_autoGiveUp;
            if ($('#bot_giveup_floor')) $('#bot_giveup_floor').value = bot_CONFIG.bot_giveUpAtFloor;

            // 战斗设置
            if ($('#bot_delay_fight')) $('#bot_delay_fight').value = bot_CONFIG.bot_delayBetweenFights;
            if ($('#bot_delay_reset')) $('#bot_delay_reset').value = bot_CONFIG.bot_delayAfterReset;
            if ($('#bot_delay_buff')) $('#bot_delay_buff').value = bot_CONFIG.bot_delayAfterBuff;
            if ($('#bot_fight_timeout')) $('#bot_fight_timeout').value = bot_CONFIG.bot_maxFightTime;
            if ($('#bot_show_details')) $('#bot_show_details').checked = bot_CONFIG.bot_showFightDetails;

            // 天赋设置
            if ($('#bot_auto_buff')) $('#bot_auto_buff').checked = bot_CONFIG.bot_autoSelectBuff;
            if ($('#bot_buff_strategy')) $('#bot_buff_strategy').value = bot_CONFIG.bot_buffStrategy;
            if ($('#bot_min_rarity')) $('#bot_min_rarity').value = bot_CONFIG.bot_minBuffRarity;
            if ($('#bot_refresh_buff')) $('#bot_refresh_buff').checked = bot_CONFIG.bot_refreshBuffOnNoLegendary;
            if ($('#bot_max_refresh')) $('#bot_max_refresh').value = bot_CONFIG.bot_maxBuffRefreshTimes;

            // 停止条件
            if ($('#bot_stop_record')) $('#bot_stop_record').checked = bot_CONFIG.bot_stopOnRecord;
            if ($('#bot_stop_error')) $('#bot_stop_error').checked = bot_CONFIG.bot_stopOnError;
            if ($('#bot_stop_no_buy')) $('#bot_stop_no_buy').checked = bot_CONFIG.bot_stopWhenNoBuyRequest;
            if ($('#bot_max_errors')) $('#bot_max_errors').value = bot_CONFIG.bot_maxConsecutiveErrors;
            if ($('#bot_auto_close')) $('#bot_auto_close').checked = bot_CONFIG.bot_autoClosePanel;

            // 藏宝图交易设置
            if ($('#bot_auto_sell_maps')) $('#bot_auto_sell_maps').checked = bot_CONFIG.bot_autoSellMaps;
            if ($('#bot_min_map_price')) $('#bot_min_map_price').value = bot_CONFIG.bot_minMapPrice;
            if ($('#bot_sell_stone_below')) $('#bot_sell_stone_below').value = bot_CONFIG.bot_sellMapWhenStoneBelow;
            if ($('#bot_max_maps_sell')) $('#bot_max_maps_sell').value = bot_CONFIG.bot_maxMapsToSell;
            if ($('#bot_sell_count_above')) $('#bot_sell_count_above').value = bot_CONFIG.bot_sellMapWhenCountAbove;
        },

        togglePanel() {
            const panel = $('#bot_trial_panel');
            if (!panel) {
                this.createPanel();
                setTimeout(() => this.togglePanel(), 100);
                return;
            }

            bot_STATE.bot_panelOpen = !bot_STATE.bot_panelOpen;
            panel.style.display = bot_STATE.bot_panelOpen ? 'flex' : 'none';

            if (bot_STATE.bot_panelOpen) {
                this.updateStats();
            }
        },

        closePanel() {
            bot_STATE.bot_panelOpen = false;
            const panel = $('#bot_trial_panel');
            if (panel) panel.style.display = 'none';
        },

        updateStatus(status) {
            const el = $('#bot_trial_status');
            if (el) {
                el.textContent = status;
                el.style.color = status === '运行中' ? '#3dab97' : '#e8e0d0';
            }
        },

        updateButtonStates() {
            const startBtn = $('#bot_trial_start');
            const stopBtn = $('#bot_trial_stop');

            if (startBtn) {
                startBtn.style.opacity = bot_STATE.bot_running ? '0.5' : '1';
                startBtn.style.pointerEvents = bot_STATE.bot_running ? 'none' : 'auto';
            }
            if (stopBtn) {
                stopBtn.style.opacity = bot_STATE.bot_running ? '1' : '0.5';
                stopBtn.style.pointerEvents = bot_STATE.bot_running ? 'auto' : 'none';
            }
        },

        updateStats() {
            const setText = (id, val) => {
                const el = $(id);
                if (el) el.textContent = val;
            };

            setText('#bot_stat_runs', bot_STATE.stats.bot_totalRuns);
            setText('#bot_stat_floors', bot_STATE.stats.bot_totalFloors);
            setText('#bot_stat_maps', bot_STATE.stats.bot_totalMaps);
            setText('#bot_stat_stone', bot_STATE.stats.bot_totalStoneSpent);
            setText('#bot_stat_best', bot_STATE.stats.bot_bestFloor);

            // 运行时间
            if (bot_STATE.stats.bot_startTime) {
                const runTime = Math.floor((Date.now() - bot_STATE.stats.bot_startTime) / 1000);
                const mins = Math.floor(runTime / 60);
                const secs = runTime % 60;
                setText('#bot_stat_time', `${mins}:${secs.toString().padStart(2, '0')}`);
            }
        },

        updateLogPanel() {
            const panel = $('#bot_trial_logs');
            if (!panel) return;

            const html = bot_STATE.logs.map(log => {
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
            if ($('#bot_trial_sidebar_btn')) return;

            const v = bot_Theme.getVars();

            // 创建独立的 section 容器
            const section = document.createElement('div');
            section.className = 'panel-section';
            section.id = 'bot_trial_section';
            section.style.cssText = `
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--border-color);
                width: 100%;
                box-sizing: border-box;
            `;

            const title = document.createElement('h3');
            title.className = 'panel-title';
            title.textContent = '试炼助手';
            title.style.cssText = `
                font-size: 13px;
                color: #c9993a;
                letter-spacing: 2px;
                margin-bottom: 12px;
                padding-bottom: 6px;
                border-bottom: 1px solid rgba(201, 153, 58, 0.15);
            `;

            const btn = document.createElement('button');
            btn.id = 'bot_trial_sidebar_btn';
            btn.textContent = '打开试炼面板';
            btn.style.cssText = `
                width: 100%;
                padding: 10px 12px;
                background: ${v.isDark ? 'rgba(201, 153, 58, 0.2)' : 'rgba(201, 153, 58, 0.15)'};
                border: 1px solid ${v.isDark ? 'rgba(201, 153, 58, 0.4)' : 'rgba(201, 153, 58, 0.3)'};
                border-radius: 6px;
                color: #c9993a;
                font-size: 13px;
                font-weight: bold;
                cursor: pointer;
                font-family: KaiTi, 楷体, STKaiti, "Noto Serif SC", serif;
                transition: all 0.2s;
                display: block;
                text-align: center;
                -webkit-tap-highlight-color: transparent;
                box-sizing: border-box;
            `;

            btn.addEventListener('mouseenter', () => {
                btn.style.background = v.isDark ? 'rgba(201, 153, 58, 0.35)' : 'rgba(201, 153, 58, 0.25)';
                btn.style.borderColor = v.isDark ? 'rgba(201, 153, 58, 0.6)' : 'rgba(201, 153, 58, 0.4)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = v.isDark ? 'rgba(201, 153, 58, 0.2)' : 'rgba(201, 153, 58, 0.15)';
                btn.style.borderColor = v.isDark ? 'rgba(201, 153, 58, 0.4)' : 'rgba(201, 153, 58, 0.3)';
            });

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePanel();
            });

            section.appendChild(title);
            section.appendChild(btn);

            // 插入到炼造 section 后面（如果存在）
            const craftSection = $('#lv-craft-section');
            if (craftSection) {
                craftSection.insertAdjacentElement('afterend', section);
                return;
            }

            // 如果没有找到炼造 section，插入到侧边栏第一个 section 后面
            const playerPanel = $('.player-panel') || $('#playerPanel');
            if (playerPanel) {
                const firstSection = playerPanel.querySelector('.panel-section');
                if (firstSection) {
                    firstSection.insertAdjacentElement('afterend', section);
                    return;
                }
                // 兜底：直接append到侧边栏
                playerPanel.appendChild(section);
            }
        }
    };

    // 初始化
    function init() {
        if (!location.href.includes('ling.muge.info')) return;

        bot_Logger.info('天道试炼助手 v1.1.0 已加载');

        // 添加全局样式移除按钮焦点轮廓
        const style = document.createElement('style');
        style.textContent = `
            #bot_trial_panel button,
            #bot_trial_panel input,
            #bot_trial_panel select,
            #bot_trial_sidebar_btn {
                outline: none !important;
                -webkit-tap-highlight-color: transparent !important;
            }
            #bot_trial_panel button:focus,
            #bot_trial_panel input:focus,
            #bot_trial_panel select:focus,
            #bot_trial_sidebar_btn:focus {
                outline: none !important;
                box-shadow: none !important;
            }
            #bot_trial_panel button:active,
            #bot_trial_sidebar_btn:active {
                outline: none !important;
            }
            /* 移动端适配 */
            @media (max-width: 480px) {
                #bot_trial_panel {
                    width: 95% !important;
                    max-width: none !important;
                    max-height: 80vh !important;
                    border-radius: 10px !important;
                }
                #bot_trial_content {
                    padding: 12px !important;
                }
                .lv-trial-input, .lv-trial-select {
                    font-size: 14px !important;
                    padding: 8px !important;
                }
            }
            /* 收起状态更小 - 调整宽度和位置 */
            #bot_trial_panel.bot-minimized {
                max-height: 48px !important;
                overflow: hidden !important;
                width: auto !important;
                min-width: 100px !important;
                max-width: 140px !important;
            }
            #bot_trial_panel.bot-minimized #bot_trial_content {
                display: none !important;
            }
            #bot_trial_panel.bot-minimized #bot_trial_status {
                display: none !important;
            }
            /* 收起时隐藏标题文字，只保留图标 */
            #bot_trial_panel.bot-minimized #bot_trial_header span:nth-child(2) {
                display: none !important;
            }
            /* 收起时让图标居中 */
            #bot_trial_panel.bot-minimized #bot_trial_header > div:first-child {
                justify-content: center !important;
                width: 100%;
            }
            /* 移动端收起状态 */
            @media (max-width: 480px) {
                #bot_trial_panel.bot-minimized {
                    max-height: 44px !important;
                    min-width: 90px !important;
                    max-width: 120px !important;
                }
            }
        `;
        document.head.appendChild(style);

        // 初始化主题观察者
        bot_Theme.initObserver();

        // 等待侧边栏加载
        const checkSidebar = setInterval(() => {
            const sidebar = $('.player-panel') || $('#playerPanel');
            if (sidebar) {
                clearInterval(checkSidebar);
                bot_UI.createSidebarButton();
                bot_Logger.info('点击侧边栏「试炼助手」按钮打开面板');
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

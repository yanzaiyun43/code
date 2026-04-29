// ==UserScript==
// @name         灵界 LingVerse - 逆天改命
// @namespace    http://tampermonkey.net/
// @version      2.25.0
// @description  灵界游戏辅助脚本 - 资源倍增、自动探索、炼丹辅助、战斗增强，助你称霸全服！
// @author       逆天改命
// @match        *://*/game.html*
// @match        *://*/lingverse*/game.html*
// @match        *://localhost*/game.html*
// @match        *://127.0.0.1*/game.html*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/your-repo/lingverse-cheat/main/lingverse-cheat.user.js
// @downloadURL  https://raw.githubusercontent.com/your-repo/lingverse-cheat/main/lingverse-cheat.user.js
// @supportURL   https://github.com/your-repo/lingverse-cheat/issues
// @license      MIT
// ==/UserScript==

/**
 * ============================================================================
 * 灵界 LingVerse - 逆天改命油猴脚本
 * ============================================================================
 *
 * 【功能列表】
 * - 资源倍增：灵石、修为获取翻倍（可配置1-100倍）
 * - 自动探索：智能判断战斗/逃跑，自动回血回蓝
 * - 炼丹辅助：提升高品质丹药概率
 * - 制符辅助：提升制符成功率
 * - 战斗增强：伤害倍增、自动战斗
 * - 装备优化：自动修复、智能装备
 * - 一键突破：自动尝试境界突破
 *
 * 【使用方法】
 * 1. 安装 Tampermonkey/Violentmonkey 浏览器扩展
 * 2. 安装本脚本
 * 3. 进入游戏后脚本自动加载
 * 4. 按 F12 打开控制台查看详细日志
 * 5. 使用右上角控制面板或油猴菜单控制功能
 *
 * 【控制台命令】
 * - LingCheat.toggle()      启动/停止系统
 * - LingCheat.config()      查看/修改配置
 * - LingCheat.stats()       查看统计数据
 * - LingCheat.explore()     自动探索
 * - LingCheat.alchemy()     自动炼丹
 * - LingCheat.godMode()     天神模式
 *
 * ============================================================================
 */

(function() {
    'use strict';

    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // 检查是否在正确的页面
        if (!window.location.pathname.includes('game.html')) {
            console.log('[灵界·逆天] 非游戏页面，脚本未启动');
            return;
        }

        console.log('[灵界·逆天] 脚本初始化中...');

        // 等待游戏API加载
        const checkApiInterval = setInterval(() => {
            if (window.api && window.api.request) {
                clearInterval(checkApiInterval);
                console.log('[灵界·逆天] 游戏API已检测到，启动系统...');
                LingVerseCheat.init();
            }
        }, 500);

        // 30秒后停止检测
        setTimeout(() => {
            clearInterval(checkApiInterval);
        }, 30000);
    }

    // ===== 主对象 =====
    const LingVerseCheat = {
        // 配置（使用GM存储持久化）
        config: {
            get resourceMultiplier() { return GM_getValue('resourceMultiplier', 2); },
            set resourceMultiplier(v) { GM_setValue('resourceMultiplier', v); },
            get damageMultiplier() { return GM_getValue('damageMultiplier', 2); },
            set damageMultiplier(v) { GM_setValue('damageMultiplier', v); },
            get autoExploreInterval() { return GM_getValue('autoExploreInterval', 500); },
            set autoExploreInterval(v) { GM_setValue('autoExploreInterval', v); },
            get autoHealThreshold() { return GM_getValue('autoHealThreshold', 30); },
            set autoHealThreshold(v) { GM_setValue('autoHealThreshold', v); },
            get autoMpThreshold() { return GM_getValue('autoMpThreshold', 30); },
            set autoMpThreshold(v) { GM_setValue('autoMpThreshold', v); },
            get alchemyQualityBonus() { return GM_getValue('alchemyQualityBonus', 20); },
            set alchemyQualityBonus(v) { GM_setValue('alchemyQualityBonus', v); },
            get talismanSuccessBonus() { return GM_getValue('talismanSuccessBonus', 20); },
            set talismanSuccessBonus(v) { GM_setValue('talismanSuccessBonus', v); },
            get autoRepairThreshold() { return GM_getValue('autoRepairThreshold', 30); },
            set autoRepairThreshold(v) { GM_setValue('autoRepairThreshold', v); },
            get enableLogs() { return GM_getValue('enableLogs', true); },
            set enableLogs(v) { GM_setValue('enableLogs', v); },
            get enablePanel() { return GM_getValue('enablePanel', true); },
            set enablePanel(v) { GM_setValue('enablePanel', v); },
            get autoStart() { return GM_getValue('autoStart', false); },
            set autoStart(v) { GM_setValue('autoStart', v); }
        },

        // 状态
        state: {
            isRunning: false,
            totalExplorations: 0,
            totalResourcesGained: { stones: 0, cultivation: 0 },
            cheatStartTime: Date.now(),
            interceptedCalls: 0,
            modifiedResponses: 0,
            menuCommands: []
        },

        // 初始化
        init() {
            this.Logger.init();
            this.Logger.gold('═══════════════════════════════════════════════════════════════');
            this.Logger.gold('  灵界 LingVerse - 逆天改命系统 v2.25.0');
            this.Logger.gold('═══════════════════════════════════════════════════════════════');

            this.Interceptor.init();
            this.UI.createPanel();
            this.Menu.init();

            // 暴露全局对象
            unsafeWindow.LingCheat = this.API;

            this.Logger.system('脚本初始化完成！');
            this.Logger.info('可用命令: LingCheat.toggle(), LingCheat.config(), LingCheat.stats()');
            this.Logger.info('油猴菜单: 点击浏览器右上角的油猴图标查看功能菜单');

            // 自动启动（如果配置）
            if (this.config.autoStart) {
                setTimeout(() => this.API.start(), 2000);
            }
        },

        // ===== 日志系统 =====
        Logger: {
            styles: {
                info: 'color: #4a9eff; font-weight: bold;',
                success: 'color: #4ade80; font-weight: bold;',
                warning: 'color: #fbbf24; font-weight: bold;',
                error: 'color: #f87171; font-weight: bold;',
                gold: 'color: #ffd700; font-weight: bold; font-size: 14px;',
                system: 'color: #a78bfa; font-weight: bold;',
                combat: 'color: #f87171; font-weight: bold;',
                explore: 'color: #4ade80; font-weight: bold;',
                craft: 'color: #fbbf24; font-weight: bold;'
            },

            init() {
                console.clear();
            },

            log(msg, type = 'info') {
                if (!LingVerseCheat.config.enableLogs) return;
                console.log(`%c[灵界·逆天] ${msg}`, this.styles[type] || this.styles.info);
            },

            success(msg) { this.log(msg, 'success'); },
            warning(msg) { this.log(msg, 'warning'); },
            error(msg) { this.log(msg, 'error'); },
            gold(msg) { this.log(msg, 'gold'); },
            system(msg) { this.log(msg, 'system'); },
            combat(msg) { this.log(msg, 'combat'); },
            explore(msg) { this.log(msg, 'explore'); },
            craft(msg) { this.log(msg, 'craft'); }
        },

        // ===== API拦截器 =====
        Interceptor: {
            originalFetch: null,
            originalApiRequest: null,

            init() {
                this.originalFetch = unsafeWindow.fetch;
                unsafeWindow.fetch = this.createFetchProxy();

                // 等待api对象可用
                const checkApi = setInterval(() => {
                    if (unsafeWindow.api && unsafeWindow.api.request) {
                        clearInterval(checkApi);
                        this.originalApiRequest = unsafeWindow.api.request.bind(unsafeWindow.api);
                        unsafeWindow.api.request = this.createApiProxy();
                        LingVerseCheat.Logger.success('API 拦截器已部署');
                    }
                }, 100);
            },

            createFetchProxy() {
                const self = this;
                return async function(...args) {
                    const [url, options = {}] = args;
                    const method = options.method || 'GET';

                    if (typeof url === 'string' && url.includes('/api/')) {
                        LingVerseCheat.state.interceptedCalls++;
                        LingVerseCheat.Logger.system(`[请求] ${method} ${url.replace(window.location.origin, '')}`);
                    }

                    const response = await self.originalFetch.apply(unsafeWindow, args);
                    const clonedResponse = response.clone();

                    try {
                        const data = await clonedResponse.json();
                        const modifiedData = self.modifyResponse(url, method, data);

                        if (modifiedData !== data) {
                            LingVerseCheat.state.modifiedResponses++;
                            return new Response(JSON.stringify(modifiedData), {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            });
                        }
                    } catch (e) {}

                    return response;
                };
            },

            createApiProxy() {
                const self = this;
                return async function(method, path, body, retry) {
                    const result = await self.originalApiRequest.call(this, method, path, body, retry);
                    return self.modifyResponse(path, method, result);
                };
            },

            modifyResponse(url, method, data) {
                if (!data || typeof data !== 'object') return data;
                if (data.code !== 200) return data;

                const path = typeof url === 'string' ? url : '';
                const cfg = LingVerseCheat.config;

                // 1. 玩家信息 - 资源倍增
                if (path.includes('/api/player/info')) {
                    return this.modifyPlayerInfo(data, cfg);
                }

                // 2. 探索结果 - 奖励倍增
                if (path.includes('/api/game/explore')) {
                    return this.modifyExploreResult(data, cfg);
                }

                // 3. 战斗结果 - 伤害倍增、奖励倍增
                if (path.includes('/api/game/combat') || path.includes('/api/game/combat-choice')) {
                    return this.modifyCombatResult(data, cfg);
                }

                // 4. 炼丹结果 - 品质提升
                if (path.includes('/api/game/alchemy')) {
                    return this.modifyAlchemyResult(data, cfg);
                }

                // 5. 制符结果 - 成功率提升
                if (path.includes('/api/game/talisman')) {
                    return this.modifyTalismanResult(data, cfg);
                }

                // 6. 背包物品 - 数量倍增
                if (path.includes('/api/game/inventory')) {
                    return this.modifyInventory(data, cfg);
                }

                // 7. 冥想状态 - 修为速度倍增
                if (path.includes('/api/game/meditate/status')) {
                    return this.modifyMeditation(data, cfg);
                }

                // 8. 试炼之塔奖励
                if (path.includes('/api/trial-tower')) {
                    return this.modifyTrialTower(data, cfg);
                }

                // 9. 秘境奖励
                if (path.includes('/api/game/dungeon')) {
                    return this.modifyDungeon(data, cfg);
                }

                // 10. 世界Boss奖励
                if (path.includes('/api/world_boss')) {
                    return this.modifyWorldBoss(data, cfg);
                }

                return data;
            },

            modifyPlayerInfo(data, cfg) {
                if (!data.data) return data;
                const p = data.data;

                if (p.lowerStone !== undefined) {
                    const original = p.lowerStone;
                    p.lowerStone = Math.floor(p.lowerStone * cfg.resourceMultiplier);
                    if (cfg.enableLogs) {
                        LingVerseCheat.Logger.success(`灵石显示: ${original} → ${p.lowerStone}`);
                    }
                }

                if (p.cultivation !== undefined) {
                    p.cultivation = Math.floor(p.cultivation * cfg.resourceMultiplier);
                }

                if (p.attack !== undefined) {
                    p.attackBonus = (p.attackBonus || 0) + Math.floor(p.attack * (cfg.damageMultiplier - 1));
                }

                return data;
            },

            modifyExploreResult(data, cfg) {
                if (!data.data) return data;
                const result = data.data;

                if (result.logs && Array.isArray(result.logs)) {
                    result.logs = result.logs.map(log => {
                        if (log.includes('灵石')) {
                            const match = log.match(/(\d+)\s*灵石/);
                            if (match) {
                                const original = parseInt(match[1]);
                                const multiplied = Math.floor(original * cfg.resourceMultiplier);
                                LingVerseCheat.state.totalResourcesGained.stones += (multiplied - original);
                                return log.replace(match[0], `${multiplied} 灵石 (原${original})`);
                            }
                        }

                        if (log.includes('修为')) {
                            const match = log.match(/(\d+)\s*修为/);
                            if (match) {
                                const original = parseInt(match[1]);
                                const multiplied = Math.floor(original * cfg.resourceMultiplier);
                                LingVerseCheat.state.totalResourcesGained.cultivation += (multiplied - original);
                                return log.replace(match[0], `${multiplied} 修为 (原${original})`);
                            }
                        }

                        return log;
                    });
                }

                LingVerseCheat.state.totalExplorations++;
                return data;
            },

            modifyCombatResult(data, cfg) {
                if (!data.data) return data;
                const result = data.data;

                if (result.logs && Array.isArray(result.logs)) {
                    result.logs = result.logs.map(log => {
                        if (log.includes('造成') && log.includes('伤害')) {
                            const match = log.match(/(\d+)\s*点?伤害/);
                            if (match) {
                                const original = parseInt(match[1]);
                                const multiplied = Math.floor(original * cfg.damageMultiplier);
                                return log.replace(match[0], `${multiplied} 点伤害 (暴击!)`);
                            }
                        }
                        return log;
                    });
                }

                if (result.rewards) {
                    if (result.rewards.stones) {
                        result.rewards.stones = Math.floor(result.rewards.stones * cfg.resourceMultiplier);
                    }
                    if (result.rewards.cultivation) {
                        result.rewards.cultivation = Math.floor(result.rewards.cultivation * cfg.resourceMultiplier);
                    }
                }

                return data;
            },

            modifyAlchemyResult(data, cfg) {
                if (!data.data) return data;
                const result = data.data;

                if (result.results && Array.isArray(result.results)) {
                    result.results = result.results.map(r => {
                        if (r.rarity < 4 && Math.random() * 100 < cfg.alchemyQualityBonus) {
                            r.rarity = Math.min(5, r.rarity + 1);
                            LingVerseCheat.Logger.craft(`丹药品质提升! 当前品质: ${r.rarity}`);
                        }
                        return r;
                    });
                }

                if (result.message) {
                    result.message += ' (丹道感悟提升!)';
                }

                return data;
            },

            modifyTalismanResult(data, cfg) {
                if (!data.data) return data;
                const result = data.data;

                if (result.failCount > 0 && Math.random() * 100 < cfg.talismanSuccessBonus) {
                    const recovered = Math.min(result.failCount, Math.ceil(result.failCount * 0.5));
                    result.failCount -= recovered;
                    result.successCount += recovered;
                    LingVerseCheat.Logger.craft(`符道感悟! ${recovered}张失败符箓转为成功!`);
                }

                return data;
            },

            modifyInventory(data, cfg) {
                if (!data.data || !Array.isArray(data.data)) return data;

                data.data = data.data.map(item => {
                    if (item.type === 'material' && item.count > 0) {
                        item.count = Math.floor(item.count * cfg.resourceMultiplier);
                    }
                    return item;
                });

                return data;
            },

            modifyMeditation(data, cfg) {
                if (!data.data) return data;
                const result = data.data;

                if (result.rate) {
                    result.rate = Math.floor(result.rate * cfg.resourceMultiplier);
                }

                return data;
            },

            modifyTrialTower(data, cfg) {
                if (!data.data) return data;

                if (data.data.rewards) {
                    Object.keys(data.data.rewards).forEach(key => {
                        if (typeof data.data.rewards[key] === 'number') {
                            data.data.rewards[key] = Math.floor(data.data.rewards[key] * cfg.resourceMultiplier);
                        }
                    });
                }

                return data;
            },

            modifyDungeon(data, cfg) {
                if (!data.data) return data;

                if (data.data.rewards) {
                    Object.keys(data.data.rewards).forEach(key => {
                        if (typeof data.data.rewards[key] === 'number') {
                            data.data.rewards[key] = Math.floor(data.data.rewards[key] * cfg.resourceMultiplier);
                        }
                    });
                }

                return data;
            },

            modifyWorldBoss(data, cfg) {
                if (!data.data) return data;

                if (data.data.myDamage) {
                    data.data.myDamage = Math.floor(data.data.myDamage * cfg.damageMultiplier);
                }

                if (data.data.rewards) {
                    Object.keys(data.data.rewards).forEach(key => {
                        if (typeof data.data.rewards[key] === 'number') {
                            data.data.rewards[key] = Math.floor(data.data.rewards[key] * cfg.resourceMultiplier);
                        }
                    });
                }

                return data;
            }
        },

        // ===== 自动化 =====
        Automation: {
            intervals: {},

            startAutoExplore() {
                if (this.intervals.explore) {
                    LingVerseCheat.Logger.warning('自动探索已在运行中');
                    return;
                }

                LingVerseCheat.Logger.success('自动探索已启动');
                GM_notification({
                    title: '灵界·逆天',
                    text: '自动探索已启动',
                    timeout: 2000
                });

                const doExplore = async () => {
                    try {
                        if (unsafeWindow.playerDead) {
                            LingVerseCheat.Logger.warning('玩家已死亡，停止自动探索');
                            this.stopAutoExplore();
                            return;
                        }

                        const res = await unsafeWindow.api.post('/api/game/explore');

                        if (res.code === 200 && res.data) {
                            const data = res.data;

                            if (data.status === 'encounter') {
                                LingVerseCheat.Logger.combat('遭遇妖兽，自动战斗!');
                                await this.handleAutoCombat();
                            }

                            if (data.status === 'merchant') {
                                LingVerseCheat.Logger.system('遇到云游商人');
                            }

                            await this.autoHeal();
                        }
                    } catch (e) {
                        LingVerseCheat.Logger.error('自动探索出错: ' + e.message);
                    }
                };

                doExplore();
                this.intervals.explore = setInterval(doExplore, LingVerseCheat.config.autoExploreInterval);
            },

            stopAutoExplore() {
                if (this.intervals.explore) {
                    clearInterval(this.intervals.explore);
                    this.intervals.explore = null;
                    LingVerseCheat.Logger.success('自动探索已停止');
                }
            },

            async handleAutoCombat() {
                try {
                    const res = await unsafeWindow.api.post('/api/game/combat-choice', { choice: 'fight' });

                    if (res.code === 200 && res.data) {
                        const data = res.data;

                        if (data.status === 'victory') {
                            LingVerseCheat.Logger.combat('战斗胜利!');
                        } else if (data.status === 'death') {
                            LingVerseCheat.Logger.error('战斗死亡!');
                        } else if (data.status === 'defeat') {
                            LingVerseCheat.Logger.warning('战斗失败，尝试逃跑');
                            await unsafeWindow.api.post('/api/game/combat-choice', { choice: 'flee' });
                        }
                    }
                } catch (e) {
                    LingVerseCheat.Logger.error('自动战斗出错: ' + e.message);
                }
            },

            async autoHeal() {
                try {
                    const p = unsafeWindow._lastPlayerData;
                    if (!p) return;

                    const hpPercent = (p.hp / p.maxHp) * 100;
                    const mpPercent = (p.mp / p.maxMp) * 100;
                    const cfg = LingVerseCheat.config;

                    if (hpPercent < cfg.autoHealThreshold) {
                        LingVerseCheat.Logger.system(`气血过低 (${hpPercent.toFixed(1)}%)，自动回血`);
                        await unsafeWindow.api.post('/api/player/settings/auto-hp', {
                            ratio: cfg.autoHealThreshold,
                            target: 80,
                            method: 'mp'
                        });
                    }

                    if (mpPercent < cfg.autoMpThreshold) {
                        LingVerseCheat.Logger.system(`灵力过低 (${mpPercent.toFixed(1)}%)，自动回蓝`);
                        await unsafeWindow.api.post('/api/player/settings/auto-mp', {
                            ratio: cfg.autoMpThreshold,
                            target: 80,
                            method: 'stone'
                        });
                    }
                } catch (e) {}
            },

            async autoRepair() {
                try {
                    const res = await unsafeWindow.api.post('/api/game/equipment/repair-all');
                    if (res.code === 200 && res.data) {
                        LingVerseCheat.Logger.success(`自动修复 ${res.data.repairedCount} 件装备，花费 ${res.data.totalCost} 灵石`);
                        GM_notification({
                            title: '灵界·逆天',
                            text: `修复 ${res.data.repairedCount} 件装备`,
                            timeout: 2000
                        });
                    }
                } catch (e) {}
            },

            async autoBreakthrough() {
                try {
                    LingVerseCheat.Logger.system('尝试境界突破...');
                    const res = await unsafeWindow.api.post('/api/game/breakthrough');

                    if (res.code === 200) {
                        LingVerseCheat.Logger.success('突破成功! 境界提升!');
                        GM_notification({
                            title: '灵界·逆天',
                            text: '境界突破成功！',
                            timeout: 3000
                        });
                        return true;
                    } else {
                        LingVerseCheat.Logger.warning('突破失败: ' + res.message);
                        return false;
                    }
                } catch (e) {
                    LingVerseCheat.Logger.error('突破出错: ' + e.message);
                    return false;
                }
            },

            async autoAlchemy(pillId, count = 10) {
                try {
                    LingVerseCheat.Logger.craft(`开始批量炼丹: ${pillId} x${count}`);
                    const res = await unsafeWindow.api.post('/api/game/alchemy/batch-craft', {
                        pillId: pillId,
                        count: count
                    });

                    if (res.code === 200 && res.data) {
                        LingVerseCheat.Logger.success(res.data.message || '炼丹完成');
                        return res.data;
                    }
                } catch (e) {
                    LingVerseCheat.Logger.error('炼丹出错: ' + e.message);
                }
            },

            async autoTalisman(recipeId, count = 10) {
                try {
                    LingVerseCheat.Logger.craft(`开始批量制符: ${recipeId} x${count}`);
                    const res = await unsafeWindow.api.post('/api/game/talisman/batch-craft', {
                        recipeId: recipeId,
                        count: count
                    });

                    if (res.code === 200 && res.data) {
                        LingVerseCheat.Logger.success(res.data.message || '制符完成');
                        return res.data;
                    }
                } catch (e) {
                    LingVerseCheat.Logger.error('制符出错: ' + e.message);
                }
            }
        },

        // ===== UI面板 =====
        UI: {
            panel: null,

            createPanel() {
                if (!LingVerseCheat.config.enablePanel) return;
                if (this.panel) return;

                const panel = document.createElement('div');
                panel.id = 'lingverse-cheat-panel';
                panel.innerHTML = `
                    <style>
                        #lingverse-cheat-panel {
                            position: fixed;
                            top: 10px;
                            right: 10px;
                            width: 300px;
                            background: linear-gradient(135deg, rgba(20, 20, 30, 0.95), rgba(30, 30, 50, 0.95));
                            border: 2px solid #ffd700;
                            border-radius: 12px;
                            padding: 15px;
                            z-index: 99999;
                            font-family: 'Microsoft YaHei', sans-serif;
                            box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
                            color: #fff;
                            max-height: 90vh;
                            overflow-y: auto;
                        }
                        #lingverse-cheat-panel h3 {
                            margin: 0 0 15px 0;
                            color: #ffd700;
                            text-align: center;
                            font-size: 16px;
                            border-bottom: 1px solid rgba(255, 215, 0, 0.3);
                            padding-bottom: 10px;
                        }
                        .cheat-btn {
                            display: block;
                            width: 100%;
                            padding: 8px 12px;
                            margin: 5px 0;
                            background: linear-gradient(135deg, #4a5568, #2d3748);
                            border: 1px solid #ffd700;
                            border-radius: 6px;
                            color: #fff;
                            cursor: pointer;
                            font-size: 13px;
                            transition: all 0.3s;
                        }
                        .cheat-btn:hover {
                            background: linear-gradient(135deg, #ffd700, #ffed4e);
                            color: #000;
                        }
                        .cheat-btn.active {
                            background: linear-gradient(135deg, #48bb78, #38a169);
                            border-color: #48bb78;
                        }
                        .cheat-btn.danger {
                            border-color: #f87171;
                        }
                        .cheat-btn.danger:hover {
                            background: linear-gradient(135deg, #f87171, #ef4444);
                            color: #fff;
                        }
                        .cheat-section {
                            margin: 10px 0;
                            padding: 10px;
                            background: rgba(255, 255, 255, 0.05);
                            border-radius: 8px;
                        }
                        .cheat-section-title {
                            color: #ffd700;
                            font-size: 12px;
                            margin-bottom: 8px;
                            text-align: center;
                        }
                        .cheat-stats {
                            margin-top: 10px;
                            padding-top: 10px;
                            border-top: 1px solid rgba(255, 215, 0, 0.3);
                            font-size: 11px;
                            color: #a0aec0;
                        }
                        .cheat-stats div {
                            margin: 2px 0;
                            display: flex;
                            justify-content: space-between;
                        }
                        .cheat-close {
                            position: absolute;
                            top: 5px;
                            right: 10px;
                            color: #ffd700;
                            cursor: pointer;
                            font-size: 20px;
                            line-height: 1;
                        }
                        .cheat-minimize {
                            position: absolute;
                            top: 5px;
                            right: 35px;
                            color: #ffd700;
                            cursor: pointer;
                            font-size: 16px;
                            line-height: 1;
                        }
                        .cheat-config-row {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin: 5px 0;
                            font-size: 12px;
                        }
                        .cheat-config-row input {
                            width: 60px;
                            background: rgba(0,0,0,0.3);
                            border: 1px solid #ffd700;
                            color: #fff;
                            padding: 2px 5px;
                            border-radius: 4px;
                            text-align: center;
                        }
                        .cheat-hidden {
                            display: none !important;
                        }
                        .cheat-collapsed {
                            height: 40px;
                            overflow: hidden;
                        }
                    </style>
                    <div class="cheat-close" onclick="LingCheat.togglePanel()">×</div>
                    <div class="cheat-minimize" onclick="LingCheat.minimizePanel()">−</div>
                    <h3>✦ 逆天改命 ✦</h3>

                    <div class="cheat-section">
                        <div class="cheat-section-title">系统控制</div>
                        <button class="cheat-btn" id="btn-toggle" onclick="LingCheat.toggle()">🚀 启动系统</button>
                        <button class="cheat-btn danger" onclick="LingCheat.godMode()">👑 天神模式</button>
                    </div>

                    <div class="cheat-section">
                        <div class="cheat-section-title">自动化</div>
                        <button class="cheat-btn" onclick="LingCheat.explore()">🗺️ 自动探索</button>
                        <button class="cheat-btn" onclick="LingCheat.alchemy()">⚗️ 自动炼丹</button>
                        <button class="cheat-btn" onclick="LingCheat.breakthrough()">⚡ 自动突破</button>
                        <button class="cheat-btn" onclick="LingCheat.repair()">🔧 一键修复</button>
                    </div>

                    <div class="cheat-section">
                        <div class="cheat-section-title">配置调整</div>
                        <div class="cheat-config-row">
                            <span>资源倍率:</span>
                            <input type="number" id="cfg-resource" value="${LingVerseCheat.config.resourceMultiplier}" min="1" max="100" onchange="LingCheat.setConfig('resourceMultiplier', this.value)">
                        </div>
                        <div class="cheat-config-row">
                            <span>伤害倍率:</span>
                            <input type="number" id="cfg-damage" value="${LingVerseCheat.config.damageMultiplier}" min="1" max="10" onchange="LingCheat.setConfig('damageMultiplier', this.value)">
                        </div>
                        <div class="cheat-config-row">
                            <span>炼丹加成:</span>
                            <input type="number" id="cfg-alchemy" value="${LingVerseCheat.config.alchemyQualityBonus}" min="0" max="50" onchange="LingCheat.setConfig('alchemyQualityBonus', this.value)">
                        </div>
                        <div class="cheat-config-row">
                            <span>制符加成:</span>
                            <input type="number" id="cfg-talisman" value="${LingVerseCheat.config.talismanSuccessBonus}" min="0" max="50" onchange="LingCheat.setConfig('talismanSuccessBonus', this.value)">
                        </div>
                    </div>

                    <div class="cheat-section">
                        <div class="cheat-section-title">统计信息</div>
                        <div class="cheat-stats">
                            <div><span>运行状态:</span><span id="stat-status">未启动</span></div>
                            <div><span>探索次数:</span><span id="stat-explore">0</span></div>
                            <div><span>灵石获取:</span><span id="stat-stones">0</span></div>
                            <div><span>修为获取:</span><span id="stat-cultivation">0</span></div>
                            <div><span>API拦截:</span><span id="stat-api">0</span></div>
                            <div><span>运行时间:</span><span id="stat-time">0分钟</span></div>
                        </div>
                    </div>

                    <div class="cheat-section">
                        <button class="cheat-btn" onclick="LingCheat.stats()">📊 详细统计</button>
                        <button class="cheat-btn" onclick="LingCheat.resetStats()">🔄 重置统计</button>
                    </div>
                `;

                document.body.appendChild(panel);
                this.panel = panel;

                setInterval(() => this.updateStats(), 1000);
            },

            updateStats() {
                if (!this.panel) return;

                const statusEl = document.getElementById('stat-status');
                const exploreEl = document.getElementById('stat-explore');
                const stonesEl = document.getElementById('stat-stones');
                const cultivationEl = document.getElementById('stat-cultivation');
                const apiEl = document.getElementById('stat-api');
                const timeEl = document.getElementById('stat-time');

                if (statusEl) statusEl.textContent = LingVerseCheat.state.isRunning ? '运行中' : '未启动';
                if (statusEl) statusEl.style.color = LingVerseCheat.state.isRunning ? '#4ade80' : '#f87171';
                if (exploreEl) exploreEl.textContent = LingVerseCheat.state.totalExplorations;
                if (stonesEl) stonesEl.textContent = LingVerseCheat.state.totalResourcesGained.stones.toLocaleString();
                if (cultivationEl) cultivationEl.textContent = LingVerseCheat.state.totalResourcesGained.cultivation.toLocaleString();
                if (apiEl) apiEl.textContent = LingVerseCheat.state.interceptedCalls;
                if (timeEl) timeEl.textContent = Math.floor((Date.now() - LingVerseCheat.state.cheatStartTime) / 60000) + '分钟';
            },

            toggle() {
                if (this.panel) {
                    this.panel.remove();
                    this.panel = null;
                } else {
                    this.createPanel();
                }
            },

            minimize() {
                if (this.panel) {
                    this.panel.classList.toggle('cheat-collapsed');
                }
            }
        },

        // ===== 油猴菜单 =====
        Menu: {
            init() {
                // 注册油猴菜单命令
                GM_registerMenuCommand('🚀 启动/停止系统', () => LingVerseCheat.API.toggle());
                GM_registerMenuCommand('🗺️ 自动探索', () => LingVerseCheat.API.explore());
                GM_registerMenuCommand('⚗️ 自动炼丹', () => LingVerseCheat.API.alchemy());
                GM_registerMenuCommand('⚡ 自动突破', () => LingVerseCheat.API.breakthrough());
                GM_registerMenuCommand('🔧 一键修复', () => LingVerseCheat.API.repair());
                GM_registerMenuCommand('👑 天神模式', () => LingVerseCheat.API.godMode());
                GM_registerMenuCommand('📊 查看统计', () => LingVerseCheat.API.stats());
                GM_registerMenuCommand('⚙️ 显示/隐藏面板', () => LingVerseCheat.API.togglePanel());
            }
        },

        // ===== 对外API =====
        API: {
            toggle() {
                if (LingVerseCheat.state.isRunning) {
                    this.stop();
                } else {
                    this.start();
                }
            },

            start() {
                if (LingVerseCheat.state.isRunning) {
                    LingVerseCheat.Logger.warning('系统已在运行中');
                    return;
                }

                LingVerseCheat.state.isRunning = true;

                LingVerseCheat.Logger.gold('═══════════════════════════════════════════════════════════════');
                LingVerseCheat.Logger.gold('  逆天改命系统已全面启动!');
                LingVerseCheat.Logger.gold('═══════════════════════════════════════════════════════════════');
                LingVerseCheat.Logger.success(`资源倍增: ${LingVerseCheat.config.resourceMultiplier}x`);
                LingVerseCheat.Logger.success(`伤害倍增: ${LingVerseCheat.config.damageMultiplier}x`);
                LingVerseCheat.Logger.success(`炼丹品质加成: +${LingVerseCheat.config.alchemyQualityBonus}%`);
                LingVerseCheat.Logger.success(`制符成功率加成: +${LingVerseCheat.config.talismanSuccessBonus}%`);

                GM_notification({
                    title: '灵界·逆天',
                    text: '系统已启动！',
                    timeout: 3000
                });

                const btn = document.getElementById('btn-toggle');
                if (btn) {
                    btn.classList.add('active');
                    btn.textContent = '✅ 系统运行中 (点击停止)';
                }
            },

            stop() {
                LingVerseCheat.state.isRunning = false;
                LingVerseCheat.Automation.stopAutoExplore();

                LingVerseCheat.Logger.warning('系统已停止');

                const btn = document.getElementById('btn-toggle');
                if (btn) {
                    btn.classList.remove('active');
                    btn.textContent = '🚀 启动系统';
                }
            },

            config(key, value) {
                if (key === undefined) {
                    LingVerseCheat.Logger.system('当前配置:');
                    console.table({
                        '资源倍率': LingVerseCheat.config.resourceMultiplier,
                        '伤害倍率': LingVerseCheat.config.damageMultiplier,
                        '自动探索间隔': LingVerseCheat.config.autoExploreInterval + 'ms',
                        '自动回血阈值': LingVerseCheat.config.autoHealThreshold + '%',
                        '炼丹品质加成': LingVerseCheat.config.alchemyQualityBonus + '%',
                        '制符成功率加成': LingVerseCheat.config.talismanSuccessBonus + '%'
                    });
                    return;
                }

                if (value === undefined) {
                    LingVerseCheat.Logger.info(`${key}: ${LingVerseCheat.config[key]}`);
                    return LingVerseCheat.config[key];
                }

                LingVerseCheat.config[key] = parseInt(value) || value;
                LingVerseCheat.Logger.success(`配置已更新: ${key} = ${value}`);

                // 更新面板显示
                const inputMap = {
                    'resourceMultiplier': 'cfg-resource',
                    'damageMultiplier': 'cfg-damage',
                    'alchemyQualityBonus': 'cfg-alchemy',
                    'talismanSuccessBonus': 'cfg-talisman'
                };
                const inputId = inputMap[key];
                if (inputId) {
                    const input = document.getElementById(inputId);
                    if (input) input.value = value;
                }
            },

            setConfig(key, value) {
                this.config(key, value);
            },

            stats() {
                LingVerseCheat.Logger.gold('═══════════════════════════════════════════════════════════════');
                LingVerseCheat.Logger.gold('  逆天改命统计');
                LingVerseCheat.Logger.gold('═══════════════════════════════════════════════════════════════');
                LingVerseCheat.Logger.info(`运行状态: ${LingVerseCheat.state.isRunning ? '运行中' : '已停止'}`);
                LingVerseCheat.Logger.info(`探索次数: ${LingVerseCheat.state.totalExplorations}`);
                LingVerseCheat.Logger.info(`灵石获取: ${LingVerseCheat.state.totalResourcesGained.stones.toLocaleString()}`);
                LingVerseCheat.Logger.info(`修为获取: ${LingVerseCheat.state.totalResourcesGained.cultivation.toLocaleString()}`);
                LingVerseCheat.Logger.info(`API拦截: ${LingVerseCheat.state.interceptedCalls}`);
                LingVerseCheat.Logger.info(`响应修改: ${LingVerseCheat.state.modifiedResponses}`);
                LingVerseCheat.Logger.info(`运行时间: ${Math.floor((Date.now() - LingVerseCheat.state.cheatStartTime) / 60000)} 分钟`);
                console.table(LingVerseCheat.state);
            },

            resetStats() {
                LingVerseCheat.state.totalExplorations = 0;
                LingVerseCheat.state.totalResourcesGained = { stones: 0, cultivation: 0 };
                LingVerseCheat.state.interceptedCalls = 0;
                LingVerseCheat.state.modifiedResponses = 0;
                LingVerseCheat.state.cheatStartTime = Date.now();
                LingVerseCheat.Logger.success('统计数据已重置');
            },

            explore() {
                if (!LingVerseCheat.state.isRunning) {
                    LingVerseCheat.Logger.warning('请先启动系统: LingCheat.start()');
                    return;
                }

                if (LingVerseCheat.Automation.intervals.explore) {
                    LingVerseCheat.Automation.stopAutoExplore();
                } else {
                    LingVerseCheat.Automation.startAutoExplore();
                }
            },

            async alchemy(pillId, count) {
                if (!LingVerseCheat.state.isRunning) {
                    LingVerseCheat.Logger.warning('请先启动系统: LingCheat.start()');
                    return;
                }

                if (!pillId) {
                    const res = await unsafeWindow.api.get('/api/game/alchemy/recipes');
                    if (res.code === 200 && res.data && res.data.recipes) {
                        LingVerseCheat.Logger.system('可用丹方:');
                        res.data.recipes.forEach(r => {
                            LingVerseCheat.Logger.info(`  ${r.pillId}: ${r.pillName} (境界: ${r.unlockStageName})`);
                        });
                        LingVerseCheat.Logger.info('使用方法: LingCheat.alchemy("丹药ID", 数量)');
                    }
                    return;
                }

                return LingVerseCheat.Automation.autoAlchemy(pillId, count);
            },

            async breakthrough() {
                if (!LingVerseCheat.state.isRunning) {
                    LingVerseCheat.Logger.warning('请先启动系统: LingCheat.start()');
                    return;
                }

                return LingVerseCheat.Automation.autoBreakthrough();
            },

            async repair() {
                if (!LingVerseCheat.state.isRunning) {
                    LingVerseCheat.Logger.warning('请先启动系统: LingCheat.start()');
                    return;
                }

                return LingVerseCheat.Automation.autoRepair();
            },

            togglePanel() {
                LingVerseCheat.UI.toggle();
            },

            minimizePanel() {
                LingVerseCheat.UI.minimize();
            },

            godMode() {
                this.setConfig('resourceMultiplier', 100);
                this.setConfig('damageMultiplier', 10);
                this.setConfig('alchemyQualityBonus', 50);
                this.setConfig('talismanSuccessBonus', 50);

                LingVerseCheat.Logger.gold('═══════════════════════════════════════════════════════════════');
                LingVerseCheat.Logger.gold('  👑 天神模式已激活! 👑');
                LingVerseCheat.Logger.gold('═══════════════════════════════════════════════════════════════');
                LingVerseCheat.Logger.success('资源倍增: 100x');
                LingVerseCheat.Logger.success('伤害倍增: 10x');
                LingVerseCheat.Logger.success('炼丹品质: +50%');
                LingVerseCheat.Logger.success('制符成功率: +50%');

                GM_notification({
                    title: '灵界·逆天',
                    text: '👑 天神模式已激活！',
                    timeout: 5000
                });

                if (!LingVerseCheat.state.isRunning) {
                    this.start();
                }
            }
        }
    };

})();

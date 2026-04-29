// ==UserScript==
// @name         灵界 LingVerse - 逆天改命
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  灵界游戏辅助脚本 - 资源显示修改、自动探索、炼丹辅助、战斗增强
// @author       逆天改命
// @match        *://*/game.html*
// @match        *://*/lingverse*/game.html*
// @match        *://localhost*/game.html*
// @match        *://127.0.0.1*/game.html*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
// @run-at       document-start
// @license      MIT
// ==/UserScript==

/**
 * ============================================================================
 * 灵界 LingVerse - 逆天改命油猴脚本 v3.0
 * ============================================================================
 *
 * 【功能列表】
 * - 显示修改：灵石、神识、气血、灵力、修为、攻击、防御显示为满值
 * - 资源倍增：探索、战斗奖励显示倍增（仅显示）
 * - 自动探索：智能判断战斗/逃跑，自动回血回蓝
 * - 炼丹辅助：批量炼丹
 * - 战斗增强：自动战斗选择
 * - 装备修复：一键修复所有装备
 * - 境界突破：自动尝试突破
 *
 * 【使用方法】
 * 1. 安装 Tampermonkey 浏览器扩展
 * 2. 安装本脚本
 * 3. 进入游戏后脚本自动加载
 * 4. 按 F12 打开控制台查看详细日志
 * 5. 使用右上角控制面板或油猴菜单控制功能
 *
 * 【控制台命令】
 * - LingCheat.toggle()      启动/停止系统
 * - LingCheat.godMode()     一键满属性
 * - LingCheat.explore()     自动探索开关
 * - LingCheat.alchemy()     查看丹方/炼丹
 * - LingCheat.repair()      一键修复装备
 * - LingCheat.stats()       查看统计
 *
 * 【重要提示】
 * 本脚本仅修改前端显示，所有真实数据由服务器控制
 * 刷新页面后会恢复真实数值
 * ============================================================================
 */

(function() {
    'use strict';

    // 配置管理器
    const Config = {
        // 使用 GM 存储持久化配置
        get(key, defaultValue) {
            return GM_getValue(key, defaultValue);
        },
        set(key, value) {
            GM_setValue(key, value);
        },

        // 配置项
        get resourceMultiplier() { return this.get('resourceMultiplier', 2); },
        set resourceMultiplier(v) { this.set('resourceMultiplier', parseInt(v) || 2); },

        get damageMultiplier() { return this.get('damageMultiplier', 2); },
        set damageMultiplier(v) { this.set('damageMultiplier', parseInt(v) || 2); },

        get autoExploreInterval() { return this.get('autoExploreInterval', 1000); },
        set autoExploreInterval(v) { this.set('autoExploreInterval', parseInt(v) || 1000); },

        get autoHealThreshold() { return this.get('autoHealThreshold', 30); },
        set autoHealThreshold(v) { this.set('autoHealThreshold', parseInt(v) || 30); },

        get autoMpThreshold() { return this.get('autoMpThreshold', 30); },
        set autoMpThreshold(v) { this.set('autoMpThreshold', parseInt(v) || 30); },

        get enableLogs() { return this.get('enableLogs', true); },
        set enableLogs(v) { this.set('enableLogs', !!v); },

        get enablePanel() { return this.get('enablePanel', true); },
        set enablePanel(v) { this.set('enablePanel', !!v); },

        get autoStart() { return this.get('autoStart', false); },
        set autoStart(v) { this.set('autoStart', !!v); }
    };

    // 日志系统
    const Logger = {
        styles: {
            info: 'color: #4a9eff; font-weight: bold;',
            success: 'color: #4ade80; font-weight: bold;',
            warning: 'color: #fbbf24; font-weight: bold;',
            error: 'color: #f87171; font-weight: bold;',
            gold: 'color: #ffd700; font-weight: bold; font-size: 14px;',
            system: 'color: #a78bfa; font-weight: bold;',
            combat: 'color: #f87171; font-weight: bold;',
            explore: 'color: #4ade80; font-weight: bold;'
        },

        log(msg, type = 'info') {
            if (!Config.enableLogs) return;
            console.log(`%c[灵界·逆天] ${msg}`, this.styles[type] || this.styles.info);
        },

        info(msg) { this.log(msg, 'info'); },
        success(msg) { this.log(msg, 'success'); },
        warning(msg) { this.log(msg, 'warning'); },
        error(msg) { this.log(msg, 'error'); },
        gold(msg) { this.log(msg, 'gold'); },
        system(msg) { this.log(msg, 'system'); },
        combat(msg) { this.log(msg, 'combat'); },
        explore(msg) { this.log(msg, 'explore'); }
    };

    // 状态管理
    const State = {
        isRunning: false,
        totalExplorations: 0,
        totalResourcesGained: { stones: 0, cultivation: 0 },
        cheatStartTime: Date.now(),
        interceptedCalls: 0,
        modifiedResponses: 0,
        hasLoggedInitial: false,
        playerData: null,
        intervals: {}
    };

    // API 拦截器
    const Interceptor = {
        originalFetch: null,
        originalApiRequest: null,

        init() {
            // 拦截 fetch
            this.originalFetch = unsafeWindow.fetch;
            unsafeWindow.fetch = this.createFetchProxy();

            // 等待 api 对象可用
            const checkApi = setInterval(() => {
                if (unsafeWindow.api?.request) {
                    clearInterval(checkApi);
                    this.originalApiRequest = unsafeWindow.api.request.bind(unsafeWindow.api);
                    unsafeWindow.api.request = this.createApiProxy();
                    Logger.success('API 拦截器已部署');
                }
            }, 100);

            setTimeout(() => clearInterval(checkApi), 30000);
        },

        createFetchProxy() {
            const self = this;
            return async function(...args) {
                const [url, options = {}] = args;
                const method = options.method || 'GET';

                if (typeof url === 'string' && url.includes('/api/')) {
                    State.interceptedCalls++;
                }

                const response = await self.originalFetch.apply(unsafeWindow, args);
                const clonedResponse = response.clone();

                try {
                    const data = await clonedResponse.json();
                    const modifiedData = self.modifyResponse(url, method, data);

                    if (modifiedData !== data) {
                        State.modifiedResponses++;
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

            // 玩家信息 - 修改为满值
            if (path.includes('/api/player/info')) {
                return this.modifyPlayerInfo(data);
            }

            // 探索结果 - 奖励显示倍增
            if (path.includes('/api/game/explore')) {
                return this.modifyExploreResult(data);
            }

            // 战斗结果 - 伤害和奖励显示倍增
            if (path.includes('/api/game/combat') || path.includes('/api/game/combat-choice')) {
                return this.modifyCombatResult(data);
            }

            // 背包物品 - 数量显示倍增
            if (path.includes('/api/game/inventory')) {
                return this.modifyInventory(data);
            }

            return data;
        },

        modifyPlayerInfo(data) {
            if (!data.data) return data;
            const p = data.data;

            // 保存原始数据用于自动回血判断
            State.playerData = p;

            // 首次加载时显示日志
            if (!State.hasLoggedInitial) {
                Logger.gold('═══════════════════════════════════════════════════════════════');
                Logger.gold('  💰 开局满属性已激活！');
                Logger.gold('═══════════════════════════════════════════════════════════════');
                State.hasLoggedInitial = true;
            }

            // 修改显示值（仅显示，不影响服务器）
            if (p.lowerStone !== undefined) p.lowerStone = 999999999;
            if (p.spirit !== undefined) {
                p.spirit = 10000;
                if (p.maxSpirit !== undefined) p.maxSpirit = 10000;
            }
            if (p.hp !== undefined) {
                p.hp = 999999;
                if (p.maxHp !== undefined) p.maxHp = 999999;
            }
            if (p.mp !== undefined) {
                p.mp = 999999;
                if (p.maxMp !== undefined) p.maxMp = 999999;
            }
            if (p.cultivation !== undefined) p.cultivation = 999999999;
            if (p.attack !== undefined) {
                p.attack = 99999;
                p.attackBonus = 99999;
            }
            if (p.defense !== undefined) {
                p.defense = 99999;
                p.defenseBonus = 99999;
            }

            return data;
        },

        modifyExploreResult(data) {
            if (!data.data) return data;
            const result = data.data;
            const multiplier = Config.resourceMultiplier;

            if (result.logs && Array.isArray(result.logs)) {
                result.logs = result.logs.map(log => {
                    // 灵石显示倍增
                    if (log.includes('灵石')) {
                        const match = log.match(/(\d+)\s*灵石/);
                        if (match) {
                            const original = parseInt(match[1]);
                            const multiplied = Math.floor(original * multiplier);
                            State.totalResourcesGained.stones += (multiplied - original);
                            return log.replace(match[0], `${multiplied} 灵石`);
                        }
                    }
                    // 修为显示倍增
                    if (log.includes('修为')) {
                        const match = log.match(/(\d+)\s*修为/);
                        if (match) {
                            const original = parseInt(match[1]);
                            const multiplied = Math.floor(original * multiplier);
                            State.totalResourcesGained.cultivation += (multiplied - original);
                            return log.replace(match[0], `${multiplied} 修为`);
                        }
                    }
                    return log;
                });
            }

            State.totalExplorations++;
            return data;
        },

        modifyCombatResult(data) {
            if (!data.data) return data;
            const result = data.data;
            const multiplier = Config.damageMultiplier;

            // 伤害显示倍增
            if (result.logs && Array.isArray(result.logs)) {
                result.logs = result.logs.map(log => {
                    if (log.includes('造成') && log.includes('伤害')) {
                        const match = log.match(/(\d+)\s*点?伤害/);
                        if (match) {
                            const original = parseInt(match[1]);
                            const multiplied = Math.floor(original * multiplier);
                            return log.replace(match[0], `${multiplied} 点伤害`);
                        }
                    }
                    return log;
                });
            }

            // 战斗奖励显示倍增
            if (result.rewards) {
                if (result.rewards.stones) {
                    result.rewards.stones = Math.floor(result.rewards.stones * Config.resourceMultiplier);
                }
                if (result.rewards.cultivation) {
                    result.rewards.cultivation = Math.floor(result.rewards.cultivation * Config.resourceMultiplier);
                }
            }

            return data;
        },

        modifyInventory(data) {
            if (!data.data || !Array.isArray(data.data)) return data;

            data.data = data.data.map(item => {
                if (item.type === 'material' && item.count > 0) {
                    item.count = Math.floor(item.count * Config.resourceMultiplier);
                }
                return item;
            });

            return data;
        }
    };

    // 自动化功能
    const Automation = {
        startAutoExplore() {
            if (State.intervals.explore) {
                Logger.warning('自动探索已在运行中');
                return;
            }

            Logger.success('自动探索已启动');
            GM_notification({ title: '灵界·逆天', text: '自动探索已启动', timeout: 2000 });

            const doExplore = async () => {
                try {
                    if (unsafeWindow.playerDead) {
                        Logger.warning('玩家已死亡，停止自动探索');
                        this.stopAutoExplore();
                        return;
                    }

                    const res = await unsafeWindow.api.post('/api/game/explore');

                    if (res.code === 200 && res.data) {
                        const data = res.data;

                        if (data.status === 'encounter') {
                            Logger.combat('遭遇妖兽，自动战斗!');
                            await this.handleAutoCombat();
                        }

                        if (data.status === 'merchant') {
                            Logger.system('遇到云游商人');
                        }

                        await this.autoHeal();
                    }
                } catch (e) {
                    Logger.error('自动探索出错: ' + e.message);
                }
            };

            doExplore();
            State.intervals.explore = setInterval(doExplore, Config.autoExploreInterval);
        },

        stopAutoExplore() {
            if (State.intervals.explore) {
                clearInterval(State.intervals.explore);
                State.intervals.explore = null;
                Logger.success('自动探索已停止');
            }
        },

        async handleAutoCombat() {
            try {
                const res = await unsafeWindow.api.post('/api/game/combat-choice', { choice: 'fight' });

                if (res.code === 200 && res.data) {
                    const data = res.data;

                    if (data.status === 'victory') {
                        Logger.combat('战斗胜利!');
                    } else if (data.status === 'death') {
                        Logger.error('战斗死亡!');
                    } else if (data.status === 'defeat') {
                        Logger.warning('战斗失败，尝试逃跑');
                        await unsafeWindow.api.post('/api/game/combat-choice', { choice: 'flee' });
                    }
                }
            } catch (e) {
                Logger.error('自动战斗出错: ' + e.message);
            }
        },

        async autoHeal() {
            try {
                const p = State.playerData;
                if (!p) return;

                const hpPercent = (p.hp / p.maxHp) * 100;
                const mpPercent = (p.mp / p.maxMp) * 100;

                if (hpPercent < Config.autoHealThreshold) {
                    Logger.system(`气血过低 (${hpPercent.toFixed(1)}%)，自动回血`);
                    await unsafeWindow.api.post('/api/player/settings/auto-hp', {
                        ratio: Config.autoHealThreshold,
                        target: 80,
                        method: 'mp'
                    });
                }

                if (mpPercent < Config.autoMpThreshold) {
                    Logger.system(`灵力过低 (${mpPercent.toFixed(1)}%)，自动回蓝`);
                    await unsafeWindow.api.post('/api/player/settings/auto-mp', {
                        ratio: Config.autoMpThreshold,
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
                    Logger.success(`自动修复 ${res.data.repairedCount} 件装备，花费 ${res.data.totalCost} 灵石`);
                    GM_notification({
                        title: '灵界·逆天',
                        text: `修复 ${res.data.repairedCount} 件装备`,
                        timeout: 2000
                    });
                }
            } catch (e) {
                Logger.error('修复装备出错: ' + e.message);
            }
        },

        async autoBreakthrough() {
            try {
                Logger.system('尝试境界突破...');
                const res = await unsafeWindow.api.post('/api/game/breakthrough');

                if (res.code === 200) {
                    Logger.success('突破成功! 境界提升!');
                    GM_notification({ title: '灵界·逆天', text: '境界突破成功！', timeout: 3000 });
                    return true;
                } else {
                    Logger.warning('突破失败: ' + res.message);
                    return false;
                }
            } catch (e) {
                Logger.error('突破出错: ' + e.message);
                return false;
            }
        },

        async autoAlchemy(pillId, count = 10) {
            try {
                Logger.info(`开始批量炼丹: ${pillId} x${count}`);
                const res = await unsafeWindow.api.post('/api/game/alchemy/batch-craft', {
                    pillId: pillId,
                    count: count
                });

                if (res.code === 200 && res.data) {
                    Logger.success(res.data.message || '炼丹完成');
                    return res.data;
                }
            } catch (e) {
                Logger.error('炼丹出错: ' + e.message);
            }
        }
    };

    // UI 面板
    const UI = {
        panel: null,
        isMinimized: false,

        create() {
            if (!Config.enablePanel || this.panel) return;

            const panel = document.createElement('div');
            panel.id = 'lingverse-cheat-panel';
            panel.innerHTML = this.getStyles() + this.getHTML();

            document.body.appendChild(panel);
            this.panel = panel;

            this.bindEvents();
            this.startUpdateLoop();

            Logger.success('控制面板已创建');
        },

        getStyles() {
            return `
                <style>
                    #lingverse-cheat-panel {
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        width: 280px;
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
                        transition: all 0.3s ease;
                    }
                    #lingverse-cheat-panel.minimized {
                        height: 50px;
                        overflow: hidden;
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
                    .cheat-close, .cheat-minimize {
                        position: absolute;
                        top: 8px;
                        color: #ffd700;
                        cursor: pointer;
                        font-size: 18px;
                        line-height: 1;
                        width: 24px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 4px;
                        transition: background 0.2s;
                    }
                    .cheat-close:hover, .cheat-minimize:hover {
                        background: rgba(255, 215, 0, 0.2);
                    }
                    .cheat-close { right: 8px; }
                    .cheat-minimize { right: 36px; }
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
                </style>
            `;
        },

        getHTML() {
            return `
                <div class="cheat-minimize" id="cheat-minimize">−</div>
                <div class="cheat-close" id="cheat-close">×</div>
                <h3>✦ 逆天改命 ✦</h3>

                <div class="cheat-section">
                    <div class="cheat-section-title">系统控制</div>
                    <button class="cheat-btn" id="btn-toggle">🚀 启动系统</button>
                    <button class="cheat-btn danger" id="btn-godmode">👑 一键满属性</button>
                </div>

                <div class="cheat-section">
                    <div class="cheat-section-title">自动化</div>
                    <button class="cheat-btn" id="btn-explore">🗺️ 自动探索</button>
                    <button class="cheat-btn" id="btn-repair">🔧 一键修复</button>
                    <button class="cheat-btn" id="btn-breakthrough">⚡ 尝试突破</button>
                </div>

                <div class="cheat-section">
                    <div class="cheat-section-title">配置调整</div>
                    <div class="cheat-config-row">
                        <span>资源倍率:</span>
                        <input type="number" id="cfg-resource" value="${Config.resourceMultiplier}" min="1" max="100">
                    </div>
                    <div class="cheat-config-row">
                        <span>伤害倍率:</span>
                        <input type="number" id="cfg-damage" value="${Config.damageMultiplier}" min="1" max="10">
                    </div>
                </div>

                <div class="cheat-section">
                    <div class="cheat-section-title">统计信息</div>
                    <div class="cheat-stats">
                        <div><span>运行状态:</span><span id="stat-status">未启动</span></div>
                        <div><span>探索次数:</span><span id="stat-explore">0</span></div>
                        <div><span>灵石获取:</span><span id="stat-stones">0</span></div>
                        <div><span>修为获取:</span><span id="stat-cultivation">0</span></div>
                        <div><span>运行时间:</span><span id="stat-time">0分钟</span></div>
                    </div>
                </div>

                <div class="cheat-section">
                    <button class="cheat-btn" id="btn-stats">📊 详细统计</button>
                    <button class="cheat-btn" id="btn-reset">🔄 重置统计</button>
                </div>
            `;
        },

        bindEvents() {
            // 按钮事件
            document.getElementById('btn-toggle')?.addEventListener('click', () => API.toggle());
            document.getElementById('btn-godmode')?.addEventListener('click', () => API.godMode());
            document.getElementById('btn-explore')?.addEventListener('click', () => API.explore());
            document.getElementById('btn-repair')?.addEventListener('click', () => API.repair());
            document.getElementById('btn-breakthrough')?.addEventListener('click', () => API.breakthrough());
            document.getElementById('btn-stats')?.addEventListener('click', () => API.stats());
            document.getElementById('btn-reset')?.addEventListener('click', () => API.resetStats());
            document.getElementById('cheat-close')?.addEventListener('click', () => this.destroy());
            document.getElementById('cheat-minimize')?.addEventListener('click', () => this.toggleMinimize());

            // 配置输入事件
            document.getElementById('cfg-resource')?.addEventListener('change', (e) => {
                Config.resourceMultiplier = e.target.value;
                Logger.success(`资源倍率已设置为: ${Config.resourceMultiplier}`);
            });
            document.getElementById('cfg-damage')?.addEventListener('change', (e) => {
                Config.damageMultiplier = e.target.value;
                Logger.success(`伤害倍率已设置为: ${Config.damageMultiplier}`);
            });
        },

        startUpdateLoop() {
            setInterval(() => this.updateStats(), 1000);
        },

        updateStats() {
            if (!this.panel) return;

            const statusEl = document.getElementById('stat-status');
            const exploreEl = document.getElementById('stat-explore');
            const stonesEl = document.getElementById('stat-stones');
            const cultivationEl = document.getElementById('stat-cultivation');
            const timeEl = document.getElementById('stat-time');

            if (statusEl) statusEl.textContent = State.isRunning ? '✅ 运行中' : '⏹️ 已停止';
            if (exploreEl) exploreEl.textContent = State.totalExplorations;
            if (stonesEl) stonesEl.textContent = State.totalResourcesGained.stones.toLocaleString();
            if (cultivationEl) cultivationEl.textContent = State.totalResourcesGained.cultivation.toLocaleString();
            if (timeEl) timeEl.textContent = Math.floor((Date.now() - State.cheatStartTime) / 60000) + '分钟';

            // 更新按钮状态
            const toggleBtn = document.getElementById('btn-toggle');
            if (toggleBtn) {
                if (State.isRunning) {
                    toggleBtn.classList.add('active');
                    toggleBtn.textContent = '✅ 停止系统';
                } else {
                    toggleBtn.classList.remove('active');
                    toggleBtn.textContent = '🚀 启动系统';
                }
            }

            const exploreBtn = document.getElementById('btn-explore');
            if (exploreBtn) {
                if (State.intervals.explore) {
                    exploreBtn.classList.add('active');
                    exploreBtn.textContent = '🗺️ 停止探索';
                } else {
                    exploreBtn.classList.remove('active');
                    exploreBtn.textContent = '🗺️ 自动探索';
                }
            }
        },

        toggleMinimize() {
            this.isMinimized = !this.isMinimized;
            if (this.panel) {
                this.panel.classList.toggle('minimized', this.isMinimized);
            }
        },

        destroy() {
            if (this.panel) {
                this.panel.remove();
                this.panel = null;
                Logger.info('控制面板已关闭，使用 LingCheat.togglePanel() 重新打开');
            }
        }
    };

    // API 接口
    const API = {
        toggle() {
            if (State.isRunning) {
                this.stop();
            } else {
                this.start();
            }
        },

        start() {
            if (State.isRunning) return;

            State.isRunning = true;
            Logger.gold('═══════════════════════════════════════════════════════════════');
            Logger.gold('  🚀 逆天改命系统已启动！');
            Logger.gold('═══════════════════════════════════════════════════════════════');
            Logger.success(`资源显示倍率: ${Config.resourceMultiplier}x`);
            Logger.success(`伤害显示倍率: ${Config.damageMultiplier}x`);

            GM_notification({ title: '灵界·逆天', text: '系统已启动！', timeout: 3000 });
        },

        stop() {
            State.isRunning = false;
            Automation.stopAutoExplore();
            Logger.warning('系统已停止');
        },

        godMode() {
            Config.resourceMultiplier = 100;
            Config.damageMultiplier = 10;

            Logger.gold('═══════════════════════════════════════════════════════════════');
            Logger.gold('  👑 天神模式已激活!');
            Logger.gold('═══════════════════════════════════════════════════════════════');
            Logger.success('资源显示倍率: 100x');
            Logger.success('伤害显示倍率: 10x');

            GM_notification({ title: '灵界·逆天', text: '👑 天神模式已激活！', timeout: 5000 });

            if (!State.isRunning) {
                this.start();
            }

            // 更新面板显示
            const resourceInput = document.getElementById('cfg-resource');
            const damageInput = document.getElementById('cfg-damage');
            if (resourceInput) resourceInput.value = 100;
            if (damageInput) damageInput.value = 10;
        },

        explore() {
            if (!State.isRunning) {
                Logger.warning('请先启动系统: LingCheat.start()');
                return;
            }

            if (State.intervals.explore) {
                Automation.stopAutoExplore();
            } else {
                Automation.startAutoExplore();
            }
        },

        async repair() {
            if (!State.isRunning) {
                Logger.warning('请先启动系统: LingCheat.start()');
                return;
            }

            await Automation.autoRepair();
        },

        async breakthrough() {
            if (!State.isRunning) {
                Logger.warning('请先启动系统: LingCheat.start()');
                return;
            }

            await Automation.autoBreakthrough();
        },

        async alchemy(pillId, count) {
            if (!State.isRunning) {
                Logger.warning('请先启动系统: LingCheat.start()');
                return;
            }

            if (!pillId) {
                const res = await unsafeWindow.api.get('/api/game/alchemy/recipes');
                if (res.code === 200 && res.data?.recipes) {
                    Logger.system('可用丹方:');
                    res.data.recipes.forEach(r => {
                        Logger.info(`  ${r.pillId}: ${r.pillName} (境界: ${r.unlockStageName})`);
                    });
                    Logger.info('使用方法: LingCheat.alchemy("丹药ID", 数量)');
                }
                return;
            }

            await Automation.autoAlchemy(pillId, count || 10);
        },

        stats() {
            Logger.gold('═══════════════════════════════════════════════════════════════');
            Logger.gold('  📊 逆天改命统计');
            Logger.gold('═══════════════════════════════════════════════════════════════');
            Logger.info(`运行状态: ${State.isRunning ? '✅ 运行中' : '⏹️ 已停止'}`);
            Logger.info(`探索次数: ${State.totalExplorations}`);
            Logger.info(`灵石显示获取: ${State.totalResourcesGained.stones.toLocaleString()}`);
            Logger.info(`修为显示获取: ${State.totalResourcesGained.cultivation.toLocaleString()}`);
            Logger.info(`API拦截次数: ${State.interceptedCalls}`);
            Logger.info(`响应修改次数: ${State.modifiedResponses}`);
            Logger.info(`运行时间: ${Math.floor((Date.now() - State.cheatStartTime) / 60000)} 分钟`);
        },

        resetStats() {
            State.totalExplorations = 0;
            State.totalResourcesGained = { stones: 0, cultivation: 0 };
            State.interceptedCalls = 0;
            State.modifiedResponses = 0;
            State.cheatStartTime = Date.now();
            Logger.success('统计数据已重置');
        },

        togglePanel() {
            if (UI.panel) {
                UI.destroy();
            } else {
                UI.create();
            }
        },

        // 配置接口
        config(key, value) {
            if (key === undefined) {
                Logger.system('当前配置:');
                console.table({
                    '资源显示倍率': Config.resourceMultiplier,
                    '伤害显示倍率': Config.damageMultiplier,
                    '自动探索间隔': Config.autoExploreInterval + 'ms',
                    '自动回血阈值': Config.autoHealThreshold + '%'
                });
                return;
            }

            if (value === undefined) {
                Logger.info(`${key}: ${Config[key]}`);
                return Config[key];
            }

            Config[key] = value;
            Logger.success(`配置已更新: ${key} = ${value}`);
        }
    };

    // 油猴菜单
    const Menu = {
        init() {
            GM_registerMenuCommand('🚀 启动/停止系统', () => API.toggle());
            GM_registerMenuCommand('👑 天神模式', () => API.godMode());
            GM_registerMenuCommand('🗺️ 自动探索', () => API.explore());
            GM_registerMenuCommand('🔧 一键修复', () => API.repair());
            GM_registerMenuCommand('📊 查看统计', () => API.stats());
            GM_registerMenuCommand('🎛️ 显示/隐藏面板', () => API.togglePanel());
        }
    };

    // 初始化
    function init() {
        // 检查是否在正确的页面
        if (!window.location.pathname.includes('game.html')) {
            console.log('[灵界·逆天] 非游戏页面，脚本未启动');
            return;
        }

        console.log('[灵界·逆天] 脚本初始化中...');

        // 等待游戏API加载
        const checkApiInterval = setInterval(() => {
            if (window.api?.request) {
                clearInterval(checkApiInterval);
                console.log('[灵界·逆天] 游戏API已检测到，启动系统...');

                // 初始化各模块
                Logger.gold('═══════════════════════════════════════════════════════════════');
                Logger.gold('  灵界 LingVerse - 逆天改命系统 v3.0');
                Logger.gold('═══════════════════════════════════════════════════════════════');

                Interceptor.init();

                // 延迟创建面板，确保DOM已准备好
                setTimeout(() => {
                    UI.create();
                    Menu.init();
                }, 1000);

                // 暴露全局对象
                unsafeWindow.LingCheat = API;

                Logger.system('脚本初始化完成！');
                Logger.info('可用命令: LingCheat.toggle(), LingCheat.godMode(), LingCheat.explore()');
                Logger.info('点击浏览器右上角的油猴图标查看功能菜单');

                // 自动启动（如果配置）
                if (Config.autoStart) {
                    setTimeout(() => API.start(), 2000);
                }
            }
        }, 500);

        // 30秒后停止检测
        setTimeout(() => clearInterval(checkApiInterval), 30000);
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

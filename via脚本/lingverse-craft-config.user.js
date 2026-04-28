// ==UserScript==
// @name         灵界 LingVerse 炼造配置面板
// @namespace    lingverse-craft-config
// @version      1.0.0
// @description  炼造可视化配置面板：填写名字炼制、自动售卖低品装备、许愿槽锁定
// @author       You
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const _win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // ============================================================
    // 配置存储
    // ============================================================
    const CONFIG = {
        // 炼制目标（通过名字指定）
        targets: {
            alchemy: '',      // 炼丹目标名字
            forge: '',        // 炼器目标名字
            talisman: '',     // 制符目标名字
        },

        // 自动售卖设置
        autoSell: {
            enabled: false,           // 总开关
            maxRarity: 2,             // 最高售卖品阶 (1=普通,2=优良,3=稀有)
            excludeSlots: [],         // 排除部位 ['weapon', 'armor', 'accessory', 'ring']
            minEnhanceLevel: 0,       // 最低强化等级（高于此不卖）
            keepWithAffix: true,      // 保留有词条的装备
        },

        // 许愿槽锁定
        wishLock: {
            enabled: false,           // 总开关
            targetName: '',           // 目标物品名字
            targetRarity: 4,          // 目标品阶 (2=优良,3=稀有,4=史诗,5=传说)
        },

        // 通用设置
        general: {
            batchSize: 10,            // 批量制作数量
            useQuickBuy: true,        // 材料不足时补充
            maxQuickBuyCost: 5000,    // 最大补充费用
            autoStart: false,         // 页面加载自动开始
        }
    };

    // ============================================================
    // 状态
    // ============================================================
    const STATE = {
        panelOpen: false,
        running: false,
        currentMode: null,
        stats: {
            crafted: 0,
            sold: 0,
            spent: 0,
        }
    };

    // ============================================================
    // 工具函数
    // ============================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    function getApi() {
        return _win.api || window.api;
    }

    function log(msg, type = 'info') {
        const color = type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : type === 'warn' ? '#ffaa00' : '#44aaff';
        console.log(`%c[炼造配置] %c${msg}`, 'color:#888', `color:${color}`);
    }

    // ============================================================
    // 创建配置面板
    // ============================================================
    function createConfigPanel() {
        if ($('#lv-craft-config-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'lv-craft-config-panel';
        panel.style.cssText = `
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:90%;max-width:600px;max-height:90vh;
            background:linear-gradient(180deg,#0a0f1c 0%,#111827 50%,#0e1525 100%);
            border:1px solid rgba(201,153,58,0.3);border-radius:12px;
            padding:0;z-index:100001;font-size:13px;color:#e8e0d0;
            box-shadow:0 8px 32px rgba(0,0,0,0.6),0 0 40px rgba(201,153,58,0.1);
            display:none;flex-direction:column;overflow:hidden;
            font-family:KaiTi,楷体,STKaiti,"Noto Serif SC",serif;
        `;

        panel.innerHTML = `
            <!-- 头部 -->
            <div style="background:linear-gradient(90deg,rgba(201,153,58,0.2) 0%,rgba(201,153,58,0.05) 100%);padding:16px 20px;border-bottom:1px solid rgba(201,153,58,0.2);display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:20px;">🔥</span>
                    <div>
                        <div style="font-size:16px;font-weight:bold;color:#c9993a;letter-spacing:2px;">炼造工坊</div>
                        <div style="font-size:11px;color:#6a6560;">配置你的自动化炼造策略</div>
                    </div>
                </div>
                <button id="lv-craft-close" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#888;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;">×</button>
            </div>

            <!-- 内容区 -->
            <div style="padding:20px;overflow-y:auto;flex:1;">
                
                <!-- 炼制目标 -->
                <div style="margin-bottom:24px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                        <span style="color:#c9993a;font-size:14px;">◈</span>
                        <span style="font-size:14px;font-weight:bold;color:#c9993a;">炼制目标</span>
                        <span style="font-size:11px;color:#6a6560;">填写物品名称，留空则自动选择</span>
                    </div>
                    
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(61,171,151,0.2);border-radius:8px;padding:12px;">
                            <div style="font-size:12px;color:#3dab97;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                                <span>💊</span>炼丹
                            </div>
                            <input type="text" id="target-alchemy" placeholder="如: 聚气丹" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;transition:all 0.2s;">
                            <div style="font-size:10px;color:#6a6560;margin-top:6px;">输入丹药名称精确匹配</div>
                        </div>
                        
                        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(201,153,58,0.2);border-radius:8px;padding:12px;">
                            <div style="font-size:12px;color:#c9993a;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                                <span>⚔️</span>炼器
                            </div>
                            <input type="text" id="target-forge" placeholder="如: 玄铁剑" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;transition:all 0.2s;">
                            <div style="font-size:10px;color:#6a6560;margin-top:6px;">输入装备名称精确匹配</div>
                        </div>
                        
                        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(154,106,224,0.2);border-radius:8px;padding:12px;">
                            <div style="font-size:12px;color:#9a6ae0;margin-bottom:8px;display:flex;align-items:center;gap:4px;">
                                <span>📜</span>制符
                            </div>
                            <input type="text" id="target-talisman" placeholder="如: 火球符" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;transition:all 0.2s;">
                            <div style="font-size:10px;color:#6a6560;margin-top:6px;">输入符箓名称精确匹配</div>
                        </div>
                    </div>
                </div>

                <!-- 自动售卖 -->
                <div style="margin-bottom:24px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                        <span style="color:#c9993a;font-size:14px;">◈</span>
                        <span style="font-size:14px;font-weight:bold;color:#c9993a;">自动售卖</span>
                        <label style="margin-left:auto;display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="checkbox" id="autosell-enabled" style="accent-color:#c9993a;">
                            <span style="font-size:12px;color:#a8a090;">启用</span>
                        </label>
                    </div>
                    
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:16px;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                            <div>
                                <div style="font-size:11px;color:#6a6560;margin-bottom:6px;">最高售卖品阶</div>
                                <select id="autosell-maxrarity" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                                    <option value="1">普通 (白色)</option>
                                    <option value="2" selected>优良 (绿色)</option>
                                    <option value="3">稀有 (蓝色)</option>
                                </select>
                            </div>
                            <div>
                                <div style="font-size:11px;color:#6a6560;margin-bottom:6px;">最低强化等级</div>
                                <input type="number" id="autosell-minenhance" value="0" min="0" max="20" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                            </div>
                        </div>
                        
                        <div style="margin-bottom:12px;">
                            <div style="font-size:11px;color:#6a6560;margin-bottom:8px;">排除部位（多选）</div>
                            <div style="display:flex;gap:12px;flex-wrap:wrap;">
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#a8a090;">
                                    <input type="checkbox" id="autosell-exclude-weapon" value="weapon"> 武器
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#a8a090;">
                                    <input type="checkbox" id="autosell-exclude-armor" value="armor"> 防具
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#a8a090;">
                                    <input type="checkbox" id="autosell-exclude-accessory" value="accessory"> 饰品
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#a8a090;">
                                    <input type="checkbox" id="autosell-exclude-ring" value="ring"> 储物戒
                                </label>
                            </div>
                        </div>
                        
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#a8a090;">
                            <input type="checkbox" id="autosell-keepaffix" checked>
                            <span>保留带有特殊词条的装备</span>
                        </label>
                    </div>
                </div>

                <!-- 许愿槽锁定 -->
                <div style="margin-bottom:24px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                        <span style="color:#c9993a;font-size:14px;">◈</span>
                        <span style="font-size:14px;font-weight:bold;color:#c9993a;">许愿槽锁定</span>
                        <label style="margin-left:auto;display:flex;align-items:center;gap:6px;cursor:pointer;">
                            <input type="checkbox" id="wish-enabled" style="accent-color:#c9993a;">
                            <span style="font-size:12px;color:#a8a090;">启用</span>
                        </label>
                    </div>
                    
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:16px;">
                        <div style="display:flex;gap:12px;">
                            <div style="flex:1;">
                                <div style="font-size:11px;color:#6a6560;margin-bottom:6px;">目标物品</div>
                                <input type="text" id="wish-target" placeholder="输入想要锁定的物品名称" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                            </div>
                            <div style="width:120px;">
                                <div style="font-size:11px;color:#6a6560;margin-bottom:6px;">目标品阶</div>
                                <select id="wish-rarity" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                                    <option value="2">优良</option>
                                    <option value="3">稀有</option>
                                    <option value="4" selected>史诗</option>
                                    <option value="5">传说</option>
                                </select>
                            </div>
                        </div>
                        <div style="font-size:10px;color:#6a6560;margin-top:8px;">许愿槽满100%时，下次制作必定获得目标品阶</div>
                    </div>
                </div>

                <!-- 通用设置 -->
                <div style="margin-bottom:20px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                        <span style="color:#c9993a;font-size:14px;">◈</span>
                        <span style="font-size:14px;font-weight:bold;color:#c9993a;">通用设置</span>
                    </div>
                    
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
                        <div>
                            <div style="font-size:11px;color:#6a6560;margin-bottom:6px;">批量数量</div>
                            <input type="number" id="general-batch" value="10" min="1" max="50" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                        </div>
                        <div>
                            <div style="font-size:11px;color:#6a6560;margin-bottom:6px;">最大补充费用</div>
                            <input type="number" id="general-maxcost" value="5000" min="0" step="100" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                        </div>
                        <div>
                            <div style="font-size:11px;color:#6a6560;margin-bottom:6px;">自动开始</div>
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;height:36px;">
                                <input type="checkbox" id="general-autostart">
                                <span style="font-size:12px;color:#a8a090;">页面加载后自动开始</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 底部按钮 -->
            <div style="background:rgba(0,0,0,0.2);padding:16px 20px;border-top:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;">
                <div style="font-size:11px;color:#6a6560;">
                    <span id="craft-status-text">就绪</span>
                </div>
                <div style="display:flex;gap:10px;">
                    <button id="btn-save-config" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#a8a090;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px;transition:all 0.2s;">保存配置</button>
                    <button id="btn-start-craft" style="background:linear-gradient(135deg,#8a6a20 0%,#c9993a 50%,#8a6a20 100%);border:none;color:#fff;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;transition:all 0.2s;box-shadow:0 2px 8px rgba(201,153,58,0.3);">开始炼造</button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // 绑定事件
        bindPanelEvents();
    }

    // ============================================================
    // 绑定面板事件
    // ============================================================
    function bindPanelEvents() {
        // 关闭按钮
        $('#lv-craft-close').onclick = () => {
            $('#lv-craft-config-panel').style.display = 'none';
            STATE.panelOpen = false;
        };

        // 保存配置
        $('#btn-save-config').onclick = saveConfig;

        // 开始炼造
        $('#btn-start-craft').onclick = () => {
            saveConfig();
            startCrafting();
        };

        // 输入框焦点效果
        $$('input[type="text"]').forEach(input => {
            input.onfocus = () => input.style.borderColor = 'rgba(201,153,58,0.5)';
            input.onblur = () => input.style.borderColor = 'rgba(255,255,255,0.1)';
        });
    }

    // ============================================================
    // 保存/加载配置
    // ============================================================
    function saveConfig() {
        // 炼制目标
        CONFIG.targets.alchemy = $('#target-alchemy').value.trim();
        CONFIG.targets.forge = $('#target-forge').value.trim();
        CONFIG.targets.talisman = $('#target-talisman').value.trim();

        // 自动售卖
        CONFIG.autoSell.enabled = $('#autosell-enabled').checked;
        CONFIG.autoSell.maxRarity = parseInt($('#autosell-maxrarity').value);
        CONFIG.autoSell.minEnhanceLevel = parseInt($('#autosell-minenhance').value);
        CONFIG.autoSell.keepWithAffix = $('#autosell-keepaffix').checked;
        CONFIG.autoSell.excludeSlots = [];
        ['weapon','armor','accessory','ring'].forEach(slot => {
            if ($(`#autosell-exclude-${slot}`).checked) CONFIG.autoSell.excludeSlots.push(slot);
        });

        // 许愿槽
        CONFIG.wishLock.enabled = $('#wish-enabled').checked;
        CONFIG.wishLock.targetName = $('#wish-target').value.trim();
        CONFIG.wishLock.targetRarity = parseInt($('#wish-rarity').value);

        // 通用
        CONFIG.general.batchSize = parseInt($('#general-batch').value);
        CONFIG.general.maxQuickBuyCost = parseInt($('#general-maxcost').value);
        CONFIG.general.useQuickBuy = true;
        CONFIG.general.autoStart = $('#general-autostart').checked;

        localStorage.setItem('lv_craft_config_v2', JSON.stringify(CONFIG));
        log('配置已保存');
        updateStatus('配置已保存');
    }

    function loadConfig() {
        try {
            const saved = localStorage.getItem('lv_craft_config_v2');
            if (saved) Object.assign(CONFIG, JSON.parse(saved));
        } catch (e) {}

        // 填充表单
        $('#target-alchemy').value = CONFIG.targets.alchemy;
        $('#target-forge').value = CONFIG.targets.forge;
        $('#target-talisman').value = CONFIG.targets.talisman;

        $('#autosell-enabled').checked = CONFIG.autoSell.enabled;
        $('#autosell-maxrarity').value = CONFIG.autoSell.maxRarity;
        $('#autosell-minenhance').value = CONFIG.autoSell.minEnhanceLevel;
        $('#autosell-keepaffix').checked = CONFIG.autoSell.keepWithAffix;
        CONFIG.autoSell.excludeSlots.forEach(slot => {
            const cb = $(`#autosell-exclude-${slot}`);
            if (cb) cb.checked = true;
        });

        $('#wish-enabled').checked = CONFIG.wishLock.enabled;
        $('#wish-target').value = CONFIG.wishLock.targetName;
        $('#wish-rarity').value = CONFIG.wishLock.targetRarity;

        $('#general-batch').value = CONFIG.general.batchSize;
        $('#general-maxcost').value = CONFIG.general.maxQuickBuyCost;
        $('#general-autostart').checked = CONFIG.general.autoStart;
    }

    // ============================================================
    // 创建悬浮按钮
    // ============================================================
    function createFloatButton() {
        if ($('#lv-craft-float-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'lv-craft-float-btn';
        btn.innerHTML = '🔥';
        btn.style.cssText = `
            position:fixed;bottom:80px;right:20px;width:50px;height:50px;
            background:linear-gradient(135deg,#8a6a20 0%,#c9993a 50%,#8a6a20 100%);
            border:none;border-radius:50%;color:#fff;font-size:24px;
            cursor:pointer;z-index:99999;box-shadow:0 4px 16px rgba(201,153,58,0.4);
            transition:all 0.3s;display:flex;align-items:center;justify-content:center;
        `;
        btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
        btn.onmouseleave = () => btn.style.transform = 'scale(1)';
        btn.onclick = togglePanel;

        document.body.appendChild(btn);
    }

    function togglePanel() {
        const panel = $('#lv-craft-config-panel');
        if (!panel) return;

        if (STATE.panelOpen) {
            panel.style.display = 'none';
            STATE.panelOpen = false;
        } else {
            panel.style.display = 'flex';
            STATE.panelOpen = true;
            loadConfig();
        }
    }

    function updateStatus(text) {
        const el = $('#craft-status-text');
        if (el) el.textContent = text;
    }

    // ============================================================
    // 核心炼造逻辑
    // ============================================================
    async function startCrafting() {
        if (STATE.running) {
            STATE.running = false;
            updateStatus('已停止');
            $('#btn-start-craft').textContent = '开始炼造';
            return;
        }

        STATE.running = true;
        updateStatus('运行中...');
        $('#btn-start-craft').textContent = '停止炼造';

        log('开始自动化炼造');

        // 设置许愿槽
        if (CONFIG.wishLock.enabled && CONFIG.wishLock.targetName) {
            await setWishTarget();
        }

        // 开始循环
        craftLoop();
    }

    async function craftLoop() {
        while (STATE.running) {
            try {
                // 按顺序执行炼造
                if (CONFIG.targets.alchemy) {
                    await doCraftByName('alchemy', CONFIG.targets.alchemy);
                }
                if (CONFIG.targets.forge) {
                    await doCraftByName('forge', CONFIG.targets.forge);
                }
                if (CONFIG.targets.talisman) {
                    await doCraftByName('talisman', CONFIG.targets.talisman);
                }

                // 自动售卖
                if (CONFIG.autoSell.enabled) {
                    await doAutoSell();
                }

            } catch (e) {
                log(`炼造异常: ${e.message}`, 'error');
            }

            await wait(5000);
        }
    }

    // 根据名字炼制
    async function doCraftByName(type, name) {
        const api = getApi();
        const endpoint = type === 'alchemy' ? '/api/game/alchemy/recipes' :
                        type === 'forge' ? '/api/game/forge/recipes' :
                        '/api/game/talisman/recipes';

        const res = await api.get(endpoint);
        if (res.code !== 200 || !res.data) return;

        // 查找匹配的配方
        const recipes = res.data.recipes || [];
        const target = recipes.find(r => {
            const itemName = r.pillName || r.name || r.talismanName || '';
            return itemName.includes(name);
        });

        if (!target) {
            log(`未找到配方: ${name}`, 'warn');
            return;
        }

        // 检查是否可以制作
        const canCraft = target.canCraft || target.canForge;
        if (!canCraft) {
            log(`${name} 当前不可制作`, 'warn');
            return;
        }

        // 补充材料
        const needBuy = target.materials.some(m => m.have < m.need);
        if (needBuy && CONFIG.general.useQuickBuy && target.canQuickBuy) {
            if (target.quickBuyCost <= CONFIG.general.maxQuickBuyCost) {
                await api.post('/api/game/craft/quick-buy-mats', {
                    type: type,
                    id: target.pillId || target.recipeId,
                    amount: 1
                });
                STATE.stats.spent += target.quickBuyCost;
            }
        }

        // 批量制作
        const batchSize = Math.min(CONFIG.general.batchSize, 50);
        const craftEndpoint = type === 'alchemy' ? '/api/game/alchemy/batch-craft' :
                             type === 'forge' ? '/api/game/forge/batch-craft' :
                             '/api/game/talisman/batch-craft';

        const craftRes = await api.post(craftEndpoint, {
            [type === 'alchemy' ? 'pillId' : 'recipeId']: target.pillId || target.recipeId,
            count: batchSize
        });

        if (craftRes.code === 200) {
            log(`${name} 制作完成 x${batchSize}`, 'success');
            STATE.stats.crafted += batchSize;
        }
    }

    // 设置许愿槽
    async function setWishTarget() {
        const api = getApi();

        // 需要先获取当前配方列表找到targetId
        // 这里简化处理，实际应该根据名字查找
        log(`设置许愿目标: ${CONFIG.wishLock.targetName} (${['','','优良','稀有','史诗','传说'][CONFIG.wishLock.targetRarity]})`);

        // 实际API调用需要根据游戏具体实现
        // await api.post('/api/game/crafting/wish', { ... });
    }

    // 自动售卖装备
    async function doAutoSell() {
        const api = getApi();

        // 获取背包
        const res = await api.get('/api/game/inventory');
        if (res.code !== 200 || !res.data) return;

        const items = res.data.filter(item => {
            // 只卖装备
            if (!['weapon','armor','accessory','ring'].includes(item.type)) return false;

            // 品阶检查
            if (item.rarity > CONFIG.autoSell.maxRarity) return false;

            // 强化等级检查
            if ((item.enhanceLevel || 0) > CONFIG.autoSell.minEnhanceLevel) return false;

            // 排除部位检查
            if (CONFIG.autoSell.excludeSlots.includes(item.type)) return false;

            // 词条检查
            if (CONFIG.autoSell.keepWithAffix && item.affixes && item.affixes.length > 0) return false;

            return true;
        });

        if (items.length === 0) return;

        // 批量售卖
        for (const item of items.slice(0, 10)) {
            try {
                await api.post('/api/game/inventory/sell', {
                    itemId: item.id,
                    quantity: 1
                });
                STATE.stats.sold++;
            } catch (e) {}
        }

        if (items.length > 0) {
            log(`自动售卖 ${items.length} 件装备`, 'success');
        }
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        if (!document.body) {
            setTimeout(init, 500);
            return;
        }

        if (!location.href.includes('ling.muge.info')) return;

        createConfigPanel();
        createFloatButton();

        // 自动开始
        setTimeout(() => {
            try {
                const saved = localStorage.getItem('lv_craft_config_v2');
                if (saved) {
                    const cfg = JSON.parse(saved);
                    if (cfg.general && cfg.general.autoStart) {
                        loadConfig();
                        startCrafting();
                    }
                }
            } catch (e) {}
        }, 2000);

        log('炼造配置面板已加载');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

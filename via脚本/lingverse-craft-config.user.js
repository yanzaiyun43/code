// ==UserScript==
// @name         灵界 LingVerse 炼造配置面板
// @namespace    lingverse-craft-config
// @version      1.1.0
// @description  炼造自动化配置：插入炼造页面中，填写名字炼制、自动售卖、许愿锁定
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
        targets: { alchemy: '', forge: '', talisman: '' },
        autoSell: { enabled: false, maxRarity: 2, excludeSlots: [], minEnhanceLevel: 0, keepWithAffix: true },
        wishLock: { enabled: false, targetName: '', targetRarity: 4 },
        general: { batchSize: 10, useQuickBuy: true, maxQuickBuyCost: 5000, autoStart: false }
    };

    const STATE = { running: false, currentMode: null, stats: { crafted: 0, sold: 0, spent: 0 } };

    const $ = (sel) => document.querySelector(sel);
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    function getApi() { return _win.api || window.api; }
    function log(msg, type = 'info') {
        const color = type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : type === 'warn' ? '#ffaa00' : '#44aaff';
        console.log(`%c[炼造助手] %c${msg}`, 'color:#888', `color:${color}`);
    }

    // ============================================================
    // 插入炼造页面的配置面板
    // ============================================================
    function insertCraftPanel() {
        // 检查是否在炼造页面 (通过判断炉子信息卡是否存在)
        const furnaceBar = $('#alchemyFurnaceBar') || $('#forgeFurnaceBar') || $('#talismanFurnaceBar');
        if (!furnaceBar) return;

        // 避免重复插入
        if ($('#lv-craft-auto-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'lv-craft-auto-panel';
        panel.style.cssText = `
            margin:12px 16px;padding:12px 16px;
            background:linear-gradient(135deg,rgba(201,153,58,0.08) 0%,rgba(201,153,58,0.02) 100%);
            border:1px solid rgba(201,153,58,0.25);border-radius:8px;
            font-size:12px;color:#e8e0d0;
        `;

        panel.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid rgba(201,153,58,0.15);">
                <span style="font-size:16px;">🔥</span>
                <span style="font-weight:bold;color:#c9993a;letter-spacing:1px;">自动炼造</span>
                <span id="lv-craft-run-status" style="margin-left:auto;font-size:11px;color:#6a6560;">未运行</span>
            </div>

            <!-- 炼制目标 -->
            <div style="margin-bottom:12px;">
                <div style="font-size:11px;color:#6a6560;margin-bottom:6px;">炼制目标（填写名称，留空则跳过）</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <input type="text" id="lv-target-alchemy" placeholder="炼丹: 如聚气丹" style="flex:1;min-width:100px;background:rgba(0,0,0,0.3);border:1px solid rgba(61,171,151,0.3);color:#3dab97;padding:6px 10px;border-radius:6px;font-size:12px;outline:none;">
                    <input type="text" id="lv-target-forge" placeholder="炼器: 如玄铁剑" style="flex:1;min-width:100px;background:rgba(0,0,0,0.3);border:1px solid rgba(201,153,58,0.3);color:#c9993a;padding:6px 10px;border-radius:6px;font-size:12px;outline:none;">
                    <input type="text" id="lv-target-talisman" placeholder="制符: 如火球符" style="flex:1;min-width:100px;background:rgba(0,0,0,0.3);border:1px solid rgba(154,106,224,0.3);color:#9a6ae0;padding:6px 10px;border-radius:6px;font-size:12px;outline:none;">
                </div>
            </div>

            <!-- 快捷设置 -->
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#a8a090;">
                    <input type="checkbox" id="lv-autosell" style="accent-color:#c9993a;">
                    <span>自动卖装备≤</span>
                    <select id="lv-autosell-rarity" style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:2px 6px;border-radius:4px;font-size:11px;">
                        <option value="1">普通</option>
                        <option value="2" selected>优良</option>
                        <option value="3">稀有</option>
                    </select>
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#a8a090;">
                    <input type="checkbox" id="lv-wishlock" style="accent-color:#c9993a;">
                    <span>许愿锁定</span>
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#a8a090;">
                    <span>批量</span>
                    <input type="number" id="lv-batch" value="10" min="1" max="50" style="width:45px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:2px 6px;border-radius:4px;font-size:11px;">
                </label>
            </div>

            <!-- 操作按钮 -->
            <div style="display:flex;gap:10px;align-items:center;">
                <button id="lv-btn-start" style="flex:1;background:linear-gradient(135deg,#8a6a20 0%,#c9993a 50%,#8a6a20 100%);border:none;color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;transition:all 0.2s;">开始炼造</button>
                <button id="lv-btn-save" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#a8a090;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;">保存</button>
                <button id="lv-btn-once" style="background:rgba(61,171,151,0.15);border:1px solid rgba(61,171,151,0.3);color:#3dab97;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;" title="执行一次炼造">执行一次</button>
            </div>

            <!-- 日志 -->
            <div id="lv-craft-log" style="margin-top:10px;max-height:80px;overflow-y:auto;font-size:11px;color:#888;background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;display:none;"></div>
        `;

        // 插入到炉子信息卡下方
        furnaceBar.parentNode.insertBefore(panel, furnaceBar.nextSibling);

        // 绑定事件
        bindPanelEvents();
        loadConfigToPanel();
    }

    function bindPanelEvents() {
        $('#lv-btn-start').onclick = () => {
            if (STATE.running) {
                stopCrafting();
            } else {
                saveConfigFromPanel();
                startCrafting();
            }
        };
        $('#lv-btn-save').onclick = () => { saveConfigFromPanel(); log('配置已保存'); };
        $('#lv-btn-once').onclick = () => { saveConfigFromPanel(); doCraftOnce(); };
    }

    // ============================================================
    // 配置读写
    // ============================================================
    function saveConfigFromPanel() {
        CONFIG.targets.alchemy = $('#lv-target-alchemy').value.trim();
        CONFIG.targets.forge = $('#lv-target-forge').value.trim();
        CONFIG.targets.talisman = $('#lv-target-talisman').value.trim();
        CONFIG.autoSell.enabled = $('#lv-autosell').checked;
        CONFIG.autoSell.maxRarity = parseInt($('#lv-autosell-rarity').value);
        CONFIG.wishLock.enabled = $('#lv-wishlock').checked;
        CONFIG.general.batchSize = parseInt($('#lv-batch').value) || 10;
        localStorage.setItem('lv_craft_config_v3', JSON.stringify(CONFIG));
    }

    function loadConfigToPanel() {
        try {
            const saved = localStorage.getItem('lv_craft_config_v3');
            if (saved) Object.assign(CONFIG, JSON.parse(saved));
        } catch (e) {}
        $('#lv-target-alchemy').value = CONFIG.targets.alchemy;
        $('#lv-target-forge').value = CONFIG.targets.forge;
        $('#lv-target-talisman').value = CONFIG.targets.talisman;
        $('#lv-autosell').checked = CONFIG.autoSell.enabled;
        $('#lv-autosell-rarity').value = CONFIG.autoSell.maxRarity;
        $('#lv-wishlock').checked = CONFIG.wishLock.enabled;
        $('#lv-batch').value = CONFIG.general.batchSize;
    }

    // ============================================================
    // 日志显示
    // ============================================================
    function appendLog(msg, type = 'info') {
        const logPanel = $('#lv-craft-log');
        if (!logPanel) return;
        logPanel.style.display = 'block';
        const item = document.createElement('div');
        const color = type === 'error' ? '#ff6666' : type === 'success' ? '#66ff66' : '#aaa';
        item.style.cssText = `color:${color};padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05);`;
        const time = new Date().toLocaleTimeString('zh-CN', {hour12:false});
        item.textContent = `[${time}] ${msg}`;
        logPanel.insertBefore(item, logPanel.firstChild);
        while (logPanel.children.length > 20) logPanel.removeChild(logPanel.lastChild);
    }

    // ============================================================
    // 核心炼造逻辑
    // ============================================================
    async function startCrafting() {
        if (STATE.running) return;
        STATE.running = true;
        $('#lv-btn-start').textContent = '停止炼造';
        $('#lv-btn-start').style.background = 'linear-gradient(135deg,#8a2020 0%,#c93030 50%,#8a2020 100%)';
        updateStatus('运行中...', '#66ff66');
        log('自动炼造已启动');
        craftLoop();
    }

    function stopCrafting() {
        STATE.running = false;
        $('#lv-btn-start').textContent = '开始炼造';
        $('#lv-btn-start').style.background = 'linear-gradient(135deg,#8a6a20 0%,#c9993a 50%,#8a6a20 100%)';
        updateStatus('已停止', '#ff6666');
        log('自动炼造已停止');
    }

    function updateStatus(text, color) {
        const el = $('#lv-craft-run-status');
        if (el) { el.textContent = text; el.style.color = color; }
    }

    async function craftLoop() {
        while (STATE.running) {
            await doCraftOnce();
            if (STATE.running) await wait(3000);
        }
    }

    async function doCraftOnce() {
        const api = getApi();

        // 炼丹
        if (CONFIG.targets.alchemy) {
            await craftByName(api, 'alchemy', CONFIG.targets.alchemy, '/api/game/alchemy/recipes', '/api/game/alchemy/batch-craft', 'pillId');
        }
        // 炼器
        if (CONFIG.targets.forge) {
            await craftByName(api, 'forge', CONFIG.targets.forge, '/api/game/forge/recipes', '/api/game/forge/batch-craft', 'recipeId');
        }
        // 制符
        if (CONFIG.targets.talisman) {
            await craftByName(api, 'talisman', CONFIG.targets.talisman, '/api/game/talisman/recipes', '/api/game/talisman/batch-craft', 'recipeId');
        }
        // 自动售卖
        if (CONFIG.autoSell.enabled) {
            await doAutoSell(api);
        }
    }

    async function craftByName(api, type, name, listEndpoint, craftEndpoint, idField) {
        try {
            const res = await api.get(listEndpoint);
            if (res.code !== 200 || !res.data) return;

            const recipes = res.data.recipes || [];
            const target = recipes.find(r => {
                const itemName = r.pillName || r.name || r.talismanName || '';
                return itemName.includes(name);
            });

            if (!target) {
                appendLog(`未找到: ${name}`, 'warn');
                return;
            }

            const canCraft = target.canCraft || target.canForge;
            if (!canCraft) {
                appendLog(`${name} 不可制作`, 'warn');
                return;
            }

            // 补充材料
            const needBuy = target.materials && target.materials.some(m => m.have < m.need);
            if (needBuy && CONFIG.general.useQuickBuy && target.canQuickBuy) {
                if (target.quickBuyCost <= CONFIG.general.maxQuickBuyCost) {
                    await api.post('/api/game/craft/quick-buy-mats', {
                        type: type,
                        id: target.pillId || target.recipeId,
                        amount: 1
                    });
                    STATE.stats.spent += target.quickBuyCost;
                } else {
                    appendLog(`补充费用过高(${target.quickBuyCost})`, 'warn');
                    return;
                }
            }

            // 批量制作
            const batchSize = Math.min(CONFIG.general.batchSize, 50);
            const craftRes = await api.post(craftEndpoint, {
                [idField]: target.pillId || target.recipeId,
                count: batchSize
            });

            if (craftRes.code === 200) {
                appendLog(`${name} x${batchSize} 成功`, 'success');
                STATE.stats.crafted += batchSize;
            } else {
                appendLog(`${name} 失败: ${craftRes.message}`, 'error');
            }
        } catch (e) {
            appendLog(`${name} 异常: ${e.message}`, 'error');
        }
    }

    async function doAutoSell(api) {
        try {
            const res = await api.get('/api/game/inventory');
            if (res.code !== 200 || !res.data) return;

            const items = res.data.filter(item => {
                if (!['weapon','armor','accessory','ring'].includes(item.type)) return false;
                if (item.rarity > CONFIG.autoSell.maxRarity) return false;
                if ((item.enhanceLevel || 0) > CONFIG.autoSell.minEnhanceLevel) return false;
                if (CONFIG.autoSell.excludeSlots.includes(item.type)) return false;
                if (CONFIG.autoSell.keepWithAffix && item.affixes && item.affixes.length > 0) return false;
                return true;
            });

            if (items.length === 0) return;

            let sold = 0;
            for (const item of items.slice(0, 10)) {
                try {
                    await api.post('/api/game/inventory/sell', { itemId: item.id, quantity: 1 });
                    sold++;
                } catch (e) {}
            }

            if (sold > 0) {
                appendLog(`自动售卖 ${sold} 件装备`, 'success');
                STATE.stats.sold += sold;
            }
        } catch (e) {}
    }

    // ============================================================
    // 初始化 - 监听炼造页面打开
    // ============================================================
    function init() {
        if (!location.href.includes('ling.muge.info')) return;

        // 监听页面变化，当炼造页面打开时插入面板
        const observer = new MutationObserver(() => {
            const furnaceBar = $('#alchemyFurnaceBar') || $('#forgeFurnaceBar') || $('#talismanFurnaceBar');
            if (furnaceBar && !$('#lv-craft-auto-panel')) {
                insertCraftPanel();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // 初始检查
        setTimeout(() => {
            const furnaceBar = $('#alchemyFurnaceBar') || $('#forgeFurnaceBar') || $('#talismanFurnaceBar');
            if (furnaceBar) insertCraftPanel();
        }, 1000);

        log('炼造助手已加载，点击炼丹/炼器/制符即可看到配置面板');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

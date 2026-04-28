// ==UserScript==
// @name         灵界 LingVerse 炼造配置面板
// @namespace    lingverse-craft-config
// @version      1.4.0
// @description  炼造自动化配置：下拉选择物品，自动售卖丹药/装备/符箓
// @author       You
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const _win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    const CONFIG = {
        targets: { alchemy: '', forge: '', talisman: '' },
        autoSell: {
            pills: { enabled: false, maxRarity: 2 },
            equipment: { enabled: false, maxRarity: 2, excludeSlots: [], minEnhanceLevel: 0, keepWithAffix: true },
            talismans: { enabled: false, maxRarity: 2 },
        },
        wishLock: { enabled: false, targetName: '', targetRarity: 4 },
        general: { batchSize: 10, useQuickBuy: true, maxQuickBuyCost: 5000, autoStart: false }
    };

    const CACHE = {
        alchemy: [],
        forge: [],
        talisman: []
    };

    const STATE = { running: false, panelOpen: false, stats: { crafted: 0, soldPills: 0, soldEquip: 0, soldTalismans: 0, spent: 0 } };

    const $ = (sel) => document.querySelector(sel);
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    function getApi() { return _win.api || window.api; }
    function log(msg, type = 'info') {
        const color = type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : type === 'warn' ? '#ffaa00' : '#44aaff';
        console.log(`%c[炼造助手] %c${msg}`, 'color:#888', `color:${color}`);
    }

    // ============================================================
    // 创建浮动按钮
    // ============================================================
    function createFloatButton() {
        if ($('#lv-craft-float-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'lv-craft-float-btn';
        btn.innerHTML = '🔥';
        btn.style.cssText = `
            position:fixed;bottom:100px;right:15px;width:48px;height:48px;z-index:99999;
            background:linear-gradient(135deg,#8a6a20 0%,#c9993a 50%,#8a6a20 100%);
            border:none;border-radius:50%;color:#fff;font-size:22px;
            cursor:pointer;box-shadow:0 4px 16px rgba(201,153,58,0.4);
            transition:transform 0.2s,box-shadow 0.2s;
            display:flex;align-items:center;justify-content:center;
            -webkit-tap-highlight-color:transparent;touch-action:manipulation;
        `;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePanel();
        });

        btn.addEventListener('touchstart', (e) => { btn.style.transform = 'scale(0.95)'; }, {passive: true});
        btn.addEventListener('touchend', (e) => { btn.style.transform = 'scale(1)'; }, {passive: true});

        document.body.appendChild(btn);
    }

    // ============================================================
    // 获取配方列表
    // ============================================================
    async function loadRecipes() {
        const api = getApi();
        try {
            const [alchemyRes, forgeRes, talismanRes] = await Promise.all([
                api.get('/api/game/alchemy/recipes'),
                api.get('/api/game/forge/recipes'),
                api.get('/api/game/talisman/recipes')
            ]);

            if (alchemyRes.code === 200 && alchemyRes.data) {
                CACHE.alchemy = alchemyRes.data.recipes || [];
            }
            if (forgeRes.code === 200 && forgeRes.data) {
                CACHE.forge = forgeRes.data.recipes || [];
            }
            if (talismanRes.code === 200 && talismanRes.data) {
                CACHE.talisman = talismanRes.data.recipes || [];
            }
        } catch (e) {
            log('加载配方列表失败', 'error');
        }
    }

    // ============================================================
    // 创建配置面板
    // ============================================================
    async function createPanel() {
        if ($('#lv-craft-panel')) return;

        // 先加载配方
        await loadRecipes();

        const panel = document.createElement('div');
        panel.id = 'lv-craft-panel';
        panel.style.cssText = `
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            width:92%;max-width:400px;max-height:85vh;z-index:100000;
            background:linear-gradient(180deg,#0d1320 0%,#151d2e 100%);
            border:1px solid rgba(201,153,58,0.4);border-radius:12px;
            font-size:12px;color:#e8e0d0;box-shadow:0 8px 32px rgba(0,0,0,0.8);
            display:none;flex-direction:column;overflow:hidden;
            font-family:KaiTi,楷体,STKaiti,"Noto Serif SC",serif;
        `;

        // 生成下拉选项
        const alchemyOptions = generateOptions(CACHE.alchemy, 'pillName');
        const forgeOptions = generateOptions(CACHE.forge, 'name');
        const talismanOptions = generateOptions(CACHE.talisman, 'talismanName');

        panel.innerHTML = `
            <!-- 标题栏 -->
            <div id="lv-panel-header" style="background:linear-gradient(90deg,rgba(201,153,58,0.25) 0%,rgba(201,153,58,0.1) 100%);padding:12px 16px;border-bottom:1px solid rgba(201,153,58,0.2);display:flex;justify-content:space-between;align-items:center;cursor:move;-webkit-user-select:none;user-select:none;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:18px;">🔥</span>
                    <span style="font-weight:bold;color:#c9993a;letter-spacing:1px;">自动炼造</span>
                    <span id="lv-craft-run-status" style="margin-left:8px;font-size:10px;color:#6a6560;background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;">未运行</span>
                </div>
                <button id="lv-panel-close" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#888;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;">×</button>
            </div>

            <!-- 内容区 -->
            <div style="padding:14px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch;">
                
                <!-- 炼丹 -->
                <div style="margin-bottom:12px;">
                    <div style="font-size:11px;color:#3dab97;margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                        <span>💊</span>炼丹目标
                    </div>
                    <select id="lv-target-alchemy" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(61,171,151,0.4);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                        <option value="">-- 不自动炼丹 --</option>
                        ${alchemyOptions}
                    </select>
                </div>

                <!-- 炼器 -->
                <div style="margin-bottom:12px;">
                    <div style="font-size:11px;color:#c9993a;margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                        <span>⚔️</span>炼器目标
                    </div>
                    <select id="lv-target-forge" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(201,153,58,0.4);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                        <option value="">-- 不自动炼器 --</option>
                        ${forgeOptions}
                    </select>
                </div>

                <!-- 制符 -->
                <div style="margin-bottom:14px;">
                    <div style="font-size:11px;color:#9a6ae0;margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                        <span>📜</span>制符目标
                    </div>
                    <select id="lv-target-talisman" style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(154,106,224,0.4);color:#e8e0d0;padding:8px 10px;border-radius:6px;font-size:12px;outline:none;">
                        <option value="">-- 不自动制符 --</option>
                        ${talismanOptions}
                    </select>
                </div>

                <!-- 刷新按钮 -->
                <div style="margin-bottom:14px;text-align:center;">
                    <button id="lv-btn-refresh" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#888;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:11px;-webkit-tap-highlight-color:transparent;">🔄 刷新配方列表</button>
                </div>

                <!-- 自动售卖 -->
                <div style="margin-bottom:14px;padding:10px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
                    <div style="font-size:11px;color:#6a6560;margin-bottom:8px;">自动售卖（勾选启用）</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#a8a090;">
                            <input type="checkbox" id="lv-autosell-pills" style="accent-color:#3dab97;width:16px;height:16px;">
                            <span style="color:#3dab97;">💊 卖丹药 ≤</span>
                            <select id="lv-autosell-pills-rarity" style="flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:4px 8px;border-radius:4px;font-size:11px;">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#a8a090;">
                            <input type="checkbox" id="lv-autosell-equip" style="accent-color:#c9993a;width:16px;height:16px;">
                            <span style="color:#c9993a;">⚔️ 卖装备 ≤</span>
                            <select id="lv-autosell-equip-rarity" style="flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:4px 8px;border-radius:4px;font-size:11px;">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:#a8a090;">
                            <input type="checkbox" id="lv-autosell-talismans" style="accent-color:#9a6ae0;width:16px;height:16px;">
                            <span style="color:#9a6ae0;">📜 卖符箓 ≤</span>
                            <select id="lv-autosell-talismans-rarity" style="flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:4px 8px;border-radius:4px;font-size:11px;">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>
                    </div>
                </div>

                <!-- 其他设置 -->
                <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:#a8a090;flex:1;">
                        <input type="checkbox" id="lv-wishlock" style="accent-color:#c9993a;width:16px;height:16px;">
                        <span>许愿锁定</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#a8a090;">
                        <span>批量</span>
                        <input type="number" id="lv-batch" value="10" min="1" max="50" style="width:50px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:#e8e0d0;padding:4px 8px;border-radius:4px;font-size:11px;">
                    </label>
                </div>

                <!-- 操作按钮 -->
                <div style="display:flex;gap:10px;">
                    <button id="lv-btn-start" style="flex:1;background:linear-gradient(135deg,#8a6a20 0%,#c9993a 50%,#8a6a20 100%);border:none;color:#fff;padding:10px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;-webkit-tap-highlight-color:transparent;">开始炼造</button>
                    <button id="lv-btn-save" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#a8a090;padding:10px 16px;border-radius:6px;cursor:pointer;font-size:12px;-webkit-tap-highlight-color:transparent;">保存</button>
                    <button id="lv-btn-once" style="background:rgba(61,171,151,0.15);border:1px solid rgba(61,171,151,0.3);color:#3dab97;padding:10px 16px;border-radius:6px;cursor:pointer;font-size:12px;-webkit-tap-highlight-color:transparent;">执行</button>
                </div>

                <!-- 日志 -->
                <div id="lv-craft-log" style="margin-top:12px;max-height:100px;overflow-y:auto;font-size:11px;color:#888;background:rgba(0,0,0,0.25);padding:8px;border-radius:6px;display:none;-webkit-overflow-scrolling:touch;"></div>
            </div>
        `;

        document.body.appendChild(panel);
        bindPanelEvents();
        loadConfigToPanel();
        makePanelDraggable();
    }

    function generateOptions(recipes, nameField) {
        if (!recipes || recipes.length === 0) {
            return '<option value="">暂无可用配方</option>';
        }

        // 按分类分组
        const groups = {};
        recipes.forEach(r => {
            const category = r.category || r.type || '其他';
            if (!groups[category]) groups[category] = [];
            groups[category].push(r);
        });

        let html = '';
        for (const [category, items] of Object.entries(groups)) {
            html += `<optgroup label="${getCategoryName(category)}">`;
            items.forEach(r => {
                const name = r[nameField] || r.name || '未知';
                const canCraft = r.canCraft || r.canForge ? '' : ' [未解锁]';
                html += `<option value="${name}">${name}${canCraft}</option>`;
            });
            html += '</optgroup>';
        }
        return html;
    }

    function getCategoryName(cat) {
        const map = {
            'cultivation': '修为丹', 'heal_hp': '回血丹', 'heal_mp': '回灵丹',
            'breakthrough': '突破丹', 'special': '特殊丹',
            'weapon': '武器', 'armor': '防具', 'accessory': '饰品', 'ring': '储物戒',
            'combat': '战斗符', 'support': '辅助符', 'special': '特殊符'
        };
        return map[cat] || cat;
    }

    // ============================================================
    // 刷新配方列表
    // ============================================================
    async function refreshRecipes() {
        const btn = $('#lv-btn-refresh');
        if (btn) btn.textContent = '🔄 加载中...';

        await loadRecipes();

        // 更新下拉框
        const alchemySelect = $('#lv-target-alchemy');
        const forgeSelect = $('#lv-target-forge');
        const talismanSelect = $('#lv-target-talisman');

        if (alchemySelect) {
            const current = alchemySelect.value;
            alchemySelect.innerHTML = '<option value="">-- 不自动炼丹 --</option>' + generateOptions(CACHE.alchemy, 'pillName');
            alchemySelect.value = current;
        }
        if (forgeSelect) {
            const current = forgeSelect.value;
            forgeSelect.innerHTML = '<option value="">-- 不自动炼器 --</option>' + generateOptions(CACHE.forge, 'name');
            forgeSelect.value = current;
        }
        if (talismanSelect) {
            const current = talismanSelect.value;
            talismanSelect.innerHTML = '<option value="">-- 不自动制符 --</option>' + generateOptions(CACHE.talisman, 'talismanName');
            talismanSelect.value = current;
        }

        if (btn) btn.textContent = '🔄 刷新配方列表';
        log('配方列表已刷新');
    }

    // ============================================================
    // 面板拖拽
    // ============================================================
    function makePanelDraggable() {
        const panel = $('#lv-craft-panel');
        const header = $('#lv-panel-header');
        if (!panel || !header) return;

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const onStart = (e) => {
            isDragging = true;
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            panel.style.transform = 'none';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';
        };

        const onMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            panel.style.left = (startLeft + dx) + 'px';
            panel.style.top = (startTop + dy) + 'px';
        };

        const onEnd = () => { isDragging = false; };

        header.addEventListener('mousedown', onStart);
        header.addEventListener('touchstart', onStart, {passive: true});
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, {passive: false});
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }

    // ============================================================
    // 面板开关
    // ============================================================
    async function togglePanel() {
        const panel = $('#lv-craft-panel');
        if (!panel) {
            await createPanel();
            togglePanel();
            return;
        }

        if (STATE.panelOpen) {
            panel.style.display = 'none';
            STATE.panelOpen = false;
        } else {
            panel.style.display = 'flex';
            STATE.panelOpen = true;
            loadConfigToPanel();
        }
    }

    // ============================================================
    // 事件绑定
    // ============================================================
    function bindPanelEvents() {
        $('#lv-panel-close').onclick = () => {
            $('#lv-craft-panel').style.display = 'none';
            STATE.panelOpen = false;
        };

        $('#lv-btn-refresh').onclick = refreshRecipes;

        $('#lv-btn-start').onclick = () => {
            if (STATE.running) {
                stopCrafting();
            } else {
                saveConfigFromPanel();
                startCrafting();
            }
        };

        $('#lv-btn-save').onclick = () => {
            saveConfigFromPanel();
            log('配置已保存');
        };

        $('#lv-btn-once').onclick = () => {
            saveConfigFromPanel();
            doCraftOnce();
        };
    }

    // ============================================================
    // 配置读写
    // ============================================================
    function saveConfigFromPanel() {
        const alchemySelect = $('#lv-target-alchemy');
        const forgeSelect = $('#lv-target-forge');
        const talismanSelect = $('#lv-target-talisman');

        CONFIG.targets.alchemy = alchemySelect ? alchemySelect.value : '';
        CONFIG.targets.forge = forgeSelect ? forgeSelect.value : '';
        CONFIG.targets.talisman = talismanSelect ? talismanSelect.value : '';

        CONFIG.autoSell.pills.enabled = $('#lv-autosell-pills').checked;
        CONFIG.autoSell.pills.maxRarity = parseInt($('#lv-autosell-pills-rarity').value);

        CONFIG.autoSell.equipment.enabled = $('#lv-autosell-equip').checked;
        CONFIG.autoSell.equipment.maxRarity = parseInt($('#lv-autosell-equip-rarity').value);

        CONFIG.autoSell.talismans.enabled = $('#lv-autosell-talismans').checked;
        CONFIG.autoSell.talismans.maxRarity = parseInt($('#lv-autosell-talismans-rarity').value);

        CONFIG.wishLock.enabled = $('#lv-wishlock').checked;
        CONFIG.general.batchSize = parseInt($('#lv-batch').value) || 10;
        localStorage.setItem('lv_craft_config_v6', JSON.stringify(CONFIG));
    }

    function loadConfigToPanel() {
        try {
            const saved = localStorage.getItem('lv_craft_config_v6');
            if (saved) Object.assign(CONFIG, JSON.parse(saved));
        } catch (e) {}

        const alchemySelect = $('#lv-target-alchemy');
        const forgeSelect = $('#lv-target-forge');
        const talismanSelect = $('#lv-target-talisman');

        if (alchemySelect) alchemySelect.value = CONFIG.targets.alchemy;
        if (forgeSelect) forgeSelect.value = CONFIG.targets.forge;
        if (talismanSelect) talismanSelect.value = CONFIG.targets.talisman;

        if ($('#lv-autosell-pills')) $('#lv-autosell-pills').checked = CONFIG.autoSell.pills.enabled;
        if ($('#lv-autosell-pills-rarity')) $('#lv-autosell-pills-rarity').value = CONFIG.autoSell.pills.maxRarity;

        if ($('#lv-autosell-equip')) $('#lv-autosell-equip').checked = CONFIG.autoSell.equipment.enabled;
        if ($('#lv-autosell-equip-rarity')) $('#lv-autosell-equip-rarity').value = CONFIG.autoSell.equipment.maxRarity;

        if ($('#lv-autosell-talismans')) $('#lv-autosell-talismans').checked = CONFIG.autoSell.talismans.enabled;
        if ($('#lv-autosell-talismans-rarity')) $('#lv-autosell-talismans-rarity').value = CONFIG.autoSell.talismans.maxRarity;

        if ($('#lv-wishlock')) $('#lv-wishlock').checked = CONFIG.wishLock.enabled;
        if ($('#lv-batch')) $('#lv-batch').value = CONFIG.general.batchSize;
    }

    // ============================================================
    // 日志
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

    function updateStatus(text, color) {
        const el = $('#lv-craft-run-status');
        if (el) { el.textContent = text; el.style.color = color; }
    }

    // ============================================================
    // 炼造逻辑
    // ============================================================
    async function startCrafting() {
        if (STATE.running) return;
        STATE.running = true;
        $('#lv-btn-start').textContent = '停止';
        $('#lv-btn-start').style.background = 'linear-gradient(135deg,#8a2020 0%,#c93030 50%,#8a2020 100%)';
        updateStatus('运行中', '#66ff66');
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

    async function craftLoop() {
        while (STATE.running) {
            await doCraftOnce();
            if (STATE.running) await wait(3000);
        }
    }

    async function doCraftOnce() {
        const api = getApi();

        if (CONFIG.targets.alchemy) {
            await craftByName(api, 'alchemy', CONFIG.targets.alchemy, '/api/game/alchemy/recipes', '/api/game/alchemy/batch-craft', 'pillId');
        }
        if (CONFIG.targets.forge) {
            await craftByName(api, 'forge', CONFIG.targets.forge, '/api/game/forge/recipes', '/api/game/forge/batch-craft', 'recipeId');
        }
        if (CONFIG.targets.talisman) {
            await craftByName(api, 'talisman', CONFIG.targets.talisman, '/api/game/talisman/recipes', '/api/game/talisman/batch-craft', 'recipeId');
        }

        if (CONFIG.autoSell.pills.enabled) await doAutoSellPills(api);
        if (CONFIG.autoSell.equipment.enabled) await doAutoSellEquipment(api);
        if (CONFIG.autoSell.talismans.enabled) await doAutoSellTalismans(api);
    }

    async function craftByName(api, type, name, listEndpoint, craftEndpoint, idField) {
        try {
            const res = await api.get(listEndpoint);
            if (res.code !== 200 || !res.data) return;

            const recipes = res.data.recipes || [];
            const target = recipes.find(r => {
                const itemName = r.pillName || r.name || r.talismanName || '';
                return itemName === name;
            });

            if (!target) { appendLog(`未找到: ${name}`, 'warn'); return; }

            const canCraft = target.canCraft || target.canForge;
            if (!canCraft) { appendLog(`${name} 不可制作`, 'warn'); return; }

            const needBuy = target.materials && target.materials.some(m => m.have < m.need);
            if (needBuy && CONFIG.general.useQuickBuy && target.canQuickBuy) {
                if (target.quickBuyCost <= CONFIG.general.maxQuickBuyCost) {
                    await api.post('/api/game/craft/quick-buy-mats', { type: type, id: target.pillId || target.recipeId, amount: 1 });
                    STATE.stats.spent += target.quickBuyCost;
                } else { appendLog(`补充费用过高(${target.quickBuyCost})`, 'warn'); return; }
            }

            const batchSize = Math.min(CONFIG.general.batchSize, 50);
            const craftRes = await api.post(craftEndpoint, { [idField]: target.pillId || target.recipeId, count: batchSize });

            if (craftRes.code === 200) {
                appendLog(`${name} x${batchSize} 成功`, 'success');
                STATE.stats.crafted += batchSize;
            } else { appendLog(`${name} 失败: ${craftRes.message}`, 'error'); }
        } catch (e) { appendLog(`${name} 异常: ${e.message}`, 'error'); }
    }

    async function doAutoSellPills(api) {
        try {
            const res = await api.get('/api/game/inventory');
            if (res.code !== 200 || !res.data) return;
            const items = res.data.filter(item => item.type === 'pill' && item.rarity <= CONFIG.autoSell.pills.maxRarity);
            if (items.length === 0) return;
            let sold = 0;
            for (const item of items.slice(0, 20)) {
                try { await api.post('/api/game/inventory/sell', { itemId: item.id, quantity: item.quantity || 1 }); sold += item.quantity || 1; } catch (e) {}
            }
            if (sold > 0) { appendLog(`自动售卖 ${sold} 个丹药`, 'success'); STATE.stats.soldPills += sold; }
        } catch (e) {}
    }

    async function doAutoSellEquipment(api) {
        try {
            const res = await api.get('/api/game/inventory');
            if (res.code !== 200 || !res.data) return;
            const items = res.data.filter(item => {
                if (!['weapon','armor','accessory','ring'].includes(item.type)) return false;
                if (item.rarity > CONFIG.autoSell.equipment.maxRarity) return false;
                if ((item.enhanceLevel || 0) > CONFIG.autoSell.equipment.minEnhanceLevel) return false;
                if (CONFIG.autoSell.equipment.excludeSlots.includes(item.type)) return false;
                if (CONFIG.autoSell.equipment.keepWithAffix && item.affixes && item.affixes.length > 0) return false;
                return true;
            });
            if (items.length === 0) return;
            let sold = 0;
            for (const item of items.slice(0, 10)) {
                try { await api.post('/api/game/inventory/sell', { itemId: item.id, quantity: 1 }); sold++; } catch (e) {}
            }
            if (sold > 0) { appendLog(`自动售卖 ${sold} 件装备`, 'success'); STATE.stats.soldEquip += sold; }
        } catch (e) {}
    }

    async function doAutoSellTalismans(api) {
        try {
            const res = await api.get('/api/game/inventory');
            if (res.code !== 200 || !res.data) return;
            const items = res.data.filter(item => item.type === 'talisman' && item.rarity <= CONFIG.autoSell.talismans.maxRarity);
            if (items.length === 0) return;
            let sold = 0;
            for (const item of items.slice(0, 20)) {
                try { await api.post('/api/game/inventory/sell', { itemId: item.id, quantity: item.quantity || 1 }); sold += item.quantity || 1; } catch (e) {}
            }
            if (sold > 0) { appendLog(`自动售卖 ${sold} 张符箓`, 'success'); STATE.stats.soldTalismans += sold; }
        } catch (e) {}
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        if (!location.href.includes('ling.muge.info')) return;
        createFloatButton();
        log('炼造助手已加载，点击右下角 🔥 按钮打开配置面板');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

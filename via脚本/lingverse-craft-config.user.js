// ==UserScript==
// @name         灵界 LingVerse 炼造配置面板
// @namespace    lingverse-craft-config
// @version      1.4.2
// @description  炼造自动化配置：下拉选择物品，自动售卖丹药/装备/符，修复配方加载和面板样式
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

    function getApi() {
        // 尝试多种方式获取 API 对象
        if (_win.api) return _win.api;
        if (window.api) return window.api;
        // 如果 api 是 const 定义的，可能在全局作用域
        if (typeof api !== 'undefined') return api;
        return null;
    }
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
        if (!api) {
            log('API 未就绪，稍后重试', 'warn');
            return;
        }

        try {
            // 尝试多种可能的 API 路径
            const endpoints = {
                alchemy: ['/api/game/alchemy/recipes', '/api/alchemy/recipes', '/api/craft/alchemy/recipes'],
                forge: ['/api/game/forge/recipes', '/api/forge/recipes', '/api/craft/forge/recipes'],
                talisman: ['/api/game/talisman/recipes', '/api/talisman/recipes', '/api/craft/talisman/recipes']
            };

            // 尝试获取炼丹配方
            for (const endpoint of endpoints.alchemy) {
                try {
                    const res = await api.get(endpoint);
                    if (res && (res.code === 200 || res.success) && res.data) {
                        CACHE.alchemy = res.data.recipes || res.data.list || res.data || [];
                        log(`炼丹配方加载成功: ${CACHE.alchemy.length}个`, 'success');
                        break;
                    }
                } catch (e) {}
            }

            // 尝试获取炼器配方
            for (const endpoint of endpoints.forge) {
                try {
                    const res = await api.get(endpoint);
                    if (res && (res.code === 200 || res.success) && res.data) {
                        CACHE.forge = res.data.recipes || res.data.list || res.data || [];
                        log(`炼器配方加载成功: ${CACHE.forge.length}个`, 'success');
                        break;
                    }
                } catch (e) {}
            }

            // 尝试获取制符配方
            for (const endpoint of endpoints.talisman) {
                try {
                    const res = await api.get(endpoint);
                    if (res && (res.code === 200 || res.success) && res.data) {
                        CACHE.talisman = res.data.recipes || res.data.list || res.data || [];
                        log(`制符配方加载成功: ${CACHE.talisman.length}个`, 'success');
                        break;
                    }
                } catch (e) {}
            }

            // 如果都为空，尝试从页面数据获取
            if (CACHE.alchemy.length === 0 && _win.craftData && _win.craftData.alchemy) {
                CACHE.alchemy = _win.craftData.alchemy.recipes || [];
            }
            if (CACHE.forge.length === 0 && _win.craftData && _win.craftData.forge) {
                CACHE.forge = _win.craftData.forge.recipes || [];
            }
            if (CACHE.talisman.length === 0 && _win.craftData && _win.craftData.talisman) {
                CACHE.talisman = _win.craftData.talisman.recipes || [];
            }

        } catch (e) {
            log('加载配方列表失败: ' + e.message, 'error');
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
            background:linear-gradient(180deg,#f5f0e6 0%,#ebe5d8 100%);
            border:2px solid #c9993a;border-radius:12px;
            font-size:12px;color:#3a3228;box-shadow:0 8px 32px rgba(0,0,0,0.4);
            display:none;flex-direction:column;overflow:hidden;
            font-family:KaiTi,楷体,STKaiti,"Noto Serif SC",serif;
        `;

        // 生成下拉选项
        const alchemyOptions = generateOptions(CACHE.alchemy, 'pillName', 'alchemy');
        const forgeOptions = generateOptions(CACHE.forge, 'name', 'forge');
        const talismanOptions = generateOptions(CACHE.talisman, 'name', 'talisman');

        panel.innerHTML = `
            <!-- 标题栏 -->
            <div id="lv-panel-header" style="background:linear-gradient(90deg,#c9993a 0%,#d4a84a 50%,#c9993a 100%);padding:12px 16px;border-bottom:2px solid #b88a2e;display:flex;justify-content:space-between;align-items:center;cursor:move;-webkit-user-select:none;user-select:none;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:18px;">🔥</span>
                    <span style="font-weight:bold;color:#fff;text-shadow:1px 1px 2px rgba(0,0,0,0.3);letter-spacing:1px;">自动炼造</span>
                    <span id="lv-craft-run-status" style="margin-left:8px;font-size:10px;color:#5a4a30;background:rgba(255,255,255,0.9);padding:2px 8px;border-radius:4px;font-weight:bold;">未运行</span>
                </div>
                <button id="lv-panel-close" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;text-shadow:1px 1px 2px rgba(0,0,0,0.3);">×</button>
            </div>

            <!-- 内容区 -->
            <div style="padding:14px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch;">
                
                <!-- 炼丹 -->
                <div style="margin-bottom:12px;">
                    <div style="font-size:11px;color:#2a8a7a;margin-bottom:4px;display:flex;align-items:center;gap:4px;font-weight:bold;">
                        <span>💊</span>炼丹目标
                    </div>
                    <select id="lv-target-alchemy" style="width:100%;background:#fff;border:2px solid #3dab97;color:#3a3228;padding:10px 12px;border-radius:6px;font-size:13px;outline:none;box-shadow:inset 0 1px 3px rgba(0,0,0,0.1);">
                        <option value="">-- 不自动炼丹 --</option>
                        ${alchemyOptions}
                    </select>
                </div>

                <!-- 炼器 -->
                <div style="margin-bottom:12px;">
                    <div style="font-size:11px;color:#b88a2e;margin-bottom:4px;display:flex;align-items:center;gap:4px;font-weight:bold;">
                        <span>⚔️</span>炼器目标
                    </div>
                    <select id="lv-target-forge" style="width:100%;background:#fff;border:2px solid #c9993a;color:#3a3228;padding:10px 12px;border-radius:6px;font-size:13px;outline:none;box-shadow:inset 0 1px 3px rgba(0,0,0,0.1);">
                        <option value="">-- 不自动炼器 --</option>
                        ${forgeOptions}
                    </select>
                </div>

                <!-- 制符 -->
                <div style="margin-bottom:14px;">
                    <div style="font-size:11px;color:#7a4ab0;margin-bottom:4px;display:flex;align-items:center;gap:4px;font-weight:bold;">
                        <span>📜</span>制符目标
                    </div>
                    <select id="lv-target-talisman" style="width:100%;background:#fff;border:2px solid #9a6ae0;color:#3a3228;padding:10px 12px;border-radius:6px;font-size:13px;outline:none;box-shadow:inset 0 1px 3px rgba(0,0,0,0.1);">
                        <option value="">-- 不自动制符 --</option>
                        ${talismanOptions}
                    </select>
                </div>

                <!-- 刷新按钮 -->
                <div style="margin-bottom:14px;text-align:center;">
                    <button id="lv-btn-refresh" style="background:linear-gradient(135deg,#f0ebe0 0%,#e8e0d0 100%);border:2px solid #c9993a;color:#8a6a20;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;-webkit-tap-highlight-color:transparent;box-shadow:0 2px 4px rgba(0,0,0,0.1);">🔄 刷新配方列表</button>
                </div>

                <!-- 自动售卖 -->
                <div style="margin-bottom:14px;padding:12px;background:#fff;border-radius:8px;border:2px solid #d4c8b0;box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                    <div style="font-size:12px;color:#8a7a60;margin-bottom:10px;font-weight:bold;">自动售卖（勾选启用）</div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#5a4a30;">
                            <input type="checkbox" id="lv-autosell-pills" style="accent-color:#3dab97;width:18px;height:18px;">
                            <span style="color:#2a8a7a;font-weight:bold;">💊 卖丹药 ≤</span>
                            <select id="lv-autosell-pills-rarity" style="flex:1;background:#f5f0e6;border:1px solid #d4c8b0;color:#3a3228;padding:6px 10px;border-radius:4px;font-size:12px;">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#5a4a30;">
                            <input type="checkbox" id="lv-autosell-equip" style="accent-color:#c9993a;width:18px;height:18px;">
                            <span style="color:#b88a2e;font-weight:bold;">⚔️ 卖装备 ≤</span>
                            <select id="lv-autosell-equip-rarity" style="flex:1;background:#f5f0e6;border:1px solid #d4c8b0;color:#3a3228;padding:6px 10px;border-radius:4px;font-size:12px;">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#5a4a30;">
                            <input type="checkbox" id="lv-autosell-talismans" style="accent-color:#9a6ae0;width:18px;height:18px;">
                            <span style="color:#7a4ab0;font-weight:bold;">📜 卖符箓 ≤</span>
                            <select id="lv-autosell-talismans-rarity" style="flex:1;background:#f5f0e6;border:1px solid #d4c8b0;color:#3a3228;padding:6px 10px;border-radius:4px;font-size:12px;">
                                <option value="1">普通</option>
                                <option value="2" selected>优良</option>
                                <option value="3">稀有</option>
                            </select>
                        </label>
                    </div>
                </div>

                <!-- 其他设置 -->
                <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;padding:10px;background:#fff;border-radius:6px;border:1px solid #d4c8b0;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:#5a4a30;flex:1;">
                        <input type="checkbox" id="lv-wishlock" style="accent-color:#c9993a;width:18px;height:18px;">
                        <span style="font-weight:bold;">许愿锁定</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#5a4a30;">
                        <span style="font-weight:bold;">批量</span>
                        <input type="number" id="lv-batch" value="10" min="1" max="50" style="width:55px;background:#f5f0e6;border:1px solid #d4c8b0;color:#3a3228;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:bold;">
                    </label>
                </div>

                <!-- 操作按钮 -->
                <div style="display:flex;gap:10px;">
                    <button id="lv-btn-start" style="flex:1;background:linear-gradient(135deg,#c9993a 0%,#d4a84a 50%,#c9993a 100%);border:none;color:#fff;padding:12px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;-webkit-tap-highlight-color:transparent;box-shadow:0 3px 8px rgba(201,153,58,0.4);text-shadow:1px 1px 2px rgba(0,0,0,0.2);">开始炼造</button>
                    <button id="lv-btn-save" style="background:linear-gradient(135deg,#e8e0d0 0%,#f5f0e6 100%);border:2px solid #c9993a;color:#8a6a20;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;-webkit-tap-highlight-color:transparent;">保存</button>
                    <button id="lv-btn-once" style="background:linear-gradient(135deg,#e0f0e8 0%,#d0e8e0 100%);border:2px solid #3dab97;color:#2a8a7a;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;-webkit-tap-highlight-color:transparent;">执行</button>
                </div>

                <!-- 日志 -->
                <div id="lv-craft-log" style="margin-top:12px;max-height:100px;overflow-y:auto;font-size:11px;color:#5a4a30;background:#fff;border:1px solid #d4c8b0;padding:10px;border-radius:6px;display:none;-webkit-overflow-scrolling:touch;box-shadow:inset 0 1px 3px rgba(0,0,0,0.1);"></div>
            </div>
        `;

        document.body.appendChild(panel);
        bindPanelEvents();
        loadConfigToPanel();
        makePanelDraggable();
    }

    function generateOptions(recipes, nameField, type) {
        if (!recipes || recipes.length === 0) {
            return '<option value="">暂无可用配方</option>';
        }

        // 按分类分组
        const groups = {};
        recipes.forEach(r => {
            // 炼丹用 category，炼器用 slot，制符用 category
            const category = r.category || r.slot || r.type || '其他';
            if (!groups[category]) groups[category] = [];
            groups[category].push(r);
        });

        let html = '';
        for (const [category, items] of Object.entries(groups)) {
            html += `<optgroup label="${getCategoryName(category)}">`;
            items.forEach(r => {
                const name = r[nameField] || r.name || '未知';
                // 判断状态：可炼制 / 可补充 / 未解锁
                const canCraft = r.canCraft || r.canForge;
                let status = '';
                if (canCraft) {
                    status = '';
                } else if (r.canQuickBuy) {
                    status = ` [可补充${r.quickBuyCost}灵石]`;
                } else if (r.disableReason === 'stage_low') {
                    status = ' [境界不足]';
                } else if (r.disableReason === 'furnace_low') {
                    status = ' [炉子等级不足]';
                } else if (r.disableReason === 'need_furnace') {
                    status = ' [需炼丹炉]';
                } else if (r.disableReason === 'no_mp') {
                    status = ' [灵力不足]';
                } else {
                    status = ' [未解锁]';
                }
                html += `<option value="${name}">${name}${status}</option>`;
            });
            html += '</optgroup>';
        }
        return html;
    }

    function getCategoryName(cat) {
        const map = {
            // 炼丹分类
            'HEAL_HP': '回血丹药', 'HEAL_MP': '回灵丹药', 'HEAL_SPIRIT': '回神识丹药',
            'BREAKTHROUGH': '突破丹药',
            'COMBAT_ATK': '战斗丹(攻)', 'COMBAT_DEF': '战斗丹(防)',
            'SPECIAL_ANTIDOTE': '解毒丹', 'SPECIAL_PERMANENT_HP': '永久HP丹',
            'SPECIAL_PERMANENT_ATK': '永久攻击丹', 'SPECIAL_MEDITATION': '清心丹',
            'SPECIAL_FIVE_ROOT': '五行通灵丹',
            'ENCOUNTER_BOOST': '招妖丹药', 'ENCOUNTER_REPEL': '避妖丹药',
            'INCARNATION_CULTIVATION': '化身修为丹药',
            'PET_HEAL_HP': '灵兽回血丹', 'PET_HEAL_MP': '灵兽回灵丹', 'PET_HEAL_BOTH': '灵兽双补丹',
            // 炼器分类
            'WEAPON': '武器', 'ARMOR': '防具', 'ACCESSORY': '饰品', 'RING': '储物戒',
            // 制符分类
            'ATTACK': '攻伐符箓', 'DEFENSE': '防御符箓', 'UTILITY': '功能符箓',
            // 其他
            '秘传图纸': '秘传图纸'
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
            alchemySelect.innerHTML = '<option value="">-- 不自动炼丹 --</option>' + generateOptions(CACHE.alchemy, 'pillName', 'alchemy');
            alchemySelect.value = current;
        }
        if (forgeSelect) {
            const current = forgeSelect.value;
            forgeSelect.innerHTML = '<option value="">-- 不自动炼器 --</option>' + generateOptions(CACHE.forge, 'name', 'forge');
            forgeSelect.value = current;
        }
        if (talismanSelect) {
            const current = talismanSelect.value;
            talismanSelect.innerHTML = '<option value="">-- 不自动制符 --</option>' + generateOptions(CACHE.talisman, 'name', 'talisman');
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
                // 炼丹用 pillName，炼器/制符用 name
                const itemName = r.pillName || r.name || '';
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
    // 诊断功能
    // ============================================================
    function diagnoseApi() {
        const api = getApi();
        log('=== API 诊断 ===', 'info');
        log(`_win.api: ${_win.api ? '存在' : '不存在'}`, 'info');
        log(`window.api: ${window.api ? '存在' : '不存在'}`, 'info');
        log(`typeof api: ${typeof api}`, 'info');
        log(`getApi() 结果: ${api ? '成功' : '失败'}`, api ? 'success' : 'error');
        return api;
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        if (!location.href.includes('ling.muge.info')) return;
        createFloatButton();
        log('炼造助手已加载，点击右下角 🔥 按钮打开配置面板');

        // 延迟预加载配方（确保游戏API已就绪）
        setTimeout(async () => {
            // 先诊断 API
            const api = diagnoseApi();
            if (!api) {
                log('API 对象未找到！请确保已登录游戏', 'error');
                return;
            }
            await loadRecipes();
            if (CACHE.alchemy.length > 0 || CACHE.forge.length > 0 || CACHE.talisman.length > 0) {
                log(`预加载完成: 炼丹${CACHE.alchemy.length}个, 炼器${CACHE.forge.length}个, 制符${CACHE.talisman.length}个`, 'success');
            } else {
                log('配方预加载失败，请打开面板后点击刷新', 'warn');
            }
        }, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

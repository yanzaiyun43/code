// ==UserScript==
// @name         页面标签查看器
// @description  点击按钮查看当前页面上所有HTML标签及其数量。
// @version      1.1
// @author       AI Assistant
// @match        *://*/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 使用 GM_addStyle 添加样式，避免污染页面
    GM_addStyle(`
        /* 查看标签按钮的样式 */
        .via-tag-viewer-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 99999;
            padding: 10px 15px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-family: sans-serif;
        }
        .via-tag-viewer-btn:hover {
            background-color: #0056b3;
        }

        /* 结果显示覆盖层的样式 */
        .via-tag-viewer-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 100000;
            display: none; /* 默认隐藏 */
            justify-content: center;
            align-items: center;
        }

        /* 结果面板的样式 */
        .via-tag-viewer-panel {
            background-color: #ffffff;
            padding: 20px 25px;
            border-radius: 8px;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            font-family: system-ui, sans-serif;
        }

        .via-tag-viewer-panel h3 {
            margin-top: 0;
            text-align: center;
            color: #333;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
        }

        /* 标签列表的样式 */
        .via-tag-viewer-list {
            list-style: none;
            padding: 0;
            margin: 15px 0;
        }
        .via-tag-viewer-list li {
            padding: 8px 12px;
            margin-bottom: 5px;
            background-color: #f8f9fa;
            border-radius: 4px;
            font-family: 'Courier New', Courier, monospace; /* 使用等宽字体，更清晰 */
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .via-tag-viewer-list li:hover {
            background-color: #e9ecef;
        }
        .via-tag-viewer-list .tag-name {
            font-weight: bold;
            color: #495057;
        }
        .via-tag-viewer-list .tag-count {
            color: #6c757d;
            background-color: #dee2e6;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.9em;
        }

        /* 关闭按钮的样式 */
        .via-tag-viewer-close-btn {
            display: block;
            width: 100%;
            padding: 10px;
            margin-top: 15px;
            border: 1px solid #ccc;
            background-color: #f1f1f1;
            color: #333;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .via-tag-viewer-close-btn:hover {
            background-color: #e2e2e2;
        }
    `);

    // 1. 创建“查看标签”按钮
    const showTagsBtn = document.createElement('button');
    showTagsBtn.innerText = '查看标签';
    showTagsBtn.className = 'via-tag-viewer-btn';
    document.body.appendChild(showTagsBtn);

    // 2. 创建用于显示结果的覆盖层和面板
    const overlay = document.createElement('div');
    overlay.className = 'via-tag-viewer-overlay';
    overlay.innerHTML = `
        <div class="via-tag-viewer-panel">
            <h3>页面标签统计</h3>
            <ul class="via-tag-viewer-list"></ul>
            <button class="via-tag-viewer-close-btn">关闭</button>
        </div>
    `;
    document.body.appendChild(overlay);

    // 获取需要操作的元素
    const listContainer = overlay.querySelector('.via-tag-viewer-list');
    const closeBtn = overlay.querySelector('.via-tag-viewer-close-btn');

    // 3. 为“查看标签”按钮添加点击事件
    showTagsBtn.addEventListener('click', () => {
        // 清空上一次的结果
        listContainer.innerHTML = '';

        // 获取页面上所有元素并统计标签
        const allElements = document.getElementsByTagName('*');
        const tagCounts = {};

        for (const element of allElements) {
            const tagName = element.tagName; // 获取标签名，如 'DIV', 'P', 'A'
            tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
        }

        // 对标签名进行排序，让结果更整洁
        const sortedTags = Object.keys(tagCounts).sort();

        // 将统计结果渲染到列表中
        for (const tag of sortedTags) {
            const li = document.createElement('li');
            li.innerHTML = `<span class="tag-name">&lt;${tag.toLowerCase()}&gt;</span><span class="tag-count">${tagCounts[tag]}</span>`;
            listContainer.appendChild(li);
        }

        // 显示覆盖层
        overlay.style.display = 'flex';
    });

    // 4. 为“关闭”按钮添加点击事件
    const closeOverlay = () => {
        overlay.style.display = 'none';
    };

    closeBtn.addEventListener('click', closeOverlay);

    // 点击覆盖层的背景也可以关闭
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeOverlay();
        }
    });

})();
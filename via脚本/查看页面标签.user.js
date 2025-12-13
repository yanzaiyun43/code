// ==UserScript==
// @name         页面标签详细查看器 (点击展开)
// @description  点击右上角按钮查看标签摘要，再点击摘要查看详细信息。初始只显示10个示例，可点击加载更多。
// @version      2.4
// @author       AI Assistant
// @match        *://*/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 使用 GM_addStyle 添加样式，避免污染页面
    GM_addStyle(`
        /* 查看标签按钮的样式 - 右上角 */
        .via-tag-viewer-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            padding: 10px 15px;
            background-color: #17a2b8;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-family: sans-serif;
        }
        .via-tag-viewer-btn:hover {
            background-color: #138496;
        }

        /* 结果显示覆盖层的样式 */
        .via-tag-viewer-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 100000;
            display: none;
            justify-content: center;
            align-items: flex-start;
            padding-top: 20px;
        }

        /* 结果面板的样式 */
        .via-tag-viewer-panel {
            background-color: #ffffff;
            padding: 20px 25px;
            border-radius: 8px;
            max-width: 90%;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 5px 25px rgba(0,0,0,0.4);
            font-family: system-ui, sans-serif;
        }
        .via-tag-viewer-panel h3 {
            margin-top: 0;
            text-align: center;
            color: #333;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
        }

        /* 标签组列表的样式 */
        .via-tag-viewer-list {
            list-style: none;
            padding: 0;
            margin: 15px 0;
        }
        .via-tag-viewer-list > li {
            margin-bottom: 10px;
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            overflow: hidden;
        }

        /* 标签组标题的样式 */
        .tag-group-title {
            margin: 0;
            padding: 12px 15px;
            background-color: #e9ecef;
            color: #495057;
            font-family: 'Courier New', Courier, monospace;
            font-size: 1.1em;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
        }
        .tag-group-title:hover {
            background-color: #dee2e6;
        }
        /* 展开图标 */
        .expand-icon {
            display: inline-block;
            margin-right: 10px;
            transition: transform 0.2s ease-in-out;
            font-size: 0.8em;
        }
        .via-tag-viewer-list > li.expanded .expand-icon {
            transform: rotate(90deg);
        }

        /* 标签示例子列表的样式 - 默认隐藏 */
        .tag-example-list {
            list-style: none;
            padding: 0;
            margin: 0;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.4s ease-out, padding 0.4s ease-out;
        }
        /* 展开时显示 */
        .via-tag-viewer-list > li.expanded .tag-example-list {
            max-height: 1000px; /* 增加最大高度以容纳更多内容 */
            padding: 10px 0;
            overflow-y: auto;
        }

        .tag-example-list li {
            padding: 8px 20px;
            border-top: 1px dashed #ced4da;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.9em;
            color: #343a40;
            word-break: break-all;
            white-space: pre-wrap;
        }
        .tag-example-list li:first-child {
            border-top: none;
        }
        .tag-example-list li:hover {
            background-color: #f1f3f5;
        }

        /* 加载更多按钮的样式 */
        .via-tag-viewer-load-more-btn {
            display: block;
            width: calc(100% - 40px); /* 留出与li相同的padding */
            margin: 10px 20px;
            padding: 8px;
            border: 1px solid #007bff;
            background-color: #f8f9fa;
            color: #007bff;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            text-align: center;
        }
        .via-tag-viewer-load-more-btn:hover {
            background-color: #e2e6ea;
        }

        /* 关闭按钮的样式 */
        .via-tag-viewer-close-btn {
            display: block;
            width: 100%;
            padding: 12px;
            margin-top: 20px;
            border: 1px solid #ccc;
            background-color: #f1f1f1;
            color: #333;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
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
            <h3>页面标签详细统计</h3>
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
        listContainer.innerHTML = '';

        const allElements = document.getElementsByTagName('*');
        const tagGroups = {};
        for (const element of allElements) {
            const tagName = element.tagName;
            if (!tagGroups[tagName]) {
                tagGroups[tagName] = [];
            }
            tagGroups[tagName].push(element);
        }

        const sortedTags = Object.keys(tagGroups).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        // --- 修改点：按需加载逻辑 ---
        const initialLoadCount = 10; // 初始显示数量

        for (const tag of sortedTags) {
            const elements = tagGroups[tag];
            const groupLi = document.createElement('li');

            const title = document.createElement('h4');
            title.className = 'tag-group-title';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'expand-icon';
            iconSpan.textContent = '▶';

            const textSpan = document.createElement('span');
            textSpan.textContent = `<${tag.toLowerCase()}> (${elements.length})`;

            title.appendChild(iconSpan);
            title.appendChild(textSpan);

            const exampleList = document.createElement('ul');
            exampleList.className = 'tag-example-list';

            // 初始加载
            const initialExamples = elements.slice(0, initialLoadCount);
            initialExamples.forEach(element => {
                const exampleLi = document.createElement('li');
                const clone = element.cloneNode(false);
                ['onload', 'onerror', 'onclick', 'onmouseover'].forEach(attr => clone.removeAttribute(attr));
                exampleLi.textContent = clone.outerHTML.replace(/></g, '>\n<');
                exampleList.appendChild(exampleLi);
            });

            // 如果数量超过初始加载数，则创建“加载更多”按钮
            if (elements.length > initialLoadCount) {
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.className = 'via-tag-viewer-load-more-btn';
                loadMoreBtn.textContent = `加载更多 (剩余 ${elements.length - initialLoadCount} 个)`;

                loadMoreBtn.addEventListener('click', () => {
                    // 加载剩余的元素
                    const remainingExamples = elements.slice(initialLoadCount);
                    remainingExamples.forEach(element => {
                        const exampleLi = document.createElement('li');
                        const clone = element.cloneNode(false);
                        ['onload', 'onerror', 'onclick', 'onmouseover'].forEach(attr => clone.removeAttribute(attr));
                        exampleLi.textContent = clone.outerHTML.replace(/></g, '>\n<');
                        exampleList.appendChild(exampleLi);
                    });
                    // 移除“加载更多”按钮
                    loadMoreBtn.remove();
                });
                exampleList.appendChild(loadMoreBtn);
            }

            groupLi.appendChild(title);
            groupLi.appendChild(exampleList);
            listContainer.appendChild(groupLi);

            // 为每个标题添加点击事件来展开/收起
            title.addEventListener('click', () => {
                const allItems = listContainer.querySelectorAll('li');
                allItems.forEach(item => {
                    if (item !== groupLi && item.classList.contains('expanded')) {
                        item.classList.remove('expanded');
                    }
                });
                groupLi.classList.toggle('expanded');
            });
        }
        // --- 修改结束 ---

        overlay.style.display = 'flex';
    });

    // 4. 为“关闭”按钮添加点击事件
    const closeOverlay = () => {
        overlay.style.display = 'none';
    };

    closeBtn.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeOverlay();
        }
    });

})();
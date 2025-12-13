// ==UserScript==
// @name         页面标签详细查看器 (点击展开)
// @description  点击右上角按钮查看标签摘要，再点击摘要查看详细信息。
// @version      2.1
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
            background-color: #17a2b8; /* 换个颜色以示区分 */
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
            max-height: 500px; /* 设置一个足够大的值 */
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
        // 清空上一次的结果
        listContainer.innerHTML = '';

        // 获取页面上所有元素并按标签名分组
        const allElements = document.getElementsByTagName('*');
        const tagGroups = {};

        for (const element of allElements) {
            const tagName = element.tagName;
            if (!tagGroups[tagName]) {
                tagGroups[tagName] = [];
            }
            tagGroups[tagName].push(element);
        }

        // 对标签名进行排序
        const sortedTags = Object.keys(tagGroups).sort();

        // 将统计结果渲染到列表中
        for (const tag of sortedTags) {
            const elements = tagGroups[tag];

            // 创建标签组的主容器
            const groupLi = document.createElement('li');

            // 创建标签组标题 (例如: <div> (50))
            const title = document.createElement('h4');
            title.className = 'tag-group-title';
            title.innerHTML = `<span class="expand-icon">▶</span><span><${tag.toLowerCase()}> (${elements.length})</span>`;
            
            // 创建用于存放示例的子列表
            const exampleList = document.createElement('ul');
            exampleList.className = 'tag-example-list';

            // 最多显示5个示例
            const maxExamples = 5;
            const examplesToShow = elements.slice(0, maxExamples);

            for (const element of examplesToShow) {
                const exampleLi = document.createElement('li');
                const clone = element.cloneNode(false);
                ['onload', 'onerror', 'onclick', 'onmouseover'].forEach(attr => clone.removeAttribute(attr));
                exampleLi.textContent = clone.outerHTML.replace(/></g, '>\n<');
                exampleList.appendChild(exampleLi);
            }

            if (elements.length > maxExamples) {
                const moreLi = document.createElement('li');
                moreLi.style.fontStyle = 'italic';
                moreLi.style.color = '#6c757d';
                moreLi.textContent = `... 还有 ${elements.length - maxExamples} 个`;
                exampleList.appendChild(moreLi);
            }

            groupLi.appendChild(title);
            groupLi.appendChild(exampleList);
            listContainer.appendChild(groupLi);

            // 为每个标题添加点击事件来展开/收起
            title.addEventListener('click', () => {
                // 手风琴效果：关闭其他所有已展开的项
                const allItems = listContainer.querySelectorAll('li');
                allItems.forEach(item => {
                    if (item !== groupLi && item.classList.contains('expanded')) {
                        item.classList.remove('expanded');
                    }
                });
                // 切换当前项的展开状态
                groupLi.classList.toggle('expanded');
            });
        }

        // 显示覆盖层
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
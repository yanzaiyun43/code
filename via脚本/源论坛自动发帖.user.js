// ==UserScript==
// @name         源论坛低调自动签到（带反馈）
// @version      1.5
// @description  全程 toast 提示，操作可见更安心
// @author       Qwen
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FID = 140;
    const POST_URL = `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}`;

    // ⚙️ 【开关】是否启用三连发
    const ENABLE_TRIPLE_POST = true; // true=连发3次 | false=只发1次

    // 显示提示（统一函数）
    function showToast(msg, duration = 2000) {
        alert(`💬 ${msg}`);
        console.log(`🎯 [签到助手] ${msg}`);
    }

    // 获取北京时间
    function getBeijingTime() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    }

    // 获取日期字符串 YYYY-MM-DD
    function getBeijingDate() {
        const d = getBeijingTime();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    // 是否已签到
    function hasSignedToday() {
        return localStorage.getItem('sysbbs_last_sign_date') === getBeijingDate();
    }

    // 标记已签到
    function markAsSigned() {
        localStorage.setItem('sysbbs_last_sign_date', getBeijingDate());
    }

    // 当前是否在 6:00 及以后？
    function isAfterSixAM() {
        const now = getBeijingTime();
        return now.getHours() > 6 || (now.getHours() === 6 && now.getMinutes() >= 0);
    }

    // 随机标题
    function getRandomTitle() {
        const titles = [
            '今天也来了',
            '日常报到',
            '路过留个脚印',
            '今天过得怎么样',
            '随便发个帖',
            '水一贴，别介意',
            '今天还在坚持',
            '又见面啦',
            '平凡的一天',
            '继续混个脸熟'
        ];
        return titles[Math.floor(Math.random() * titles.length)];
    }

    // 随机内容
    function getRandomMessage() {
        const messages = [
            '没啥特别的事，就是来看看大家～',
            '最近都在忙啥呢？',
            '刷一下存在感 😄',
            '今天天气不错，适合发个帖',
            '顺手点个头像，留个痕迹',
            '每天来看看，已经成习惯了',
            '不为别的，就为这份热闹',
            '看到新帖挺多，真活跃啊',
            '默默关注中，偶尔冒个泡',
            '生活需要一点小仪式感'
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    }

    // 发送帖子
    function sendLowProfilePost(formhashValue, index = 0) {
        const totalCount = ENABLE_TRIPLE_POST ? 3 : 1;
        const title = getRandomTitle();
        const message = getRandomMessage();

        const data = {
            'formhash': formhashValue,
            'posttime': Math.floor(Date.now() / 1000),
            'delete': '0',
            'topicsubmit': 'yes',
            'subject': title,
            'message': message,
            'usesig': '1'
        };

        const xhr = new XMLHttpRequest();
        const url = POST_URL + '&extra=&mobile=2&handlekey=postform&inajax=1';

        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Origin', 'https://pc.sysbbs.com');
        xhr.setRequestHeader('Referer', POST_URL);

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    console.log(`✅ 第 ${index + 1} 次发帖成功`);
                    showToast(`✅ 第${index + 1}/${totalCount}次 ✔`, 1500);

                    if (ENABLE_TRIPLE_POST && index < 2) {
                        const delay = 1500 + Math.random() * 1000;
                        setTimeout(() => sendLowProfilePost(formhashValue, index + 1), delay);
                    } else {
                        markAsSigned();
                        showToast(`🎉 今日签到完成！共${totalCount}贴`, 3000);
                    }
                } else {
                    console.error(`❌ 第 ${index + 1} 次失败:`, xhr.status);
                    showToast(`❌ 第${index+1}次失败`, 2000);
                    markAsSigned(); // 避免重复触发
                }
            }
        };

        xhr.onerror = () => {
            console.error('📡 网络异常');
            showToast('⚠️ 网络错误或连接中断');
            markAsSigned();
        };

        console.log(`📤 发送第 ${index + 1} 条:`, title);
        showToast(`📤 第${index + 1}次发送中...`, 1000);
        xhr.send(Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&'));
    }

    // 创建 iframe 获取 formhash
    function fetchFormHashAndPost() {
        showToast('🔍 正在加载发帖页...', 1500);

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = POST_URL;

        iframe.onload = function () {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (input && input.value) {
                    console.log('✅ 成功获取 formhash');
                    showToast('🔐 表单已就绪，开始发帖', 1500);
                    sendLowProfilePost(input.value, 0);
                } else {
                    showToast('⚠️ 未找到 formhash，请手动进入发帖页一次');
                }
            } catch (err) {
                console.error('🚫 读取失败:', err);
                showToast('⛔ 安全限制？请检查登录状态');
            }

            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 3000);
        };

        iframe.onerror = () => {
            showToast('❌ 加载发帖页失败，请检查网络');
        };

        document.body.appendChild(iframe);
    }

    // 主逻辑
    window.addEventListener('load', function () {
        showToast('📌 签到助手已启动...', 1000);

        const now = getBeijingTime();
        const timeStr = now.toTimeString().split(' ')[0];
        console.log(`⏰ [${timeStr}] 页面加载完成`);

        if (hasSignedToday()) {
            console.log('✅ 今日已完成');
            showToast('✅ 今日任务已完成', 2000);
            return;
        }

        if (!isAfterSixAM()) {
            console.log('💤 早于6:00');
            showToast('⏰ 6点前不执行', 2000);
            return;
        }

        console.log('🚀 开始签到流程');
        setTimeout(fetchFormHashAndPost, 800);
    });

})();

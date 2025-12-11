// ==UserScript==
// @name         源论坛低调自动签到（增强版）
// @version      1.4
// @description  支持单发/三连发切换，6点后静默执行
// @author       Qwen
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FID = 140; // 论坛分区 ID，请根据实际情况修改
    const POST_URL = `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}`;

    // ⚙️ 【开关】是否启用三连发
    const ENABLE_TRIPLE_POST = true; // 🔘 true=连发3次 | false=只发1次

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
        return now.getHours() > 0 || (now.getHours() === 0 && now.getMinutes() >= 0);
    }

    // 显示提示
    function showToast(msg) {
        alert(`📌 ${msg}`);
        console.log(`🎯 [签到助手] ${msg}`);
    }

    // 随机选择一个自然标题
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

    // 随机选择一段自然内容
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

    // 发送帖子（支持递归调用实现三连发）
    function sendLowProfilePost(formhashValue, index = 0) {
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
                    console.log(`✅ 第 ${index + 1} 次发帖成功:`, title);
                    
                    // 判断是否继续发下一条
                    if (ENABLE_TRIPLE_POST && index < 2) {
                        const delay = 1500 + Math.random() * 1000; // 1.5s ~ 2.5s 随机延迟
                        setTimeout(() => sendLowProfilePost(formhashValue, index + 1), delay);
                    } else {
                        markAsSigned();
                        const count = ENABLE_TRIPLE_POST ? '三连发完成' : '签到完成';
                        showToast(`${count} ✅`);
                    }
                } else {
                    console.error(`❌ 第 ${index + 1} 次发帖失败:`, xhr.status);
                    showToast(`部分失败，状态码: ${xhr.status}`);
                    markAsSigned(); // 即使失败也标记为“已尝试”，避免反复触发
                }
            }
        };

        xhr.onerror = () => {
            console.error('📡 请求出错');
            showToast('网络错误');
            markAsSigned();
        };

        console.log(`📤 正在发送第 ${index + 1} 条:`, title);
        xhr.send(Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&'));
    }

    // 创建隐藏 iframe 获取 formhash 并开始发帖
    function fetchFormHashAndPost() {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = POST_URL;

        iframe.onload = function () {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (input && input.value) {
                    console.log('✅ 成功获取 formhash:', input.value.slice(0, 6) + '...');
                    sendLowProfilePost(input.value, 0); // 从第1次开始
                } else {
                    showToast('⚠️ 未找到 formhash，请手动进入发帖页一次');
                }
            } catch (err) {
                console.error('🚫 无法读取 iframe 内容:', err);
                showToast('安全策略限制？请检查登录状态');
            }

            // 清理 iframe
            setTimeout(() => {
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
            }, 3000);
        };

        iframe.onerror = () => {
            console.error('❌ iframe 加载失败');
            showToast('加载发帖页失败，请检查网络');
        };

        document.body.appendChild(iframe);
    }

    // 主逻辑启动
    window.addEventListener('load', function () {
        const now = getBeijingTime();
        const timeStr = now.toTimeString().split(' ')[0];
        console.log(`⏰ [${timeStr}] 页面加载完成`);

        if (hasSignedToday()) {
            console.log('ℹ️ 今日已签到，跳过');
            return;
        }

        if (!isAfterSixAM()) {
            console.log('💤 早于6:00，暂不执行');
            return;
        }

        console.log('🚀 开始执行签到流程...');
        setTimeout(fetchFormHashAndPost, 800);
    });

})();

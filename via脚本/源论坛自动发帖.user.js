// ==UserScript==
// @name         源论坛低调自动签到（可视化反馈版）
// @version      1.6
// @description  带网页内弹窗提示，每一步都看得见
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
    const ENABLE_TRIPLE_POST = true;

    // 创建网页内 toast 提示框
    let toast;
    function createToast() {
        if (document.getElementById('qwen-toast')) return;

        toast = document.createElement('div');
        toast.id = 'qwen-toast';
        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            maxWidth: '300px',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontFamily: 'sans-serif',
            zIndex: '999999',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'opacity 0.3s ease',
            lineHeight: '1.5'
        });
        toast.textContent = '📌 正在初始化...';
        document.body.appendChild(toast);

        // 3秒后淡出（可被后续更新覆盖）
        setTimeout(() => {
            if (toast) {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    if (toast && toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 500);
            }
        }, 3000);
    }

    // 更新提示内容（保留元素，更新文字）
    function updateToast(msg) {
        if (!toast || !document.body.contains(toast)) {
            createToast();
            setTimeout(() => {
                if (toast) toast.textContent = msg;
            }, 100);
        } else {
            toast.textContent = msg;
            toast.style.opacity = '1';
            // 取消之前的隐藏
            clearTimeout(window.qwen_toast_timeout);
        }

        window.qwen_toast_timeout = setTimeout(() => {
            if (toast) {
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (toast && toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                        toast = null;
                    }
                }, 500);
            }
        }, 3000);
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
                    updateToast(`✅ 第${index + 1}/${totalCount}次 ✔`);
                    console.log(`✅ 第 ${index + 1} 次成功:`, title);

                    if (ENABLE_TRIPLE_POST && index < 2) {
                        const delay = 1500 + Math.random() * 1000;
                        setTimeout(() => sendLowProfilePost(formhashValue, index + 1), delay);
                    } else {
                        markAsSigned();
                        updateToast(`🎉 今日签到完成！共${totalCount}帖`);
                    }
                } else {
                    updateToast(`❌ 第${index+1}次失败`);
                    console.error(`❌ 第 ${index + 1} 次失败:`, xhr.status);
                    markAsSigned();
                }
            }
        };

        xhr.onerror = () => {
            updateToast('⚠️ 网络错误或中断');
            console.error('📡 网络异常');
            markAsSigned();
        };

        console.log(`📤 发送第 ${index + 1} 条:`, title);
        updateToast(`📤 第${index + 1}次发送中...`);
        xhr.send(Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&'));
    }

    // 创建 iframe 获取 formhash
    function fetchFormHashAndPost() {
        updateToast('🔍 正在加载发帖页...');
        console.log('📥 开始创建 iframe 获取 formhash');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = POST_URL;

        iframe.onload = function () {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (input && input.value) {
                    console.log('✅ 成功获取 formhash');
                    updateToast('🔐 表单已就绪，开始发帖');
                    sendLowProfilePost(input.value, 0);
                } else {
                    updateToast('⚠️ 未找到 formhash，请手动进入一次发帖页');
                }
            } catch (err) {
                console.error('🚫 读取失败:', err);
                updateToast('⛔ 跨域限制？请检查登录状态');
            }

            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 3000);
        };

        iframe.onerror = () => {
            updateToast('❌ 加载失败，请检查网络');
        };

        document.body.appendChild(iframe);
    }

    // 主逻辑
    window.addEventListener('load', function () {
        createToast(); // 立即创建
        updateToast('📌 签到助手已激活');

        const now = getBeijingTime();
        const timeStr = now.toTimeString().split(' ')[0];
        console.log(`⏰ [${timeStr}] 页面加载完成`);

        if (hasSignedToday()) {
            console.log('✅ 今日已完成');
            updateToast('✅ 今日任务已完成');
            return;
        }

        if (!isAfterSixAM()) {
            console.log('💤 早于6:00');
            updateToast('⏰ 6点前不执行');
            return;
        }

        console.log('🚀 开始签到流程');
        updateToast('🚀 开始自动签到流程...');
        setTimeout(fetchFormHashAndPost, 800);
    });

})();

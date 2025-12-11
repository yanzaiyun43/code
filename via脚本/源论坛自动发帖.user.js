// ==UserScript==
// @name         源论坛全自动签到 & 发帖系统（智能判断版）
// @version      2.1
// @description  进入即判断：6点后 → 未签则签到 → 发三帖 | 完整反馈
// @author       Qwen ❤️
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FID = 140;
    const SIGN_PLUGIN_URL = 'https://pc.sysbbs.com/plugin.php?id=k_misign:sign';
    const POST_URL = `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}`;
    const TRIPLE_POST_COUNT = 3;

    // ===== 工具函数：创建网页内提示 =====
    let toast;
    function showToast(msg) {
        if (toast && document.body.contains(toast)) {
            toast.textContent = msg;
            toast.style.opacity = '1';
            clearTimeout(toast.timer);
        } else {
            toast = document.createElement('div');
            toast.id = 'qwen-toast';
            Object.assign(toast.style, {
                position: 'fixed', top: '20px', right: '20px',
                maxWidth: '320px', padding: '14px 18px',
                backgroundColor: '#333', color: '#fff', borderRadius: '10px',
                fontSize: '14px', fontFamily: 'sans-serif', zIndex: '999999',
                boxShadow: '0 6px 16px rgba(0,0,0,0.3)', lineHeight: '1.5',
                transition: 'opacity 0.3s ease', wordBreak: 'break-word'
            });
            toast.textContent = msg;
            document.body.appendChild(toast);
        }

        toast.timer = setTimeout(() => {
            if (toast) {
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (toast && toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                        toast = null;
                    }
                }, 300);
            }
        }, 3000);
    }

    // ===== 时间相关 =====
    function getBeijingTime() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    }

    function isAfterSixAM() {
        const now = getBeijingTime();
        return now.getHours() > 6 || (now.getHours() === 6 && now.getMinutes() >= 0);
    }

    function getTodayKey() {
        const d = getBeijingTime();
        return `signed_${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }

    function hasSignedToday() {
        return localStorage.getItem(getTodayKey()) === '1';
    }

    function markAsSigned() {
        localStorage.setItem(getTodayKey(), '1');
    }

    // ===== 获取动态 formhash（用于签到和发帖）=====
    function getFormHashFromPage(callback) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', SIGN_PLUGIN_URL, true);
        xhr.onload = function () {
            if (xhr.status === 200) {
                const html = xhr.responseText;
                const match = html.match(/name="formhash" value="([a-zA-Z0-9]+)"/);
                if (match && match[1]) {
                    callback(match[1]);
                } else {
                    console.warn('⚠️ 未在页面找到 formhash');
                    callback(null);
                }
            } else {
                console.error('❌ 请求签到页失败:', xhr.status);
                callback(null);
            }
        };
        xhr.onerror = () => {
            console.error('📡 网络错误');
            callback(null);
        };
        xhr.send();
    }

    // ===== 执行真实签到 =====
    function doRealSign(callback) {
        showToast('🔔 正在尝试真实签到...');

        getFormHashFromPage(formhash => {
            if (!formhash) {
                showToast('⚠️ 获取 formhash 失败');
                callback(false);
                return;
            }

            const url = `https://pc.sysbbs.com/plugin.php?id=k_misign:sign&operation=qiandao&format=text&formhash=${formhash}`;

            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Accept', 'text/plain, */*; q=0.01');
            xhr.setRequestHeader('Referer', SIGN_PLUGIN_URL);

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        const res = xhr.responseText;

                        if (res.includes('success')) {
                            const reward = res.split('\t')[2] || '获得积分与经验';
                            showToast(`🎉 签到成功！${reward.replace(/\n/g, ' ')}`);
                            markAsSigned();
                            callback(true);
                        } else if (res.includes('already')) {
                            showToast('✅ 今日已签到');
                            markAsSigned();
                            callback(true);
                        } else {
                            showToast('ℹ️ 可能已签或异常');
                            callback(false); // 继续发帖
                        }
                    } else {
                        showToast('⚠️ 签到请求失败');
                        console.error('HTTP Error:', xhr.status);
                        callback(false);
                    }
                }
            };

            xhr.onerror = () => {
                showToast('⚠️ 网络异常，跳过签到');
                callback(false);
            };

            xhr.send();
        });
    }

    // ===== 发三篇低调帖子 =====
    function startTriplePost() {
        showToast('📝 开始发送3篇低调帖子...');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = POST_URL;

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (!input || !input.value) {
                    showToast('⚠️ 无法获取发帖 formhash');
                    cleanup();
                    return;
                }

                const formhashValue = input.value;
                sendOnePost(formhashValue, 0);
            } catch (e) {
                showToast('⛔ 读取失败');
                console.error(e);
                cleanup();
            }
        };

        iframe.onerror = () => {
            showToast('❌ 加载发帖页失败');
            cleanup();
        };

        function sendOnePost(formhash, index) {
            const titles = ['今天也来了', '日常报到', '路过留个脚印', '随便发个帖', '平凡的一天'];
            const messages = [
                '刷一下存在感 😄',
                '生活需要一点小仪式感',
                '最近都在忙啥呢？',
                '看到新帖挺多，真活跃啊',
                '默默关注中，偶尔冒个泡'
            ];

            const title = titles[Math.floor(Math.random() * titles.length)];
            const message = messages[Math.floor(Math.random() * messages.length)];

            const data = {
                formhash,
                posttime: Math.floor(Date.now() / 1000),
                delete: 0,
                topicsubmit: 'yes',
                subject: title,
                message,
                usesig: 1
            };

            const url = POST_URL + '&extra=&mobile=2&handlekey=postform&inajax=1';
            const params = Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&');

            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        showToast(`✅ 第${index+1}/${TRIPLE_POST_COUNT}完成`);
                        if (index < TRIPLE_POST_COUNT - 1) {
                            setTimeout(() => sendOnePost(formhash, index + 1), 1500 + Math.random() * 1000);
                        } else {
                            showToast('🎉 三帖全部完成！');
                        }
                    } else {
                        showToast(`❌ 第${index+1}失败`);
                        if (index < TRIPLE_POST_COUNT - 1) {
                            setTimeout(() => sendOnePost(formhash, index + 1), 2000);
                        }
                    }
                }
            };

            console.log(`📤 发送第 ${index + 1} 条`, title);
            xhr.send(params);
        }

        function cleanup() {
            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 3000);
        }

        document.body.appendChild(iframe);
    }

    // ===== 主流程启动器 =====
    function main() {
        const now = getBeijingTime();
        const timeStr = now.toTimeString().slice(0, 8);
        console.log(`⏰ [${timeStr}] 页面加载完成`);

        // Step 1: 是否 6 点以后？
        if (!isAfterSixAM()) {
            showToast('⏰ 早于6:00，暂不执行任何操作');
            console.log('💤 当前时间早于6点，退出');
            return;
        }

        // Step 2: 是否今天已完成？
        if (hasSignedToday()) {
            showToast('✅ 今日任务已完成，开始发帖');
            console.log('🔁 已标记签到，直接进入发帖阶段');
            startTriplePost();
            return;
        }

        // Step 3: 尝试真实签到
        doRealSign(success => {
            console.log('🎯 签到结果:', success ? '成功' : '失败或已签');
            setTimeout(startTriplePost, 1000); // 成功与否都发帖
        });
    }

    // ===== 启动 =====
    window.addEventListener('load', () => {
        setTimeout(main, 800); // 等页面稍微稳定
    });

})();

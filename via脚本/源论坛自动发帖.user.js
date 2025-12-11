// ==UserScript==
// @name         源论坛助手
// @version      3.0
// @description  6点后自动签到+发3帖，内容随机不重复
// @author       Qwen ❤️
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FID = 140; // 论坛分区 ID，请根据实际调整
    const SIGN_PLUGIN_URL = 'https://pc.sysbbs.com/plugin.php?id=k_misign:sign';
    const POST_URL = `https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=${FID}`;
    const TRIPLE_POST_COUNT = 3;

    // ===== 时间判断：是否 ≥ 北京时间 6:00 =====
    function isAfterSixAM() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        return now.getHours() > 6 || (now.getHours() === 6 && now.getMinutes() >= 0);
    }

    // ===== 今日签到标记 key =====
    function getTodayKey() {
        const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        return `signed_${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    }

    function hasSignedToday() {
        return localStorage.getItem(getTodayKey()) === '1';
    }

    function markAsSigned() {
        localStorage.setItem(getTodayKey(), '1');
    }

    // ===== Toast 提示系统 =====
    let toast;
    function showStatus(msg, type = 'info') {
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
                backgroundColor: type === 'success' ? '#4CAF50' :
                              type === 'warn' ? '#FF9800' : '#333',
                color: '#fff', borderRadius: '10px',
                fontSize: '14px', fontFamily: 'sans-serif', zIndex: '999999',
                boxShadow: '0 6px 16px rgba(0,0,0,0.3)', lineHeight: '1.5',
                transition: 'opacity 0.3s ease', wordBreak: 'break-word'
            });
            toast.textContent = msg;
            document.body.appendChild(toast);
        }

        toast.timer = setTimeout(() => {
            if (toast) toast.style.opacity = '0';
            setTimeout(() => {
                if (toast && toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                    toast = null;
                }
            }, 300);
        }, 5000);
    }

    // ===== 获取 formhash（用于签到和发帖）=====
    function getFormHashFromPage(callback) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', SIGN_PLUGIN_URL, true);
        xhr.onload = function () {
            if (xhr.status === 200) {
                const html = xhr.responseText;
                const match = html.match(/name="formhash" value="([a-zA-Z0-9]+)"/);
                callback(match ? match[1] : null);
            } else {
                console.warn('⚠️ 请求签到页失败:', xhr.status);
                callback(null);
            }
        };
        xhr.onerror = () => callback(null);
        xhr.send();
    }

    // ===== 执行真实签到 =====
    function doRealSign(callback) {
        showStatus('🔔 正在尝试真实签到...', 'info');

        getFormHashFromPage(formhash => {
            if (!formhash) {
                showStatus('⚠️ 无法获取 formhash，跳过签到', 'warn');
                callback(false);
                return;
            }

            const url = `${SIGN_PLUGIN_URL}&operation=qiandao&format=text&formhash=${formhash}`;

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
                            const reward = (res.split('\t')[2] || '获得积分与经验').replace(/\n/g, ' ');
                            showStatus(`🎉 签到成功！${reward}`, 'success');
                            markAsSigned();
                            callback(true);
                        } else if (res.includes('already')) {
                            showStatus('✅ 今日已签到', 'info');
                            markAsSigned();
                            callback(true);
                        } else {
                            showStatus('ℹ️ 可能已签或状态异常', 'info');
                            callback(false);
                        }
                    } else {
                        showStatus('⚠️ 签到请求失败', 'warn');
                        callback(false);
                    }
                }
            };

            xhr.onerror = () => {
                showStatus('⚠️ 网络异常，跳过签到', 'warn');
                callback(false);
            };

            xhr.send();
        });
    }

    // ===== 发三篇低调帖子 =====
    function startTriplePost() {
        showStatus(`📝 开始发送 ${TRIPLE_POST_COUNT} 篇低调帖子...`, 'info');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = POST_URL;

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const input = doc.querySelector('input[name="formhash"]');
                if (!input || !input.value) {
                    showStatus('⚠️ 无法获取发帖 formhash', 'warn');
                    cleanup();
                    return;
                }

                const formhashValue = input.value;
                sendOnePost(formhashValue, 0);
            } catch (e) {
                showStatus('⛔ 读取发帖页失败', 'warn');
                console.error(e);
                cleanup();
            }
        };

        iframe.onerror = () => {
            showStatus('❌ 加载发帖页失败', 'warn');
            cleanup();
        };

        // ===== 标题库（10个自然风格）=====
        const TITLES = [
            '今天也来了',
            '日常报到',
            '路过留个脚印',
            '随便发个帖',
            '平凡的一天',
            '最近在忙啥呢',
            '看到新帖挺多',
            '心情不错，冒个泡',
            '今天刷到了好东西',
            '有点感慨，说两句'
        ];

        // ===== 内容库（20条生活化表达）=====
        const MESSAGES = [
            '刷一下存在感 😄 生活需要一点小仪式感',
            '最近工作有点累，但还是来看看大家',
            '默默关注中，偶尔冒个泡，别见怪',
            '看到几个有意思的帖子，挺有意思',
            '今天天气不错，心情也挺好~',
            '好久没来了，论坛还是这么热闹',
            '刚吃完饭，顺手打开看看有什么新鲜事',
            '最近都在听老歌，感觉特别治愈',
            '有时候一句话就能让人心里一暖',
            '发现一个好用的小工具，回头分享一下',
            '每天来一趟，像打卡一样习惯了',
            '昨晚做了个梦，醒来还记得一点点',
            '今天遇到件小事，还挺值得思考的',
            '看到有人讨论读书，我也爱看书',
            '手机相册翻到一张旧照，有点怀念',
            '生活平平淡淡，但也挺踏实的',
            '有时候不想说话，但发个帖就觉得安心',
            '看到新人加入，欢迎你们呀～',
            '最近在学做饭，终于不怕糊锅了😂',
            '这个世界吵吵闹闹，但我喜欢这里的安静'
        ];

        function sendOnePost(formhash, index) {
            const title = TITLES[Math.floor(Math.random() * TITLES.length)];
            const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

            const data = {
                formhash,
                posttime: Math.floor(Date.now() / 1000),
                delete: 0,
                topicsubmit: 'yes',
                subject: title,
                message,
                usesig: 1
            };

            const params = Object.keys(data).map(k => `${k}=${encodeURIComponent(data[k])}`).join('&');
            const url = POST_URL + '&extra=&mobile=2&handlekey=postform&inajax=1';

            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        showStatus(`✅ 第${index+1}/${TRIPLE_POST_COUNT}完成`);
                        if (index < TRIPLE_POST_COUNT - 1) {
                            setTimeout(() => sendOnePost(formhash, index + 1), 1500 + Math.random() * 1000);
                        } else {
                            showStatus('🎉 三帖全部完成！低调活跃达成 ✨', 'success');
                        }
                    } else {
                        showStatus(`❌ 第${index+1}失败，继续下一帖`, 'warn');
                        if (index < TRIPLE_POST_COUNT - 1) {
                            setTimeout(() => sendOnePost(formhash, index + 1), 2000);
                        } else {
                            showStatus('⚠️ 部分发帖未成功，不影响整体', 'warn');
                        }
                    }
                }
            };

            console.log(`📤 发送第 ${index + 1} 条`, { title, message });
            xhr.send(params);
        }

        function cleanup() {
            setTimeout(() => {
                if (iframe.parentNode) iframe.remove();
            }, 10000);
        }

        document.body.appendChild(iframe);
    }

    // ===== 主流程启动器 =====
    function main() {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
        const timeStr = now.toTimeString().slice(0, 8);

        // 👇 初始状态提示（所有页面都能看到）
        showStatus(`📌 助手 v3.0 启动\n⏰ ${timeStr}`, 'info');

        // 早于6点？
        if (!isAfterSixAM()) {
            showStatus(`🌙 夜猫子你好～\n⏰ 6点前不执行任务\n💤 先睡会儿，明早见！`, 'warn');
            return;
        }

        // 已签过？
        if (hasSignedToday()) {
            showStatus(`✅ 今日已完成\n🔁 自动跳过签到\n📤 即将发3帖保持活跃`, 'info');
            startTriplePost();
            return;
        }

        // 否则：开始签到 + 发帖
        doRealSign(success => {
            setTimeout(startTriplePost, 1000);
        });
    }

    // ===== 启动：确保 DOM 加载完成 =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(main, 500));
    } else {
        setTimeout(main, 500);
    }

})();

// ==UserScript==
// @name         源论坛自动签到（Via兼容版 + Toast提示）
// @version      1.1
// @description  打开网页时自动检查：若≥9点且未签到，则执行3次签到；若已签到则弹出Toast提示。
// @author       Qwen
// @match        https://pc.sysbbs.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 配置
    const SIGN_COUNT = 3;
    const INTERVAL_MS = 2500;
    const TARGET_HOUR = 9;

    // ====== 新增：Toast 提示函数 ======
    function showToast(message, type) {
        // 防止重复创建
        var existing = document.getElementById('sysbbs-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.id = 'sysbbs-toast';
        toast.innerText = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : '#f44336'};
            color: white;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 2147483647;
            max-width: 80%;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.3s, transform 0.3s;
        `;

        document.body.appendChild(toast);

        // 触发淡入
        setTimeout(function() {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);

        // 2秒后淡出并移除
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(function() {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 2000);
    }

    // 获取北京时间
    function getBeijingTime() {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    }

    // 序列化表单数据
    function serialize(data) {
        var pairs = [];
        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
            }
        }
        return pairs.join('&');
    }

    // 获取 formhash
    function getFormHash() {
        var inputs = document.getElementsByName('formhash');
        if (inputs.length > 0) {
            return inputs[0].value;
        }
        return 'a217dd31'; // fallback
    }

    // 单次签到（XMLHttpRequest）
    function signOnce(index, callback) {
        var xhr = new XMLHttpRequest();
        var url = 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140&extra=&topicsubmit=yes&mobile=2&handlekey=postform&inajax=1';

        var data = {
            'formhash': getFormHash(),
            'posttime': Math.floor(Date.now() / 1000),
            'delete': '0',
            'topicsubmit': 'yes',
            'subject': '签到',
            'message': '今日签到第' + index + '次',
            'replycredit_extcredits': '0',
            'replycredit_times': '1',
            'replycredit_membertimes': '1',
            'replycredit_random': '100',
            'tags': '',
            'price': '',
            'readperm': '',
            'cronpublishdate': '',
            'allownoticeauthor': '1',
            'usesig': '1'
        };

        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Origin', 'https://pc.sysbbs.com');
        xhr.setRequestHeader('Referer', 'https://pc.sysbbs.com/forum.php?mod=post&action=newthread&fid=140');

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log('✅ 第 ' + index + ' 次签到成功');
                    callback(null);
                } else {
                    console.error('❌ 第 ' + index + ' 次失败，状态码:', xhr.status);
                    callback(new Error('HTTP ' + xhr.status));
                }
            }
        };

        xhr.send(serialize(data));
    }

    // 执行3次签到
    function doSignThreeTimes(count) {
        if (count > SIGN_COUNT) {
            var today = getBeijingTime().toISOString().split('T')[0];
            localStorage.setItem('sysbbs_sign_done', today);
            showToast('✅ 今日签到已完成！', 'success');
            console.log('📌 源论坛：今日3次签到已完成');
            return;
        }

        signOnce(count, function (err) {
            if (err) {
                console.warn('⚠️ 第 ' + count + ' 次失败，但仍继续下一次');
            }
            setTimeout(function () {
                doSignThreeTimes(count + 1);
            }, INTERVAL_MS);
        });
    }

    // 主逻辑
    function checkAndRun() {
        var now = getBeijingTime();
        var today = now.toISOString().split('T')[0];
        var lastDone = localStorage.getItem('sysbbs_sign_done');
        var hour = now.getHours();

        // ✅ 关键新增：如果已签到，弹出 Toast 并退出
        if (lastDone === today) {
            console.log('ℹ️ 源论坛：今日已签到，跳过');
            showToast('已经签到，不再签到', 'info'); // ←←← 就是你想要的！
            return;
        }

        if (hour < TARGET_HOUR) {
            console.log('⏳ 源论坛：未到 ' + TARGET_HOUR + ' 点，当前时间 ' + now.toLocaleTimeString());
            return;
        }

        if (!document.body) {
            setTimeout(checkAndRun, 500);
            return;
        }

        console.log('🔔 源论坛：满足条件，开始3次签到...');
        doSignThreeTimes(1);
    }

    // 启动
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', checkAndRun);
    } else {
        checkAndRun();
    }

})();

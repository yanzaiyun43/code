import requests
import os
import time  # 新增时间模块
from urllib.parse import urlparse

save_dir = r'D:\a2025'
os.makedirs(save_dir, exist_ok=True)

base_url = "https://wxdl.freephantom.cn/view/select"
headers = {
    'User-Agent': "Mozilla/5.0 (Linux; Android 13; 23049RAD8C Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 Mobile Safari/537.36 XWEB/1300473 MMWEBSDK/20231202 MMWEBID/8073 MicroMessenger/8.0.47.2560(0x28002F36) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android",
    'Referer': "https://servicewechat.com/wx6afcd671e31aa735/9/page-frame.html"
}

for page in range(1, 31):
    print(f"\n正在下载第 {page} 页...")
    
    # 动态参数
    params = {
        'name': "animedb.view_wxapp_pixiv_api_illustor_recommend",
        'format': "json",
        'page': str(page)
    }
    
    try:
        # 请求数据
        response = requests.get(base_url, params=params, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        if not data:
            print(f"第 {page} 页无数据，跳过")
            continue
            
        # 遍历当前页项
        for index, item in enumerate(data, 1):
            img_url = item.get('preview')
            if not img_url:
                print(f"第 {page} 页第 {index} 项无URL")
                continue
            
            filename = os.path.basename(urlparse(img_url).path)
            filepath = os.path.join(save_dir, filename)
            
            img_headers = headers.copy()
            img_headers['Referer'] = 'https://www.pixiv.net/'
            
            try:
                with requests.get(img_url, headers=img_headers, stream=True) as img_resp:
                    img_resp.raise_for_status()
                    with open(filepath, 'wb') as f:
                        for chunk in img_resp.iter_content(8192):
                            f.write(chunk)
                    print(f"第 {page} 页 | 成功下载: {filename}")
            except Exception as e:
                print(f"第 {page} 页 | 下载失败: {str(e)}")
                
    except Exception as e:
        print(f"第 {page} 页请求异常: {str(e)}")
    
    # 每页完成后的间隔
    time.sleep(3)  # 新增3秒延迟

print("\n全部30页下载完成！保存位置：" + save_dir)
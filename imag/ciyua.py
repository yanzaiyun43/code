import requests
import os
import time
from urllib.parse import urlparse

# 修改保存路径到D盘的a2025文件夹
save_dir = r'D:\a2025'  # 使用原始字符串避免转义问题
os.makedirs(save_dir, exist_ok=True)  # 自动创建目录（如果不存在）

# API请求参数和头（与之前一致）
url = "https://animedb.sinaapp.com/proxy/p.php"
params = {'page': "1", 'size': "30"}
headers = {
    'User-Agent': "Mozilla/5.0 (Linux; Android 13; 23049RAD8C Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 Mobile Safari/537.36 XWEB/1300473 MMWEBSDK/20231202 MMWEBID/8073 MicroMessenger/8.0.47.2560(0x28002F36) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android",
    'Accept-Encoding': "gzip,compress,br,deflate",
    # 'charset': "utf-8",
    'content-type': "application/json",
    'Referer': "https://servicewechat.com/wx6afcd671e31aa735/9/page-frame.html"
}

# 获取API响应
response = requests.get(url, params=params, headers=headers)
data = response.json()

# 遍历并下载图片
for item in data:
    img_url = item.get('original')
    if not img_url:
        print(f"跳过无图片URL的项：{item.get('mmid', '未知ID')}")
        continue
    
    # 提取文件名
    parsed_url = urlparse(img_url)
    filename = os.path.basename(parsed_url.path)
    filepath = os.path.join(save_dir, filename)  # 自动生成完整路径
    
    # 配置图片请求头（关键：修改Referer）
    img_headers = headers.copy()
    img_headers['Referer'] = 'https://www.pixiv.net/'
    
    try:
        # 流式下载图片
        with requests.get(img_url, headers=img_headers, stream=True) as img_resp:
            img_resp.raise_for_status()
            # 写入文件
            with open(filepath, 'wb') as f:
                for chunk in img_resp.iter_content(chunk_size=8192):
                    f.write(chunk)
        print(f"图片已保存到D盘:{filepath}")
    except Exception as e:
        print(f"下载失败：{img_url}，错误：{str(e)}")

# 修改为循环下载，从第1页到第10页
for page in range(1, 11):
    params = {'page': str(page), 'size': "30"}
    headers = {
        'User-Agent': "Mozilla/5.0 (Linux; Android 13; 23049RAD8C Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 Mobile Safari/537.36 XWEB/1300473 MMWEBSDK/20231202 MMWEBID/8073 MicroMessenger/8.0.47.2560(0x28002F36) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android",
        'Accept-Encoding': "gzip,compress,br,deflate",
        # 'charset': "utf-8",
        'content-type': "application/json",
        'Referer': "https://servicewechat.com/wx6afcd671e31aa735/9/page-frame.html"
    }

    # 获取API响应
    response = requests.get(url, params=params, headers=headers)
    data = response.json()

    # 遍历并下载图片
    for item in data:
        img_url = item.get('original')
        if not img_url:
            print(f"跳过无图片URL的项：{item.get('mmid', '未知ID')}")
            continue
        
        # 提取文件名
        parsed_url = urlparse(img_url)
        filename = os.path.basename(parsed_url.path)
        filepath = os.path.join(save_dir, filename)  # 自动生成完整路径
        
        # 配置图片请求头（关键：修改Referer）
        img_headers = headers.copy()
        img_headers['Referer'] = 'https://www.pixiv.net/'
        
        try:
            # 流式下载图片
            with requests.get(img_url, headers=img_headers, stream=True) as img_resp:
                img_resp.raise_for_status()
                # 写入文件
                with open(filepath, 'wb') as f:
                    for chunk in img_resp.iter_content(chunk_size=8192):
                        f.write(chunk)
            print(f"图片已保存到D盘:{filepath}")
        except Exception as e:
            print(f"下载失败：{img_url}，错误：{str(e)}")

    print(f'第 {page} 页图片处理完毕。')
    time.sleep(3)  # 每页下载完成后延时3秒

print('所有图片处理完毕。')
for item in data:
    if 'attributes' in item and 'image' in item['attributes']:
        image_url = item['attributes']['image']
        image_name = os.path.basename(image_url)
        image_path = os.path.join('d:\\a2025', image_name)
        # 下载图片
        image_response = requests.get(image_url)
        if image_response.status_code == 200:
            print(f'开始下载图片: {image_url}')
            with open(image_path, 'wb') as f:
                f.write(image_response.content)
            print(f'图片 {image_url} 下载完成。')
        else:
            print(f'Failed to download image from {image_url}')
        # 修改页码范围
        for page in range(1, 11):
            params = {'page': str(page), 'size': "30"}
            time.sleep(3)
            print(f'当前页图片下载完成，开始延时3秒。')
        else:
            print('Failed to parse JSON data.')
            print('Response data is not in the expected format.')
            # except ValueError:
            print(f'Failed to get page {page}: {response.status_code}')
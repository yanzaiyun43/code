import requests
import os  # 添加 os 模块导入

url = "https://animedb.sinaapp.com/proxy/p.php"

params = {
  'page': "1",
  'size': "30"
}

headers = {
  'User-Agent': "Mozilla/5.0 (Linux; Android 13; 23049RAD8C Build/TKQ1.221114.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.103 Mobile Safari/537.36 XWEB/1300473 MMWEBSDK/20231202 MMWEBID/8073 MicroMessenger/8.0.47.2560(0x28002F36) WeChat/arm64 Weixin NetType/5G Language/zh_CN ABI/arm64 MiniProgramEnv/android",
  'Accept-Encoding': "gzip,compress,br,deflate",
  'charset': "utf-8",
  'content-type': "application/json",
  'Referer': "https://servicewechat.com/wx6afcd671e31aa735/9/page-frame.html"
}

response = requests.get(url, params=params, headers=headers)

print(response.text)

if response.status_code == 200:
    try:
        data = response.json()
        if isinstance(data, list):
            for item in data:
                if 'original' in item:
                    image_url = item['original']
                    image_name = image_url.split('/')[-1]
                    image_path = os.path.join('d:\\code\\imag\\downloaded_images', image_name)
                    os.makedirs(os.path.dirname(image_path), exist_ok=True)
                    image_response = requests.get(image_url)
                    if image_response.status_code == 200:
                        with open(image_path, 'wb') as f:
                            f.write(image_response.content)
                        print(f'图片 {image_url} 下载完成。')
                    else:
                        print(f'无法下载图片 {image_url}，状态码: {image_response.status_code}')
    except ValueError:
        print('无法解析 JSON 数据。')
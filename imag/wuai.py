import requests
import os
import re
import time
import random
import multiprocessing
from concurrent.futures import ThreadPoolExecutor, as_completed
from xml import etree
from urllib.parse import urljoin
from requests.exceptions import RequestException
  
  
def validate_and_clean_path(path: str) -> str:
    """清理路径中的非法字符，确保文件夹可创建"""
    invalid_chars = r'[\\/*?:"<>|]'
    return re.sub(invalid_chars, '_', path)
  
  
def download_cover(session: requests.Session, cover_url: str, save_path: str, referer: str, max_retries: int = 1) -> bool:
    """下载主题封面图（保留原始尺寸）"""
    retry_count = 0
    last_error = None
     
    while retry_count <= max_retries:
        try:
            headers = {'Referer': referer}
            res = session.get(cover_url, headers=headers, timeout=15, stream=True)
            res.raise_for_status()
             
            content_type = res.headers.get('Content-Type', '')
            if not (content_type.startswith('image/jpeg') or content_type.startswith('image/png')):
                print(f"  &#10060; 封面格式异常（非JPG/PNG）：{content_type}")
                return False
             
            # 确保封面文件夹存在（即使父文件夹已创建，再次确认避免意外）
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            with open(save_path, 'wb') as f:
                for chunk in res.iter_content(chunk_size=1024):
                    if chunk:
                        f.write(chunk)
             
            # 封面下载完成后添加100ms延迟
            time.sleep(0.1)
            return True
             
        except RequestException as e:
            last_error = e
            retry_count += 1
            if retry_count <= max_retries:
                print(f"  &#9888;&#65039; 封面下载网络错误（{str(e)}），正在进行第{retry_count}次重试...")
                # 重试前添加延迟，避免立即重试
                time.sleep(random.uniform(1.0, 2.0))
            else:
                print(f"  &#10060; 封面下载网络错误（{str(e)}），重试{max_retries}次后仍失败")
        except Exception as e:
            print(f"  &#10060; 封面下载本地保存错误：{str(e)}")
            return False
     
    return False
  
  
def batch_download_covers(session: requests.Session, theme_list: list, cover_save_dir: str, max_workers: int = 3) -> int:
    """
    批量下载主题封面图
     
    Args:
        session: requests会话
        theme_list: 主题列表
        cover_save_dir: 封面保存目录
        max_workers: 最大并发下载数
         
    Returns:
        成功下载的封面数量
    """
    print(f"\n===== 开始批量下载{len(theme_list)}个主题的封面图（保存至：{cover_save_dir}）=====")
     
    # 创建保存目录
    os.makedirs(cover_save_dir, exist_ok=True)
     
    success_count = 0
     
    # 使用线程池进行批量下载
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 创建下载任务
        future_to_theme = {}
        for theme_idx, theme_info in enumerate(theme_list, start=1):
            short_theme_name = theme_info['name'][:15]
            cover_save_path = os.path.join(cover_save_dir, f"{theme_idx}_{short_theme_name}.jpg")
             
            print(f"正在提交封面下载任务：主题 {theme_idx}/{len(theme_list)}：{theme_info['name']}")
             
            future = executor.submit(
                download_cover, 
                session, 
                theme_info['cover_url'], 
                cover_save_path, 
                theme_info['referer_url']
            )
            future_to_theme[future] = (theme_idx, theme_info['name'], cover_save_path)
         
        # 处理完成的下载任务
        for future in as_completed(future_to_theme):
            theme_idx, theme_name, cover_save_path = future_to_theme[future]
            try:
                result = future.result()
                if result:
                    success_count += 1
                    print(f"  &#9989; 主题{theme_idx}封面已保存至：{cover_save_path}")
                else:
                    print(f"  &#10060; 主题{theme_idx}封面下载失败：{theme_name}")
            except Exception as e:
                print(f"  &#10060; 主题{theme_idx}封面下载异常：{str(e)}")
     
    print(f"\n===== 批量封面下载完成：成功{success_count}/{len(theme_list)}张 =====")
    return success_count
 
 
def get_theme_urls(session: requests.Session, base_url: str, start_page: int, end_page: int) -> list:
    """提取主题信息（URL、名称、封面URL）"""
    themes = []
    for page in range(start_page, end_page + 1):
        try:
            list_url = f"{base_url}/html/list_1_{page}.html"
            print(f"正在获取列表页：{list_url}")
  
            res = session.get(list_url, timeout=15)
            res.raise_for_status()
            res.encoding = 'gbk'
            parser = etree.HTML(res.text)
  
            theme_items = parser.xpath('//body/div[5]/ul/li')
            if not theme_items:
                print(f"  &#9888;&#65039; 列表页{page}未找到主题项，建议检查XPath路径")
                continue
  
            for item in theme_items:
                detail_link = item.xpath('./a/@href')
                if not detail_link:
                    continue
                full_detail_url = urljoin(base_url, detail_link[0])
  
                theme_name = item.xpath('./p/a/text()')
                if not theme_name:
                    theme_name = [f"未命名主题_{len(themes) + 1}"]
                clean_name = validate_and_clean_path(theme_name[0])
  
                cover_link = item.xpath('./a/img/@src')
                if not cover_link:
                    print(f"  &#9888;&#65039; 未提取到封面URL，跳过主题：{clean_name}")
                    continue
                full_cover_url = urljoin(base_url, cover_link[0])
  
                if not full_cover_url.startswith('https://img.773tuba.cc/pic/'):
                    print(f"  &#9888;&#65039; 封面URL格式异常，跳过：{full_cover_url}")
                    continue
  
                themes.append({
                    'detail_url': full_detail_url,
                    'name': clean_name,
                    'save_dir': f"pics/{clean_name}",
                    'cover_url': full_cover_url,
                    'referer_url': list_url
                })
  
            print(f"  &#9989; 列表页{page}成功提取{len(theme_items)}个主题项")
            time.sleep(random.uniform(1.5, 3.0))
  
        except RequestException as e:
            print(f"获取列表页{page}失败：{str(e)}，继续下一页")
            continue
        except Exception as e:
            print(f"处理列表页{page}时出错：{str(e)}")
            continue
  
    print(f"\n===== 最终获取到{len(themes)}个有效主题（含可下载封面）=====")
    return themes
  
  
def get_pic_urls(session: requests.Session, theme_detail_url: str) -> list:
    """从主题详情页提取所有图片URL"""
    pic_urls = []
    try:
        res = session.get(theme_detail_url, timeout=15)
        res.raise_for_status()
        res.encoding = 'gbk'
        parser = etree.HTML(res.text)
  
        page_info = parser.xpath('//*[@id="pages"]/a[1]/text()')
        total_pages = int(re.search(r'共(\d+)页', page_info[0]).group(1)) if (
                    page_info and re.search(r'共(\d+)页', page_info[0])) else 1
  
        page_url_list = [theme_detail_url]
        if total_pages > 1:
            url_prefix = theme_detail_url.rsplit('.', 1)[0]
            if '_' in url_prefix:
                url_prefix = url_prefix.rsplit('_', 1)[0]
            for i in range(2, total_pages + 1):
                page_url_list.append(f"{url_prefix}_{i}.html")
  
        for page_idx, page_url in enumerate(page_url_list, start=1):
            try:
                res_page = session.get(page_url, timeout=15)
                res_page.raise_for_status()
                res_page.encoding = 'gbk'
                page_parser = etree.HTML(res_page.text)
  
                img_xpath = '/html/body/div[8]/img/@src'
                current_page_imgs = page_parser.xpath(img_xpath)
                if not current_page_imgs:
                    print(f"  &#9888;&#65039; 主题分页{page_idx}未找到图片，建议检查XPath")
                    continue
  
                full_img_urls = [urljoin(theme_detail_url, img) for img in current_page_imgs]
                pic_urls.extend(full_img_urls)
                print(f"  &#9989; 分页{page_idx}/{total_pages}提取到{len(full_img_urls)}张图片")
  
                time.sleep(random.uniform(1, 2))
  
            except RequestException as e:
                print(f"  &#10060; 分页{page_idx}请求失败：{str(e)}，跳过该页")
                continue
  
    except RequestException as e:
        print(f"请求主题首页失败：{str(e)}")
    except Exception as e:
        print(f"处理主题页时出错：{str(e)}")
  
    return pic_urls
  
  
def download_single_pic(session: requests.Session, pic_url: str, save_name: str, save_dir: str, referer: str, max_retries: int = 1) -> bool:
    """下载单张图片（保留原始质量）"""
    retry_count = 0
    last_error = None
     
    while retry_count <= max_retries:
        try:
            headers = {'Referer': referer}
            res = session.get(pic_url, headers=headers, timeout=20, stream=True)
            res.raise_for_status()
             
            content_type = res.headers.get('Content-Type', '')
            if not (content_type.startswith('image/jpeg') or content_type.startswith('image/png')):
                print(f"  &#10060; {save_name}：格式异常（{content_type}）")
                return False
             
            os.makedirs(save_dir, exist_ok=True)
            save_path = os.path.join(save_dir, save_name)
             
            with open(save_path, 'wb') as f:
                for chunk in res.iter_content(chunk_size=4096):
                    if chunk:
                        f.write(chunk)
             
            # 每张图片下载完成后添加100ms延迟
            time.sleep(0.1)
             
            print(f"  &#9989; {save_name}：下载成功（保存至{save_path}）")
            return True
             
        except RequestException as e:
            last_error = e
            retry_count += 1
            if retry_count <= max_retries:
                print(f"  &#9888;&#65039; {save_name}：网络错误（{str(e)}），正在进行第{retry_count}次重试...")
                # 重试前添加延迟，避免立即重试
                time.sleep(random.uniform(1.0, 2.0))
            else:
                print(f"  &#10060; {save_name}：网络错误（{str(e)}），重试{max_retries}次后仍失败")
        except Exception as e:
            print(f"  &#10060; {save_name}：本地保存错误（{str(e)}）")
            return False
     
    return False
  
  
def check_input_symbols(input_str: str) -> tuple[bool, str]:
    """验证用户输入中的符号是否合法"""
    if '，' in input_str:
        return False, "&#10060; 发现中文逗号“，”！请替换为英文逗号“,”（半角逗号）"
  
    if '－' in input_str:
        return False, "&#10060; 发现中文减号“－”！请替换为英文减号“-”（半角减号）"
  
    # 修复的正则表达式：-放在字符集结尾
    illegal_chars = re.findall(r'[^0-9,\s-]', input_str)
    if illegal_chars:
        unique_illegal = list(set(illegal_chars))
        return False, f"&#10060; 发现非法字符：{''.join(unique_illegal)}！仅支持数字、英文逗号“,”、英文减号“-”"
  
    if not re.search(r'[0-9]', input_str):
        return False, "&#10060; 未检测到有效数字！请输入编号（如1-3,6,8）"
  
    return True, "&#9989; 符号格式合法"
  
  
def parse_user_selection(input_str: str, max_valid_index: int) -> list:
    """解析用户输入的主题编号"""
    selected_indices = set()
  
    input_str = input_str.strip().strip(',')
    input_str = re.sub(r',+', ',', input_str)
    input_str = re.sub(r'\s+', '', input_str)
  
    for segment in input_str.split(','):
        if not segment:
            continue
  
        if '-' in segment:
            try:
                start_idx, end_idx = map(int, segment.split('-'))
                start_idx = max(1, start_idx)
                end_idx = min(max_valid_index, end_idx)
                if start_idx <= end_idx:
                    selected_indices.update(range(start_idx, end_idx + 1))
                else:
                    print(f"  &#9888;&#65039; 无效范围：{segment}（起始值大于结束值），已忽略")
            except ValueError:
                print(f"  &#9888;&#65039; 范围格式错误：{segment}（正确格式如“1-3”，请勿在减号前后加空格），已忽略")
        else:
            try:
                idx = int(segment)
                if 1 <= idx <= max_valid_index:
                    selected_indices.add(idx)
                else:
                    print(f"  &#9888;&#65039; 编号{idx}超出范围（有效范围1-{max_valid_index}），已忽略")
            except ValueError:
                print(f"  &#9888;&#65039; 编号格式错误：{segment}（请输入纯数字），已忽略")
  
    return sorted(list(selected_indices))
  
  
def main():
    target_base_url = "https://www.773tuba.cc"
    session = requests.Session()
  
    current_time = time.strftime("%Y%m%d_%H%M", time.localtime())
    temp_cover_dir = f"封面批次_{current_time}_第{0}-{0}页"
    while True:
        try:
            start_page = int(input("请输入起始页码："))
            end_page = int(input("请输入结束页码："))
            if start_page > 0 and end_page >= start_page:
  
                cover_save_dir = temp_cover_dir.replace(f"第{0}-{0}页", f"第{start_page}-{end_page}页")
                break
            print("  &#10060; 输入错误：起始页码必须>0，且结束页码≥起始页码")
        except ValueError:
            print("  &#10060; 输入错误：请输入整数页码")
  
  
    os.makedirs(cover_save_dir, exist_ok=True)
    print(f"\n&#9989; 当前批次封面将保存至：{os.path.abspath(cover_save_dir)}")
  
  
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    })
  
  
    print(f"\n===== 开始获取第{start_page}-{end_page}页的主题信息 =====")
    theme_list = get_theme_urls(session, target_base_url, start_page, end_page)
    if not theme_list:
        print("未获取到任何有效主题，程序将退出")
        return
  
  
    print(f"\n===== 开始下载{len(theme_list)}个主题的封面图（保存至：{cover_save_dir}）=====")
     
    # 询问用户是否使用批量下载模式下载封面
    use_batch_covers = input("\n是否使用批量下载模式下载封面图？（y/n，默认为y）：").strip().lower()
    if use_batch_covers == '' or use_batch_covers == 'y':
        try:
            cover_max_workers = int(input("请输入封面并发下载数（建议1-5，默认为3）：") or "3")
            cover_max_workers = max(1, min(10, cover_max_workers))  # 限制在1-10之间
            print(f"将使用批量下载模式下载封面，并发数：{cover_max_workers}")
             
            # 使用批量下载功能下载封面
            batch_download_covers(session, theme_list, cover_save_dir, cover_max_workers)
        except ValueError:
            print("输入无效，将使用默认并发数3进行批量下载封面")
            batch_download_covers(session, theme_list, cover_save_dir, 3)
    else:
        # 使用原有的单线程下载方式
        for theme_idx, theme_info in enumerate(theme_list, start=1):
            short_theme_name = theme_info['name'][:15]
            cover_save_path = os.path.join(cover_save_dir, f"{theme_idx}_{short_theme_name}.jpg")
             
            print(f"正在处理主题 {theme_idx}/{len(theme_list)}：{theme_info['name']}")
            if download_cover(session, theme_info['cover_url'], cover_save_path, theme_info['referer_url']):
                print(f"  &#9989; 封面已保存至：{cover_save_path}")
            else:
                print(f"  &#10060; 封面下载失败")
             
            time.sleep(random.uniform(0.8, 1.5))
  
  
    print(f"\n===== 可下载主题列表（共{len(theme_list)}个）=====")
    for idx, theme_info in enumerate(theme_list, start=1):
        cover_path = os.path.join(cover_save_dir, f"{idx}_{theme_info['name'][:15]}.jpg")
        print(f"{idx}. 主题：{theme_info['name']} | 封面路径：{cover_path}")
  
  
    while True:
        user_input = input("\n请输入要下载的主题编号（格式示例：1-3,6,8 或输入all下载全部）：")
        user_input = user_input.strip().lower()
  
        if user_input == 'all':
            selected_themes = list(range(1, len(theme_list) + 1))
            print(f"&#9989; 已选择：全部主题（1-{len(theme_list)}）")
            break
  
        is_valid_symbol, symbol_tip = check_input_symbols(user_input)
        if not is_valid_symbol:
            print(symbol_tip)
            print("&#8505;&#65039;  请重新输入（示例：1-3,6,8 或 all）\n")
            continue
  
        selected_themes = parse_user_selection(user_input, len(theme_list))
        if selected_themes:
            print(f"&#9989; 已选择主题：{selected_themes}")
            break
        else:
            print("&#10060; 未检测到有效编号！请重新输入（示例：1-3,6,8）\n")
  
  
    print(f"\n===== 开始下载选中的{len(selected_themes)}个主题图片 =====")
     
    # 询问用户是否使用批量下载模式及并发数
    use_batch = input("\n是否使用批量下载模式？（y/n，默认为y）：").strip().lower()
    if use_batch == '' or use_batch == 'y':
        try:
            max_workers = int(input("请输入并发下载数（建议1-5，默认为5）：") or "5")
            max_workers = max(1, min(10, max_workers))  # 限制在1-10之间
            print(f"将使用批量下载模式，并发数：{max_workers}")
             
            # 使用批量下载功能
            batch_download_themes(session, theme_list, selected_themes, max_workers)
        except ValueError:
            print("输入无效，将使用默认并发数3进行批量下载")
            batch_download_themes(session, theme_list, selected_themes, 3)
    else:
        # 使用原有的单线程下载方式
        for selected_idx in selected_themes:
            target_theme = theme_list[selected_idx - 1]
            print(f"\n=== 正在处理选中主题 {selected_idx}：{target_theme['name']} ===")
     
            print("正在提取图片URL...")
            theme_pic_urls = get_pic_urls(session, target_theme['detail_url'])
            if not theme_pic_urls:
                print(f"  &#9888;&#65039; 未提取到任何图片URL，跳过该主题")
                continue
     
            print(f"共提取到{len(theme_pic_urls)}张图片，开始下载...")
            success_count = 0
            for pic_idx, pic_url in enumerate(theme_pic_urls, start=1):
                pic_save_name = f"{pic_idx}.jpg"
                if download_single_pic(session, pic_url, pic_save_name, target_theme['save_dir'],
                                       target_theme['detail_url']):
                    success_count += 1
     
            print(
                f"主题{selected_idx}下载完成：成功{success_count}/{len(theme_pic_urls)}张 | 保存目录：{target_theme['save_dir']}")
     
    print("\n===== 所有选中主题的下载任务已全部完成！=====")
  
  
def download_theme_pics(session: requests.Session, theme_pic_urls: list, save_dir: str, referer: str, max_workers: int = 3) -> int:
    """
    批量下载主题图片
     
    Args:
        session: requests会话
        theme_pic_urls: 图片URL列表
        save_dir: 保存目录
        referer: 引用页URL
        max_workers: 最大并发下载数
         
    Returns:
        成功下载的图片数量
    """
    success_count = 0
    total_pics = len(theme_pic_urls)
     
    print(f"共提取到{total_pics}张图片，开始批量下载（并发数：{max_workers}）...")
     
    # 创建保存目录
    os.makedirs(save_dir, exist_ok=True)
     
    # 使用线程池进行批量下载
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 创建下载任务
        future_to_pic = {
            executor.submit(
                download_single_pic, 
                session, 
                pic_url, 
                f"{pic_idx}.jpg", 
                save_dir, 
                referer
            ): pic_idx for pic_idx, pic_url in enumerate(theme_pic_urls, start=1)
        }
         
        # 处理完成的下载任务
        for future in as_completed(future_to_pic):
            pic_idx = future_to_pic[future]
            try:
                result = future.result()
                if result:
                    success_count += 1
            except Exception as e:
                print(f"  &#10060; 图片{pic_idx}下载异常：{str(e)}")
     
    print(f"批量下载完成：成功{success_count}/{total_pics}张 | 保存目录：{save_dir}")
    return success_count
 
 
def batch_download_themes(session: requests.Session, theme_list: list, selected_indices: list, max_workers: int = 3):
    """
    批量下载多个主题的图片
     
    Args:
        session: requests会话
        theme_list: 主题列表
        selected_indices: 选中的主题索引列表
        max_workers: 每个主题的最大并发下载数
    """
    print(f"\n===== 开始批量下载选中的{len(selected_indices)}个主题图片 =====")
     
    total_success = 0
    total_pics = 0
     
    for selected_idx in selected_indices:
        target_theme = theme_list[selected_idx - 1]
        print(f"\n=== 正在处理选中主题 {selected_idx}：{target_theme['name']} ===")
         
        print("正在提取图片URL...")
        theme_pic_urls = get_pic_urls(session, target_theme['detail_url'])
        if not theme_pic_urls:
            print(f"  &#9888;&#65039; 未提取到任何图片URL，跳过该主题")
            continue
         
        current_pics = len(theme_pic_urls)
        total_pics += current_pics
         
        # 批量下载当前主题的图片
        success_count = download_theme_pics(
            session, 
            theme_pic_urls, 
            target_theme['save_dir'], 
            target_theme['detail_url'],
            max_workers
        )
        total_success += success_count
         
        # 主题间添加延迟，避免请求过快
        if selected_idx != selected_indices[-1]:  # 不是最后一个主题
            print(f"主题{selected_idx}处理完成，等待后继续下一个主题...")
            time.sleep(random.uniform(2.0, 4.0))
     
    print(f"\n===== 批量下载完成！总计：成功{total_success}/{total_pics}张图片 =====")
 
 
if __name__ == "__main__":
    main()
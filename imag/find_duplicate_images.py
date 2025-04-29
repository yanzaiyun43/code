import os
import hashlib

def calculate_md5(file_path):
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def find_duplicate_images(directory):
    md5_dict = {}
    for root, dirs, files in os.walk(directory):
        for file in files:
            file_path = os.path.join(root, file)
            try:
                # 检查文件是否为图片文件，可根据需要添加更多扩展名
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif')):
                    md5 = calculate_md5(file_path)
                    if md5 in md5_dict:
                        md5_dict[md5].append(file_path)
                    else:
                        md5_dict[md5] = [file_path]
            except Exception as e:
                print(f"处理文件 {file_path} 时出错: {e}")

    duplicate_images = {k: v for k, v in md5_dict.items() if len(v) > 1}
    return duplicate_images

if __name__ == "__main__":
    # 替换为你要查找的目录
    target_directory = '.'  
    duplicates = find_duplicate_images(target_directory)
    if duplicates:
        print("找到重复图片:")
        for md5, paths in duplicates.items():
            print(f"MD5: {md5}")
            for path in paths:
                print(f"  - {path}")
    else:
        print("未找到重复图片。")
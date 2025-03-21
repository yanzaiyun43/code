import pyautogui
import pygetwindow
import random
import time
from pynput import keyboard
import threading

# 全局运行标志
running = True

def on_press(key):
    global running
    try:
        if key == keyboard.Key.esc:
            print('检测到ESC键，程序即将退出...')
            running = False
            return False  # 停止监听
    except AttributeError:
        pass

def move_mouse():
    while running:
        try:
            window = pygetwindow.getActiveWindow()
            if not window:
                print('当前没有活动窗口，等待中...')
                time.sleep(5)
                continue
            
            left, top = window.left, window.top
            width, height = window.width, window.height
            
            x = random.randint(left, left + width)
            y = random.randint(top, top + height)
            pyautogui.moveTo(x, y, duration=0.5)
            print(f'鼠标已移动到坐标({x}, {y})')
            time.sleep(30)
        except Exception as e:
            print(f'窗口检测异常: {str(e)}，继续运行...')
            time.sleep(5)

if __name__ == '__main__':
    # 启动键盘监听
    listener = keyboard.Listener(on_press=on_press)
    listener.start()

    print('程序已启动，按ESC键可退出...')
    move_mouse()

    # 等待监听线程结束
    listener.join()
    print('程序已正常退出')
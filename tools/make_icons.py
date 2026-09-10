"""生成 PWA 图标：暖橙色圆角底 + 深色爪印（一次性脚本，不参与构建）。"""
import os
from PIL import Image, ImageDraw

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PROJECT_DIR, "public")
BG = (255, 138, 61, 255)          # 暖橙底色
PAD = (255, 255, 255, 255)        # 白色爪印
SUPERSAMPLE = 4                   # 超采样倍数，保证边缘平滑


def draw_paw(size: int) -> Image.Image:
    """在 size x size 画布上画圆角底 + 爪印，先超采样再缩放抗锯齿。"""
    big = size * SUPERSAMPLE
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 圆角矩形底（半径约为边长的 22%）
    radius = int(big * 0.22)
    d.rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=BG)

    # 爪印：1 个大掌垫 + 4 个小趾垫，整体居中
    unit = big / 100.0

    def u(v):
        return v * unit

    # 掌垫（椭圆）
    palm_cx, palm_cy, palm_rx, palm_ry = u(50), u(63), u(22), u(18)
    d.ellipse(
        [palm_cx - palm_rx, palm_cy - palm_ry, palm_cx + palm_rx, palm_cy + palm_ry],
        fill=PAD,
    )

    # 四个趾垫（椭圆，左右对称，外侧略低）
    toes = [
        (u(26), u(40), u(8.5), u(10.5)),
        (u(41), u(27), u(8.5), u(11.5)),
        (u(59), u(27), u(8.5), u(11.5)),
        (u(74), u(40), u(8.5), u(10.5)),
    ]
    for cx, cy, rx, ry in toes:
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=PAD)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (192, 512):
        path = os.path.join(OUT_DIR, "icon-%d.png" % size)
        draw_paw(size).save(path, "PNG")
        print("written:", path)


if __name__ == "__main__":
    main()

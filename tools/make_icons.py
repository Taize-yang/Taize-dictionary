from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "web" / "public"
OUT = PUBLIC / "icons"
OUT.mkdir(parents=True, exist_ok=True)

src = Image.open(PUBLIC / "logo-dark.png").convert("RGBA")
alpha = src.getchannel("A")
bbox = alpha.getbbox()
logo = src.crop(bbox)

BG = (177, 58, 34, 255)  # brand vermilion #b13a22
CLEAR = (0, 0, 0, 0)


def make_icon(size: int, scale: float, filename: str):
    canvas = Image.new("RGBA", (size, size), BG)
    target = max(1, int(round(size * scale)))
    w, h = logo.size
    ratio = min(target / w, target / h)
    nw, nh = max(1, int(round(w * ratio))), max(1, int(round(h * ratio)))
    scaled = logo.resize((nw, nh), Image.LANCZOS)
    canvas.alpha_composite(scaled, ((size - nw) // 2, (size - nh) // 2))
    canvas.convert("RGB").save(OUT / filename, optimize=True)
    print(filename, size, f"logo {nw}x{nh}")


# Standard icons: logo fills ~72% of the square, leaving breathing room for iOS masking.
for size, name, scale in [
    (1024, "icon-1024.png", 0.72),
    (512, "icon-512.png", 0.72),
    (192, "icon-192.png", 0.72),
    (180, "apple-touch-icon-180.png", 0.72),
    (167, "apple-touch-icon-167.png", 0.72),
    (152, "apple-touch-icon-152.png", 0.72),
    (120, "apple-touch-icon-120.png", 0.72),
    (32, "icon-32.png", 0.78),
    (16, "icon-16.png", 0.82),
]:
    make_icon(size, scale, name)

# Maskable icon: logo within the inner safe zone (~55%).
make_icon(512, 0.55, "icon-512-maskable.png")

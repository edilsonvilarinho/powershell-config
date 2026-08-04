from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

size = 256
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((12, 12, 244, 244), radius=42, fill="#0a0a0a", outline="#4b4646", width=5)
draw.rounded_rectangle((34, 50, 222, 206), radius=18, fill="#161616", outline="#343030", width=3)

try:
    prompt_font = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 64)
    small_font = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 34)
except OSError:
    prompt_font = ImageFont.load_default(size=64)
    small_font = ImageFont.load_default(size=34)

draw.text((52, 77), ">", font=prompt_font, fill="#fab283")
draw.rounded_rectangle((111, 142, 190, 154), radius=6, fill="#7fd88f")
draw.text((47, 162), "PS", font=small_font, fill="#9d7cd8")
draw.ellipse((190, 166, 207, 183), fill="#56b6c2")

png_path = ASSETS / "icon.png"
ico_path = ASSETS / "icon.ico"
image.save(png_path, "PNG")
image.save(ico_path, "ICO", sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(png_path)
print(ico_path)

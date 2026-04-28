#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


BG = "#05050d"
PANEL = "#11111f"
BORDER = "#2b2b48"
TEXT = "#ff9900"
SUBTEXT = "#9999cc"


def fit_icon(image: Image.Image, box_size: int) -> Image.Image:
    icon = image.convert("RGBA")
    icon.thumbnail((box_size, box_size), Image.Resampling.LANCZOS)
    tile = Image.new("RGBA", (box_size, box_size), PANEL)
    x = (box_size - icon.width) // 2
    y = (box_size - icon.height) // 2
    tile.alpha_composite(icon, (x, y))
    return tile


def blown_up(image: Image.Image, target_size: int) -> Image.Image:
    return image.resize((target_size, target_size), Image.Resampling.NEAREST)


def main() -> int:
    if len(sys.argv) != 2:
      print("Usage: review-teamforge-dock-icons.py <batch-dir>", file=sys.stderr)
      return 1

    batch_dir = Path(sys.argv[1]).expanduser().resolve()
    if not batch_dir.is_dir():
      print(f"Batch directory not found: {batch_dir}", file=sys.stderr)
      return 1

    icons = sorted(batch_dir.glob("dock-icon-variant-*.png"))
    if not icons:
      print(f"No dock icon variants found in: {batch_dir}", file=sys.stderr)
      return 1

    font = ImageFont.load_default()
    row_height = 248
    board_width = 1100
    board_height = 48 + row_height * len(icons)
    board = Image.new("RGBA", (board_width, board_height), BG)
    draw = ImageDraw.Draw(board)

    draw.text((24, 18), "TEAMFORGE DOCK ICON READABILITY REVIEW", fill=TEXT, font=font)

    for index, icon_path in enumerate(icons):
      y = 48 + index * row_height
      row = Image.new("RGBA", (board_width - 32, row_height - 16), PANEL)
      row_draw = ImageDraw.Draw(row)
      row_draw.rectangle((0, 0, row.width - 1, row.height - 1), outline=BORDER, width=1)

      image = Image.open(icon_path).convert("RGBA")
      label = icon_path.stem.upper()

      row_draw.text((16, 12), label, fill=TEXT, font=font)
      row_draw.text((16, 30), "ORIGINAL", fill=SUBTEXT, font=font)
      original = fit_icon(image, 160)
      row.alpha_composite(original, (16, 48))

      sizes = [64, 32, 16]
      x_positions = [240, 500, 760]
      for size, x in zip(sizes, x_positions):
        resized = image.resize((size, size), Image.Resampling.LANCZOS)
        actual_tile = Image.new("RGBA", (96, 96), PANEL)
        ax = (96 - resized.width) // 2
        ay = (96 - resized.height) // 2
        actual_tile.alpha_composite(resized, (ax, ay))
        blown = blown_up(resized, 128)

        row_draw.text((x, 12), f"{size}px", fill=TEXT, font=font)
        row_draw.text((x, 30), "ACTUAL", fill=SUBTEXT, font=font)
        row.alpha_composite(actual_tile, (x, 48))
        row_draw.text((x + 116, 30), "ZOOM", fill=SUBTEXT, font=font)
        row.alpha_composite(blown, (x + 116, 32))

      board.alpha_composite(row, (16, y))

    out_path = batch_dir / "teamforge-dock-icon-review-board.png"
    board.save(out_path)
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

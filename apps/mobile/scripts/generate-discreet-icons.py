"""Gera os ícones discretos (disfarces) do app — arte original, sem marcas.

Uso (a partir de apps/mobile):
    python scripts/generate-discreet-icons.py

Saída (commitada no repositório, então o build não depende de Python):
    assets/discreet-icons/<chave>/
        preview.png            256px  — prévia dentro do app (seletor)
        ios-120.png / ios-180.png          iPhone  (60pt @2x/@3x)
        ios-152.png / ios-167.png          iPad    (76pt @2x, 83.5pt @2x)
        android-foreground.png / android-background.png / android-monochrome.png
                               432px — camadas do ícone adaptativo (108dp @4x)
        legacy-{48,72,96,144,192}.png      Android < 8 (sem ícone adaptativo)
    assets/icon.png + assets/android-icon-*.png  — ícone padrão do app (= disfarce padrão)

A lista de chaves/cores/nomes vive em src/appearance/discreetIcons.json.
"""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CATALOG = json.loads((ROOT / "src/appearance/discreetIcons.json").read_text("utf-8"))
OUT = ROOT / "assets/discreet-icons"

WORK = 2048  # supersampling: desenha grande e reduz com LANCZOS
ADAPTIVE_GLYPH = 0.60  # fração do canvas adaptativo (zona segura ~66%)
FULL_GLYPH = 0.68  # iOS / legado (sem zona segura)

WHITE = (255, 255, 255, 255)


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)


class Glyph:
    """Desenha em coordenadas normalizadas 0..1 dentro de uma caixa centrada.

    Modos de `m` por forma (comportamento no layer monocromático):
      fill  -> cor normal / branco no mono
      cut   -> cor normal / buraco (transparente) no mono
      halo  -> ignorado na cor / buraco no mono (separa formas sobrepostas)
      color -> só na cor / ignorado no mono
    """

    def __init__(self, canvas: int, glyph_fraction: float, mono: bool):
        self.mono = mono
        self.img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.box = canvas * glyph_fraction
        self.off = (canvas - self.box) / 2

    def _p(self, v: float, axis_off: float = 0.0) -> float:
        return self.off + v * self.box

    def _s(self, v: float) -> float:
        return v * self.box

    def _paint(self, m: str, color: tuple[int, int, int, int]):
        if not self.mono:
            return None if m == "halo" else color
        if m == "fill":
            return WHITE
        if m in ("cut", "halo"):
            return (0, 0, 0, 0)
        return None

    def rr(self, x0, y0, x1, y1, r, color, m="fill"):
        paint = self._paint(m, color)
        if paint is None:
            return
        self.d.rounded_rectangle(
            [self._p(x0), self._p(y0), self._p(x1), self._p(y1)],
            radius=self._s(r),
            fill=paint,
        )

    def circle(self, cx, cy, r, color, m="fill"):
        paint = self._paint(m, color)
        if paint is None:
            return
        self.d.ellipse(
            [self._p(cx - r), self._p(cy - r), self._p(cx + r), self._p(cy + r)],
            fill=paint,
        )

    def line(self, x0, y0, x1, y1, width, color, m="fill"):
        paint = self._paint(m, color)
        if paint is None:
            return
        self.d.line(
            [self._p(x0), self._p(y0), self._p(x1), self._p(y1)],
            fill=paint,
            width=round(self._s(width)),
        )
        for x, y in ((x0, y0), (x1, y1)):  # pontas arredondadas
            self.circle(x, y, width / 2, color, m)

    def arc(self, cx, cy, r, start_deg, end_deg, width, color, m="fill"):
        paint = self._paint(m, color)
        if paint is None:
            return
        outer = r + width / 2  # PIL desenha o traço para dentro da caixa
        self.d.arc(
            [
                self._p(cx - outer),
                self._p(cy - outer),
                self._p(cx + outer),
                self._p(cy + outer),
            ],
            start=start_deg,
            end=end_deg,
            fill=paint,
            width=round(self._s(width)),
        )
        for deg in (start_deg, end_deg):
            rad = math.radians(deg)
            self.circle(
                cx + r * math.cos(rad),
                cy + r * math.sin(rad),
                width / 2,
                color,
                m,
            )

    def ring(self, cx, cy, r, width, color, m="fill"):
        paint = self._paint(m, color)
        if paint is None:
            return
        outer = r + width / 2
        self.d.ellipse(
            [
                self._p(cx - outer),
                self._p(cy - outer),
                self._p(cx + outer),
                self._p(cy + outer),
            ],
            outline=paint,
            width=round(self._s(width)),
        )


# --------------------------------------------------------------------------
# Glifos (um por chave do catálogo)
# --------------------------------------------------------------------------


def glyph_calculator(g: Glyph):
    g.rr(0.16, 0.04, 0.84, 0.96, 0.10, rgba("#F2F2F4"))
    g.rr(0.24, 0.12, 0.76, 0.31, 0.04, rgba("#2A2C31"), "cut")
    key_w, key_h, gap_x, gap_y = 0.105, 0.095, 0.0333, 0.033
    for row in range(4):
        for col in range(4):
            x = 0.24 + col * (key_w + gap_x)
            y = 0.39 + row * (key_h + gap_y)
            color = rgba("#FF9F0A") if col == 3 else rgba("#8E9099")
            g.rr(x, y, x + key_w, y + key_h, 0.025, color, "cut")


def glyph_notes(g: Glyph):
    g.rr(0.14, 0.04, 0.86, 0.96, 0.07, rgba("#FFFFFF"))
    g.rr(0.26, 0.16, 0.62, 0.225, 0.03, rgba("#D9A21B"), "cut")
    for i, end in enumerate((0.74, 0.74, 0.74, 0.55)):
        y = 0.32 + i * 0.14
        g.rr(0.26, y, end, y + 0.045, 0.0225, rgba("#E6C66A"), "cut")


def glyph_weather(g: Glyph):
    sun_x, sun_y = 0.64, 0.33
    g.circle(sun_x, sun_y, 0.15, rgba("#FFC933"))
    for i in range(8):
        a = math.radians(i * 45)
        g.line(
            sun_x + 0.21 * math.cos(a),
            sun_y + 0.21 * math.sin(a),
            sun_x + 0.28 * math.cos(a),
            sun_y + 0.28 * math.sin(a),
            0.045,
            rgba("#FFC933"),
        )

    def cloud(grow: float, color, m):
        g.rr(0.08 - grow, 0.58 - grow, 0.90 + grow, 0.88 + grow, 0.15 + grow, color, m)
        g.circle(0.34, 0.59, 0.17 + grow, color, m)
        g.circle(0.58, 0.54, 0.21 + grow, color, m)

    cloud(0.035, rgba("#FFFFFF"), "halo")
    cloud(0.0, rgba("#FFFFFF"), "fill")


def glyph_calendar(g: Glyph):
    g.rr(0.12, 0.10, 0.88, 0.92, 0.09, rgba("#FFFFFF"))
    g.rr(0.12, 0.10, 0.88, 0.36, 0.09, rgba("#E5484D"))
    g.rr(0.12, 0.26, 0.88, 0.36, 0.0, rgba("#E5484D"))
    g.rr(0.12, 0.355, 0.88, 0.378, 0.0, rgba("#FFFFFF"), "halo")
    for x in (0.30, 0.62):
        g.rr(x, 0.03, x + 0.08, 0.17, 0.04, rgba("#C93A3F"))
    size, gap = 0.11, 0.045
    start_x = 0.5 - (4 * size + 3 * gap) / 2
    for row in range(3):
        for col in range(4):
            x = start_x + col * (size + gap)
            y = 0.46 + row * (size + gap)
            color = rgba("#E5484D") if (row, col) == (1, 2) else rgba("#5B6270")
            g.rr(x, y, x + size, y + size, 0.025, color, "cut")


def glyph_cycle(g: Glyph):
    g.ring(0.5, 0.5, 0.34, 0.11, rgba("#FFFFFF", 80), "color")
    g.arc(0.5, 0.5, 0.34, -70, 220, 0.11, rgba("#FFFFFF"))
    g.circle(0.5, 0.5, 0.11, rgba("#FFFFFF"))


def glyph_clock(g: Glyph):
    g.circle(0.5, 0.5, 0.44, rgba("#1F2023"))
    for i in range(12):
        a = math.radians(i * 30)
        inner, outer = (0.34, 0.39) if i % 3 == 0 else (0.37, 0.39)
        g.line(
            0.5 + inner * math.cos(a),
            0.5 + inner * math.sin(a),
            0.5 + outer * math.cos(a),
            0.5 + outer * math.sin(a),
            0.03,
            rgba("#9A9CA3"),
            "cut" if i % 3 == 0 else "color",
        )
    g.line(0.5, 0.5, 0.5 + 0.20 * math.cos(math.radians(-60)),
           0.5 + 0.20 * math.sin(math.radians(-60)), 0.055, rgba("#F5F5F7"), "cut")
    g.line(0.5, 0.5, 0.5 + 0.30 * math.cos(math.radians(30)),
           0.5 + 0.30 * math.sin(math.radians(30)), 0.04, rgba("#F5F5F7"), "cut")
    g.circle(0.5, 0.5, 0.035, rgba("#FF9F0A"), "cut")


GLYPHS = {
    "calculator": glyph_calculator,
    "notes": glyph_notes,
    "weather": glyph_weather,
    "calendar": glyph_calendar,
    "cycle": glyph_cycle,
    "clock": glyph_clock,
}


# --------------------------------------------------------------------------
# Composição
# --------------------------------------------------------------------------


def gradient(size: int, top: str, bottom: str) -> Image.Image:
    mask = Image.linear_gradient("L").resize((size, size), Image.BILINEAR)
    a = Image.new("RGBA", (size, size), rgba(top))
    b = Image.new("RGBA", (size, size), rgba(bottom))
    return Image.composite(b, a, mask)


def render_glyph(key: str, fraction: float, mono: bool) -> Image.Image:
    g = Glyph(WORK, fraction, mono)
    GLYPHS[key](g)
    return g.img


def downscale(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


def rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    big = size * 4
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, big - 1, big - 1], radius=int(big * radius_ratio), fill=255
    )
    return mask.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)


def build_icon(entry: dict):
    key = entry["key"]
    top, bottom = entry["background"]
    out = OUT / key
    if out.exists():
        shutil.rmtree(out)

    bg = gradient(WORK, top, bottom)
    full = Image.alpha_composite(bg, render_glyph(key, FULL_GLYPH, False))
    full_rgb = downscale(full, 1024).convert("RGB")  # iOS: sem alpha

    save(downscale(full, 256).convert("RGBA"), out / "preview.png")
    for size in (120, 180, 152, 167):
        save(full_rgb.resize((size, size), Image.LANCZOS), out / f"ios-{size}.png")

    ad_fg = downscale(render_glyph(key, ADAPTIVE_GLYPH, False), 432)
    ad_bg = downscale(bg, 432)
    ad_mono = downscale(render_glyph(key, ADAPTIVE_GLYPH, True), 432)
    save(ad_fg, out / "android-foreground.png")
    save(ad_bg.convert("RGB"), out / "android-background.png")
    save(ad_mono, out / "android-monochrome.png")

    for size in (48, 72, 96, 144, 192):
        legacy = downscale(full, size).convert("RGBA")
        legacy.putalpha(rounded_mask(size, 0.22))
        save(legacy, out / f"legacy-{size}.png")

    return full_rgb, ad_fg, ad_bg, ad_mono


def main():
    default_key = CATALOG["defaultKey"]
    default_assets = None
    for entry in CATALOG["icons"]:
        assets = build_icon(entry)
        if entry["key"] == default_key:
            default_assets = (entry, assets)
        print("ok", entry["key"])

    # Ícone "principal" do app (Expo: icon + adaptiveIcon) = disfarce padrão.
    assert default_assets, "defaultKey não encontrado no catálogo"
    entry, (full_rgb, fg, bg, mono) = default_assets
    save(full_rgb, ROOT / "assets/icon.png")
    big_fg = downscale(render_glyph(entry["key"], ADAPTIVE_GLYPH, False), 1024)
    big_bg = downscale(gradient(WORK, *entry["background"]), 1024).convert("RGB")
    big_mono = downscale(render_glyph(entry["key"], ADAPTIVE_GLYPH, True), 1024)
    save(big_fg, ROOT / "assets/android-icon-foreground.png")
    save(big_bg, ROOT / "assets/android-icon-background.png")
    save(big_mono, ROOT / "assets/android-icon-monochrome.png")
    save(downscale(Image.alpha_composite(
        gradient(WORK, *entry["background"]),
        render_glyph(entry["key"], FULL_GLYPH, False)), 48), ROOT / "assets/favicon.png")

    # Splash neutra: totalmente transparente (só a cor de fundo aparece).
    save(Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)), ROOT / "assets/splash-icon.png")


if __name__ == "__main__":
    main()

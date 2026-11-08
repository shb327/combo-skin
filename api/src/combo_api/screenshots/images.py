"""Checking uploaded PNGs, the watermark, and the WebP versions made from an original."""

import io
import struct
import zlib
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Every screenshot is this size; the job tells the worker.
IMAGE_WIDTH = 1920
IMAGE_HEIGHT = 1080
MAX_BYTES = 16 * 1024 * 1024
# Public versions, narrowest first.
WIDTHS = (640, 1280, 1920)
WEBP_QUALITY = 82
# Raised when the watermark changes; `rebuild` then remakes every version.
WATERMARK_REVISION = 1

MARK = "combo.skin"
FONT = Path(__file__).with_name("fonts") / "Montserrat-SemiBold.ttf"
TEXT_FILL = (255, 255, 255, 180)
SHADOW_ALPHA = 110

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# 8 bits per channel: 2 is RGB, 6 is RGBA.
COLOR_TYPES = {2, 6}


class Refused(ValueError):
    """An upload that is refused, with the error code the API answers."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Version:
    width: int
    height: int
    data: bytes


def check_png(data: bytes, width: int, height: int) -> None:
    """Refuse anything but an 8-bit RGB or RGBA PNG of exactly this size, from its signature
    and header alone, before any pixel is decoded."""
    if len(data) < 33 or not data.startswith(PNG_SIGNATURE) or data[12:16] != b"IHDR":
        raise Refused("not_png")
    header = data[16:29]
    if (
        struct.unpack(">I", data[8:12])[0] != 13
        or zlib.crc32(data[12:29]) != struct.unpack(">I", data[29:33])[0]
    ):
        raise Refused("not_png")
    found_width, found_height, bit_depth, color_type = struct.unpack(">IIBB", header[:10])
    if (found_width, found_height) != (width, height):
        raise Refused("wrong_size")
    if bit_depth != 8 or color_type not in COLOR_TYPES:
        raise Refused("bad_pixel_format")


def decode(data: bytes) -> Image.Image:
    """Decode every pixel, then flatten onto black as RGB. Pillow's decompression-bomb guard
    stays on."""
    try:
        with Image.open(io.BytesIO(data), formats=["PNG"]) as image:
            image.load()
            if image.mode == "RGBA":
                flat = Image.new("RGB", image.size, (0, 0, 0))
                flat.paste(image, mask=image.getchannel("A"))
                return flat
            if image.mode != "RGB":
                raise Refused("bad_pixel_format")
            # A copy holds the pixels only: no text chunks, EXIF or colour profile.
            return Image.frombytes("RGB", image.size, image.tobytes())
    except Refused:
        raise
    except OSError, SyntaxError, ValueError, Image.DecompressionBombError, zlib.error:
        raise Refused("not_png") from None


@cache
def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def watermark(image: Image.Image) -> Image.Image:
    """`combo.skin` in the bottom-right corner: white at alpha 180 over a soft black shadow,
    sized and placed in proportion to the width."""
    width, height = image.size
    size = max(16, round(0.022 * width))
    margin = round(0.02 * width)
    face = font(size)
    _, _, right, bottom = face.getbbox(MARK)
    x, y = width - margin - right, height - margin - bottom
    offset = size / 20

    shadow = Image.new("L", image.size, 0)
    ImageDraw.Draw(shadow).text((x + offset, y + offset), MARK, font=face, fill=SHADOW_ALPHA)
    shadow = shadow.filter(ImageFilter.GaussianBlur(size / 10))
    marked = image.convert("RGBA")
    dark = Image.new("RGBA", image.size, (0, 0, 0, 0))
    dark.putalpha(shadow)
    marked = Image.alpha_composite(marked, dark)
    text = Image.new("RGBA", image.size, (255, 255, 255, 0))
    ImageDraw.Draw(text).text((x, y), MARK, font=face, fill=TEXT_FILL)
    return Image.alpha_composite(marked, text).convert("RGB")


def versions(image: Image.Image) -> list[Version]:
    """The watermarked WebP versions of a decoded original, narrowest first. They are encoded
    from pixels only, so no metadata or colour profile is carried over."""
    made = []
    for width in WIDTHS:
        height = round(image.height * width / image.width)
        scaled = image if width == image.width else image.resize((width, height), Image.LANCZOS)
        buffer = io.BytesIO()
        watermark(scaled).save(buffer, format="WEBP", quality=WEBP_QUALITY, method=4)
        made.append(Version(width, height, buffer.getvalue()))
    return made

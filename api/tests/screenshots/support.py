"""PNG files made in tests."""

import io
import struct
import zlib

from PIL import Image, PngImagePlugin


def png(width: int = 1920, height: int = 1080, mode: str = "RGB", **save: object) -> bytes:
    """A PNG of a gradient, so versions and watermarks have something to work on."""
    image = Image.linear_gradient("L").resize((width, height)).convert(mode)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", **save)
    return buffer.getvalue()


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def png_header_only(width: int, height: int, bit_depth: int = 8, color_type: int = 2) -> bytes:
    """A PNG signature and header claiming a size, with a tiny image body that does not match."""
    header = struct.pack(">IIBBBBB", width, height, bit_depth, color_type, 0, 0, 0)
    body = zlib.compress(b"\x00" * 4)
    return (
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", body) + chunk(b"IEND", b"")
    )


def png_16_bit(width: int = 1920, height: int = 1080) -> bytes:
    """A valid 16-bit RGB PNG, written by hand since Pillow does not write 16-bit RGB."""
    header = struct.pack(">IIBBBBB", width, height, 16, 2, 0, 0, 0)
    row = b"\x00" + b"\x40\x00" * 3 * width
    body = zlib.compress(row * height, 1)
    return (
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", body) + chunk(b"IEND", b"")
    )


def png_with_metadata() -> bytes:
    """A 1920 by 1080 PNG carrying EXIF, XMP and a text chunk."""
    exif = Image.Exif()
    exif[0x010E] = "placeholder description"
    info = PngImagePlugin.PngInfo()
    info.add_text("XML:com.adobe.xmp", "<x:xmpmeta>placeholder</x:xmpmeta>")
    info.add_text("Comment", "placeholder comment")
    return png(exif=exif.tobytes(), pnginfo=info)

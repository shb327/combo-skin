import io

import pytest
from PIL import Image

from combo_api.screenshots.images import Refused, check_png, decode, versions
from tests.screenshots.support import png, png_16_bit, png_header_only, png_with_metadata


def test_a_1920_png_is_accepted() -> None:
    data = png()
    check_png(data, 1920, 1080)
    image = decode(data)
    assert (image.size, image.mode) == ((1920, 1080), "RGB")


def test_rgba_is_flattened_onto_black() -> None:
    image = Image.new("RGBA", (1920, 1080), (255, 255, 255, 0))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    check_png(buffer.getvalue(), 1920, 1080)
    decoded = decode(buffer.getvalue())
    assert decoded.mode == "RGB"
    assert decoded.getpixel((10, 10)) == (0, 0, 0)


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (b"", "not_png"),
        (b"\xff\xd8\xff\xe0" + b"\x00" * 100, "not_png"),
        (png(1280, 720), "wrong_size"),
        (png_header_only(50_000, 50_000), "wrong_size"),
        (png_16_bit(), "bad_pixel_format"),
        (png(mode="L"), "bad_pixel_format"),
        (png(mode="P"), "bad_pixel_format"),
    ],
)
def test_refused_before_decoding(data: bytes, code: str) -> None:
    with pytest.raises(Refused) as refused:
        check_png(data, 1920, 1080)
    assert refused.value.code == code


def test_jpeg_body_is_not_png() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (1920, 1080)).save(buffer, format="JPEG")
    with pytest.raises(Refused) as refused:
        check_png(buffer.getvalue(), 1920, 1080)
    assert refused.value.code == "not_png"


def test_truncated_png_is_not_png() -> None:
    data = png()
    check_png(data[: len(data) // 2], 1920, 1080)
    with pytest.raises(Refused) as refused:
        decode(data[: len(data) // 2])
    assert refused.value.code == "not_png"


def test_a_header_lying_about_the_body_is_not_png() -> None:
    data = png_header_only(1920, 1080)
    check_png(data, 1920, 1080)
    with pytest.raises(Refused) as refused:
        decode(data)
    assert refused.value.code == "not_png"


def test_versions_are_webp_without_metadata() -> None:
    source = decode(png_with_metadata())
    made = versions(source)
    assert [(v.width, v.height) for v in made] == [(640, 360), (1280, 720), (1920, 1080)]
    for version in made:
        image = Image.open(io.BytesIO(version.data))
        assert image.format == "WEBP"
        assert image.size == (version.width, version.height)
        assert not image.getexif()
        assert not {"exif", "xmp", "icc_profile"} & set(image.info)
        assert b"EXIF" not in version.data[:4096] and b"XMP " not in version.data[:4096]

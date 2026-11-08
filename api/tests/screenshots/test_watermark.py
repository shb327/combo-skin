from pathlib import Path

import pytest
from PIL import Image, ImageChops

from combo_api.screenshots import images
from combo_api.screenshots.images import LOGO, watermark

GREY = 128
API = Path(__file__).parents[2]


@pytest.mark.parametrize(
    ("width", "height", "box"),
    [
        (1920, 1080, (1660, 971, 1880, 1048)),
        (1280, 720, (1106, 648, 1253, 699)),
        (640, 360, (554, 324, 627, 349)),
    ],
)
def test_logo_sits_in_its_box_in_the_bottom_right_corner(
    width: int, height: int, box: tuple[int, int, int, int]
) -> None:
    plain = Image.new("RGB", (width, height), (GREY,) * 3)
    marked = watermark(plain)
    assert marked.size == plain.size
    assert marked.mode == "RGB"
    changed = ImageChops.difference(marked, plain).getbbox()
    assert changed is not None
    left, top, right, bottom = changed
    assert left >= box[0]
    assert top >= box[1]
    assert right <= box[2]
    assert bottom <= box[3]
    # 40 px from the right and 32 px from the bottom at 1920, scaled with the width.
    assert right <= width - round(40 * width / 1920)
    assert bottom <= height - round(32 * width / 1920)


def test_logo_is_white_at_sixty_percent_opacity() -> None:
    plain = Image.new("RGB", (1920, 1080), (GREY,) * 3)
    marked = watermark(plain)
    with Image.open(LOGO) as logo:
        alpha = logo.getchannel("A").resize((220, 77), Image.Resampling.LANCZOS)
    # Nothing is darkened: no shadow or outline.
    assert ImageChops.difference(ImageChops.darker(marked, plain), plain).getbbox() is None
    # Outside the logo's box nothing changes (the box test); inside, each pixel is lifted
    # towards white by 60% of the logo's alpha.
    worst = 0.0
    for y in range(77):
        for x in range(220):
            a = alpha.getpixel((x, y))
            pixel = marked.getpixel((1660 + x, 971 + y))
            assert isinstance(a, int)
            assert isinstance(pixel, tuple)
            expected = GREY + 0.6 * a * (255 - GREY) / 255
            worst = max(worst, *(abs(value - expected) for value in pixel))
    assert worst <= 2


def test_logo_file_is_white_rgba() -> None:
    with Image.open(LOGO) as logo:
        assert logo.size == (1044, 364)
        assert logo.mode == "RGBA"
        pixels = logo.tobytes()
    colours = {pixels[i : i + 3] for i in range(0, len(pixels), 4) if pixels[i + 3] > 0}
    assert colours == {b"\xff\xff\xff"}


def test_watermark_revision_is_raised_and_the_font_is_gone() -> None:
    assert images.WATERMARK_REVISION == 2
    fonts = [path for path in API.rglob("*.ttf") if ".venv" not in path.relative_to(API).parts]
    assert fonts == []

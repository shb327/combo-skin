import pytest
from PIL import Image, ImageChops

from combo_api.screenshots.images import watermark

GREY = (128, 128, 128)


@pytest.mark.parametrize(
    ("width", "height", "box", "clear"),
    [(1920, 1080, (300, 80), 20), (640, 360, (110, 30), 0)],
)
def test_mark_stays_in_the_bottom_right_corner(
    width: int, height: int, box: tuple[int, int], clear: int
) -> None:
    plain = Image.new("RGB", (width, height), GREY)
    marked = watermark(plain)
    assert marked.size == plain.size
    assert marked.mode == "RGB"
    changed = ImageChops.difference(marked, plain).getbbox()
    assert changed is not None
    left, top, right, bottom = changed
    assert left >= width - box[0]
    assert top >= height - box[1]
    assert right <= width - clear
    assert bottom <= height - clear


def test_mark_is_light_text_over_a_dark_shadow() -> None:
    plain = Image.new("RGB", (1920, 1080), GREY)
    low, high = watermark(plain).crop((1600, 990, 1920, 1080)).getchannel("R").getextrema()
    assert high > 200
    assert low < 100


def test_mark_scales_with_the_width() -> None:
    sizes = []
    for width in (640, 1280, 1920):
        plain = Image.new("RGB", (width, width * 9 // 16), GREY)
        box = ImageChops.difference(watermark(plain), plain).getbbox()
        assert box is not None
        sizes.append(box[2] - box[0])
    assert sizes[0] < sizes[1] < sizes[2]

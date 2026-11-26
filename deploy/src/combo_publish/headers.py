"""The site's `_headers` file for Pages, generated from the settings (spec 021, R18 to R20)."""

from combo_publish.settings import SiteOrigins

GAME_IMAGE_ORIGIN = "https://community.akamai.steamstatic.com"
ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com"
ANALYTICS_BEACON = "https://cloudflareinsights.com"
IMMUTABLE = "public, max-age=31536000, immutable"


def csp(settings: SiteOrigins) -> str:
    return "; ".join(
        [
            "default-src 'none'",
            f"script-src 'self' {ANALYTICS_SCRIPT}",
            "style-src 'self'",
            f"img-src 'self' {settings.image_origin} {GAME_IMAGE_ORIGIN}",
            "font-src 'self'",
            f"connect-src 'self' {ANALYTICS_BEACON}",
            f"frame-src {settings.viewer_origin}",
            "manifest-src 'self'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
        ]
    )


def every_response(settings: SiteOrigins) -> dict[str, str]:
    """The headers of R18, which the smoke test also checks."""
    return {
        "Content-Security-Policy": csp(settings),
        "Strict-Transport-Security": "max-age=31536000",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": (
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)"
        ),
        "Cross-Origin-Opener-Policy": "same-origin",
    }


def generate(settings: SiteOrigins) -> str:
    rules: list[tuple[str, dict[str, str]]] = [
        ("/*", every_response(settings)),
        # Vite's hashed files and fonts never change under the same name.
        ("/assets/*", {"Cache-Control": IMMUTABLE}),
        ("/fonts/*", {"Cache-Control": IMMUTABLE}),
        # Every pages.dev address, production and preview, stays out of search engines.
        ("https://:project.pages.dev/*", {"X-Robots-Tag": "noindex"}),
        ("https://:version.:project.pages.dev/*", {"X-Robots-Tag": "noindex"}),
    ]
    blocks = [
        "\n".join([path, *(f"  {name}: {value}" for name, value in headers.items())])
        for path, headers in rules
    ]
    return "\n\n".join(blocks) + "\n"


def rule_count(text: str) -> int:
    """The rules of a `_headers` file: its lines that start a path block."""
    return sum(
        1 for line in text.splitlines() if line.strip() and not line[0].isspace() and line[0] != "#"
    )

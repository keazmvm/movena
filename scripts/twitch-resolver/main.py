from __future__ import annotations

import sys
import re
from urllib.parse import parse_qs, urlsplit

from streamlink_cli.main import main as streamlink_main


STREAMLINK_VERSION = "8.5.0"
CHANNEL_PATTERN = re.compile(r"^[A-Za-z0-9_]{1,25}$")
RESERVED_PATHS = {
    "collections", "creatorcamp", "directory", "downloads", "inventory",
    "jobs", "login", "p", "products", "search", "settings", "signup",
    "store", "subscriptions", "team", "turbo", "videos", "wallet",
}


def _is_twitch_live_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    if host == "player.twitch.tv":
        query = parse_qs(parsed.query, keep_blank_values=True)
        channels = query.get("channel", [])
        return (
            "video" not in query
            and len(channels) == 1
            and CHANNEL_PATTERN.fullmatch(channels[0]) is not None
            and channels[0].lower() not in RESERVED_PATHS
        )
    if host not in {"twitch.tv", "www.twitch.tv", "m.twitch.tv", "go.twitch.tv"}:
        return False
    segments = [segment for segment in parsed.path.split("/") if segment]
    return (
        len(segments) == 1
        and CHANNEL_PATTERN.fullmatch(segments[0]) is not None
        and segments[0].lower() not in RESERVED_PATHS
    )


def _run_streamlink(arguments: list[str]) -> None:
    sys.argv = ["movena-twitch-resolver", *arguments]
    streamlink_main()


def main() -> int:
    arguments = sys.argv[1:]

    if arguments == ["--version"]:
        print(STREAMLINK_VERSION)
        return 0

    if len(arguments) == 2 and arguments[0] == "--can-handle-url":
        if not _is_twitch_live_url(arguments[1]):
            return 1
        _run_streamlink([
            "--no-config",
            "--no-plugin-sideloading",
            "--can-handle-url-no-redirect",
            arguments[1],
        ])
        return 0

    if len(arguments) != 1:
        print("usage: twitch-resolver <validated-twitch-live-url>", file=sys.stderr)
        return 2
    if not _is_twitch_live_url(arguments[0]):
        print("unsupported Twitch live-page URL", file=sys.stderr)
        return 2

    _run_streamlink([
        "--no-config",
        "--no-plugin-sideloading",
        "--loglevel=info",
        "--logformat=MOVENA|{name}|{levelname}|{message}",
        "--webbrowser-headless=yes",
        "--player-external-http",
        "--player-external-http-interface=127.0.0.1",
        "--player-external-http-port=0",
        "--player-external-http-continuous=no",
        "--twitch-supported-codecs=h264",
        arguments[0],
        "best",
    ])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

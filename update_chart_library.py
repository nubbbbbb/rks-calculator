#!/usr/bin/env python3
"""Refresh chart-library.js from the phigros.tools chart catalog."""

import argparse
import json
import math
import os
import re
import tempfile
from collections import Counter
from pathlib import Path
from urllib.parse import quote
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.etree import ElementTree


REPOSITORY = "ggmolly/phigros-tools"
LEVELS = ("EZ", "HD", "IN", "AT")
ROOT = Path(__file__).resolve().parent
DEFAULT_OUTPUT = ROOT / "chart-library.js"
USER_AGENT = "rks-calculator-chart-library-updater"


def fetch_bytes(url):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=30) as response:
            return response.read()
    except (HTTPError, URLError, TimeoutError) as error:
        raise RuntimeError(f"Could not fetch {url}: {error}") from error


def fetch_json(url):
    try:
        return json.loads(fetch_bytes(url))
    except (RuntimeError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise RuntimeError(f"Could not fetch valid JSON from {url}: {error}") from error


def resolve_commit(ref):
    if re.fullmatch(r"[0-9a-fA-F]{40}", ref):
        return ref.lower()

    url = f"https://github.com/{REPOSITORY}/commits/{ref}.atom"
    try:
        feed = ElementTree.fromstring(fetch_bytes(url))
    except ElementTree.ParseError as error:
        raise RuntimeError(f"Could not parse the GitHub commit feed for {ref!r}.") from error

    atom = "{http://www.w3.org/2005/Atom}"
    first_entry = feed.find(f"{atom}entry")
    entry_id = first_entry.findtext(f"{atom}id") if first_entry is not None else None
    match = re.search(r"Commit/([0-9a-fA-F]{40})$", entry_id or "")
    if not match:
        raise RuntimeError(f"GitHub did not provide a commit for ref {ref!r}.")
    return match.group(1).lower()


def build_library(source, commit):
    manifest = source.get("manifest")
    entries = source.get("songs")
    if not isinstance(manifest, dict) or not isinstance(entries, list) or not entries:
        raise RuntimeError("The downloaded catalog has an unexpected format.")

    game_version = manifest.get("gameVersion")
    source_revision = manifest.get("sourceRevision")
    if not isinstance(game_version, int) or not isinstance(source_revision, str):
        raise RuntimeError("The downloaded catalog is missing its version metadata.")

    title_counts = Counter(
        entry.get("title")
        for entry in entries
        if isinstance(entry, dict) and isinstance(entry.get("title"), str)
    )
    songs = []
    song_ids = set()

    for entry in entries:
        if not isinstance(entry, dict):
            raise RuntimeError("The catalog contains a malformed song entry.")

        song_id = entry.get("id")
        title = entry.get("title")
        artist = entry.get("artist")
        constants = entry.get("constants")
        if (
            not isinstance(song_id, str)
            or not song_id
            or not isinstance(title, str)
            or not title
            or not isinstance(artist, str)
            or not isinstance(constants, list)
            or len(constants) != len(LEVELS)
        ):
            raise RuntimeError("The catalog contains a song with invalid chart data.")
        if song_id in song_ids:
            raise RuntimeError(f"The catalog contains duplicate song ID {song_id!r}.")
        song_ids.add(song_id)

        charts = []
        for diff, constant in zip(LEVELS, constants):
            if constant is None:
                continue
            if (
                isinstance(constant, bool)
                or not isinstance(constant, (int, float))
                or not math.isfinite(constant)
                or constant <= 0
            ):
                raise RuntimeError(f"Invalid {diff} constant for {title!r}.")
            charts.append({"diff": diff, "constant": constant})
        if not charts:
            raise RuntimeError(f"The catalog song {title!r} has no charts.")

        duplicate_title = title_counts[title] > 1
        label = f"{title} ({artist})" if duplicate_title else title
        songs.append({
            "id": song_id,
            "name": title,
            "label": label,
            "scoreKey": label,
            "jacket": f"https://phigros.tools/covers/{quote(song_id, safe='')}.avif",
            "charts": charts,
        })

    labels = [song["label"] for song in songs]
    if len(set(labels)) != len(labels):
        raise RuntimeError("The catalog contains duplicate display names.")

    return {
        "gameVersion": game_version,
        "sourceRevision": source_revision,
        "sourceCommit": commit,
        "songs": songs,
    }


def write_library(output_path, library):
    source_url = (
        f"https://github.com/{REPOSITORY}/blob/"
        f"{library['sourceCommit']}/src/catalog.json"
    )
    content = (
        "// Chart titles and difficulty constants sourced from phigros.tools.\n"
        f"// Source: {source_url}\n"
        "window.PHIGROS_CHART_LIBRARY = "
        + json.dumps(library, ensure_ascii=False, indent=2)
        + ";\n"
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            dir=output_path.parent,
            prefix=f".{output_path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            temporary_file.write(content)
        os.replace(temporary_path, output_path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def main():
    parser = argparse.ArgumentParser(
        description="Fetch and regenerate the checked-in Phigros chart library."
    )
    parser.add_argument(
        "--ref",
        default="main",
        help="phigros-tools branch, tag, or commit to fetch (default: main)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"output JavaScript file (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()
    output_path = args.output.resolve()

    try:
        commit = resolve_commit(args.ref)
        source_url = (
            f"https://raw.githubusercontent.com/{REPOSITORY}/"
            f"{commit}/src/catalog.json"
        )
        library = build_library(fetch_json(source_url), commit)
        write_library(output_path, library)
    except (OSError, RuntimeError) as error:
        parser.exit(1, f"error: {error}\n")

    chart_count = sum(len(song["charts"]) for song in library["songs"])
    print(
        f"Updated {output_path}: {len(library['songs'])} songs, "
        f"{chart_count} charts, game version {library['gameVersion']} "
        f"(source {commit[:12]})."
    )


if __name__ == "__main__":
    main()

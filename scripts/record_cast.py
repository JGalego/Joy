#!/usr/bin/env python3
"""Record Joy's CLI demos with visible, paced typing."""

from __future__ import annotations

import argparse
import codecs
import errno
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time
import uuid
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COLS = 120
ROWS = 38
IDLE_LIMIT = 2.0
READY_TIMEOUT = 60.0
RESPONSE_TIMEOUT = 120.0
STOP_TIMEOUT = 5.0
TYPING_DELAY = 0.014
PROMPT_PATTERN = re.compile(r'^Type "(.+)"$', re.MULTILINE)
UUID_PATTERN = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)
ANSI_PATTERN = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07")
# Larger than one PTY read, so a marker can never fall outside the searched text.
MARKER_WINDOW = 70_000


class ChildExited(RuntimeError):
    """The recorded CLI closed its terminal before the recording finished."""


@dataclass(frozen=True)
class Demo:
    title: str
    tape: str
    ready_text: str  # regular expression, matched against visible output
    command: tuple[str, ...]
    environment: dict[str, str]
    unset_environment: tuple[str, ...]
    completion_marker: str = "Delegate:"  # regular expression, matched against visible output
    start_marker: str = ""
    submit_marker: str = ""
    output_markers: tuple[tuple[str, str], ...] = ()
    response_timeout: float = RESPONSE_TIMEOUT


DEMOS = {
    "claude": Demo(
        title="Joy — Claude Code",
        tape="assets/claude.tape",
        ready_text=r"Claude\s*Code\s*v\d",
        command=(
            "claude",
            "--plugin-dir",
            ".",
            "--setting-sources",
            "project",
            "--no-chrome",
            "--model",
            "sonnet",
            "--effort",
            "low",
            "--disallowedTools",
            "Bash,Edit,Write,NotebookEdit,Read,Glob,Grep,Task,WebFetch,WebSearch",
        ),
        environment={"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"},
        unset_environment=("TERM_PROGRAM", "TERM_PROGRAM_VERSION"),
    ),
    "copilot": Demo(
        title="Joy — GitHub Copilot CLI",
        tape="assets/copilot.tape",
        ready_text="open sidebar",
        command=(
            "copilot",
            "--plugin-dir",
            ".",
            "--banner",
            "--no-remote",
            "--no-auto-update",
            "--disable-builtin-mcps",
            "--available-tools=",
            "--effort",
            "low",
            "--session-id",
            "{session_id}",
        ),
        environment={"COPILOT_MULTIPLEXER": "none"},
        unset_environment=("TERM_PROGRAM", "TERM_PROGRAM_VERSION"),
    ),
    "case-study": Demo(
        title="Joy — Crash-safe webhook worker",
        tape="assets/case-study.tape",
        ready_text=r"Claude\s*Code\s*v\d",
        command=(
            "claude",
            "--plugin-dir",
            ".",
            "--setting-sources",
            "project",
            "--no-chrome",
            "--model",
            "sonnet",
            "--effort",
            "medium",
            "--permission-mode",
            "dontAsk",
            "--allowedTools",
            "Read,Glob,Grep,Bash(python3 -m unittest discover -s examples/webhook_worker/tests -v)",
            "--disallowedTools",
            "Edit,Write,NotebookEdit,WebFetch,WebSearch,Task",
        ),
        environment={"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"},
        unset_environment=("TERM_PROGRAM", "TERM_PROGRAM_VERSION"),
        # The test command, then quiet: the model's own summary wording is not reliable.
        completion_marker=r"Bash\(python3",
        start_marker="Set the boundary",
        submit_marker="Inspect the invariant",
        output_markers=(
            ("Bash(python3", "Run the proof"),
        ),
        response_timeout=180.0,
    ),
}


def prompt_from_tape(path: Path) -> str:
    match = PROMPT_PATTERN.search(path.read_text(encoding="utf-8"))
    if match is None:
        raise RuntimeError(f"could not find the visible Type command in {path.relative_to(ROOT)}")
    return match.group(1)


def child_environment(demo: Demo) -> dict[str, str]:
    # Drop the session variables a parent Claude Code exports (CLAUDECODE, CLAUDE_CODE_*):
    # a CLI that inherits them runs as a child session and never draws its interface.
    environment = {
        name: value
        for name, value in os.environ.items()
        if name == "CLAUDE_CONFIG_DIR" or not name.startswith("CLAUDE")
    }
    environment.update(demo.environment)
    environment.update({"COLUMNS": str(COLS), "LINES": str(ROWS), "TERM": "xterm-256color"})
    for name in demo.unset_environment:
        environment.pop(name, None)
    return environment


def sanitize_output(text: str) -> str:
    text = text.replace(str(ROOT), "/workspace/Joy")
    text = text.replace(str(Path.home()), "~")
    return UUID_PATTERN.sub("[session]", text)


class CastRecorder:
    def __init__(self, stream: object) -> None:
        self.stream = stream
        self.started_at = time.monotonic()
        self.decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self.transcript = ""

    def event(self, event_type: str, text: str) -> None:
        timestamp = round(time.monotonic() - self.started_at, 6)
        self.stream.write(json.dumps([timestamp, event_type, text], ensure_ascii=False) + "\n")
        self.stream.flush()

    def output(self, data: bytes, *, final: bool = False) -> None:
        text = self.decoder.decode(data, final=final)
        if not text:
            return
        text = sanitize_output(text)
        self.transcript = (self.transcript + text)[-1_000_000:]
        self.event("o", text)


def set_terminal_size(fd: int) -> None:
    size = struct.pack("HHHH", ROWS, COLS, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, size)


def stop_child(pid: int, fd: int) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        os.close(fd)
    except OSError:
        pass
    # Claude Code can outlive SIGTERM and the closed terminal; do not wait forever.
    deadline = time.monotonic() + STOP_TIMEOUT
    try:
        while os.waitpid(pid, os.WNOHANG)[0] == 0:
            if time.monotonic() >= deadline:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
                return
            time.sleep(0.1)
    except (ChildProcessError, ProcessLookupError):
        pass


def record(demo_name: str, output_path: Path) -> None:
    demo = DEMOS[demo_name]
    prompt = prompt_from_tape(ROOT / demo.tape)
    command = tuple(part.format(session_id=uuid.uuid4()) for part in demo.command)
    temporary_path = output_path.with_suffix(f"{output_path.suffix}.tmp")
    temporary_path.parent.mkdir(parents=True, exist_ok=True)

    with temporary_path.open("w", encoding="utf-8") as stream:
        header = {
            "version": 2,
            "width": COLS,
            "height": ROWS,
            "timestamp": int(time.time()),
            "idle_time_limit": IDLE_LIMIT,
            "env": {"SHELL": "/bin/bash", "TERM": "xterm-256color"},
            "title": demo.title,
        }
        stream.write(json.dumps(header, ensure_ascii=False) + "\n")
        stream.flush()
        recorder = CastRecorder(stream)

        pid, fd = pty.fork()
        if pid == 0:
            os.chdir(ROOT)
            try:
                os.execvpe(command[0], command, child_environment(demo))
            except OSError as error:
                print(f"could not start {command[0]}: {error}", file=sys.stderr)
                os._exit(127)

        set_terminal_size(fd)
        marker_output_start: int | None = None
        pending_markers = list(demo.output_markers)

        def visible_since(start: int) -> str:
            # Match on visible text: the CLIs interleave styling and cursor codes with words.
            window_start = max(start, len(recorder.transcript) - MARKER_WINDOW)
            return ANSI_PATTERN.sub("", recorder.transcript[window_start:])

        def child_exited() -> ChildExited:
            visible = ANSI_PATTERN.sub("", recorder.transcript).strip()
            last_line = visible.splitlines()[-1] if visible else "no output"
            return ChildExited(f"{command[0]} exited before the {demo_name} recording finished: {last_line}")

        def pump(timeout: float) -> bool:
            readable, _, _ = select.select([fd], [], [], timeout)
            if not readable:
                return False
            try:
                data = os.read(fd, 65_536)
            except OSError as error:
                # Linux reports a closed terminal as EIO; other platforms return no data.
                if error.errno == errno.EIO:
                    raise child_exited() from None
                raise
            if not data:
                raise child_exited()
            recorder.output(data)
            if marker_output_start is not None:
                output = visible_since(marker_output_start)
                for marker in pending_markers.copy():
                    needle, label = marker
                    if needle in output:
                        recorder.event("m", label)
                        pending_markers.remove(marker)
            return True

        def pump_for(duration: float) -> None:
            deadline = time.monotonic() + duration
            while time.monotonic() < deadline:
                pump(max(0.0, deadline - time.monotonic()))

        try:
            ready_deadline = time.monotonic() + READY_TIMEOUT
            while re.search(demo.ready_text, visible_since(0)) is None:
                if time.monotonic() >= ready_deadline:
                    raise TimeoutError(f"{demo_name} did not become ready within {READY_TIMEOUT:g} seconds")
                pump(0.25)

            pump_for(2.0)
            if demo.start_marker:
                recorder.event("m", demo.start_marker)
            for character in prompt:
                recorder.event("i", character)
                os.write(fd, character.encode("utf-8"))
                pause = TYPING_DELAY + (0.035 if character in ".;" else 0.0)
                pump_for(pause)

            pump_for(0.4)
            recorder.event("i", "\r")
            os.write(fd, b"\r")
            marker_output_start = len(recorder.transcript)
            if demo.submit_marker:
                recorder.event("m", demo.submit_marker)

            response_start = len(recorder.transcript)
            response_deadline = time.monotonic() + demo.response_timeout
            last_output_at = time.monotonic()
            complete = False
            while True:
                if pump(0.25):
                    last_output_at = time.monotonic()
                    complete = complete or re.search(demo.completion_marker, visible_since(response_start)) is not None
                if complete and time.monotonic() - last_output_at >= 3.0:
                    break
                if time.monotonic() >= response_deadline:
                    raise TimeoutError(f"{demo_name} did not finish within {demo.response_timeout:g} seconds")

            recorder.event("o", "\x1b[0m")
            recorder.output(b"", final=True)
        except BaseException:
            temporary_path.unlink(missing_ok=True)
            raise
        finally:
            stop_child(pid, fd)

    temporary_path.replace(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("demo", choices=DEMOS)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    output_path = arguments.output if arguments.output.is_absolute() else ROOT / arguments.output
    record(arguments.demo, output_path)
    print(f"Recorded {output_path.relative_to(ROOT)} with paced typing.")


if __name__ == "__main__":
    main()
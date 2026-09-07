#!/usr/bin/env python3
"""Record Joy's CLI demos with visible, paced typing."""

from __future__ import annotations

import argparse
import codecs
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
TYPING_DELAY = 0.014
COMPLETION_MARKER = "Delegate:"
PROMPT_PATTERN = re.compile(r'^Type "(.+)"$', re.MULTILINE)
UUID_PATTERN = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Demo:
    title: str
    tape: str
    ready_text: str
    command: tuple[str, ...]
    environment: dict[str, str]
    unset_environment: tuple[str, ...]


DEMOS = {
    "claude": Demo(
        title="Joy — Claude Code",
        tape="assets/claude.tape",
        ready_text="Sonnet",
        command=(
            "claude",
            "--plugin-dir",
            ".",
            "--setting-sources",
            "project",
            "--no-chrome",
            "--effort",
            "low",
            "--disallowedTools",
            "Bash,Edit,Write,NotebookEdit,Read,Glob,Grep,Task,WebFetch,WebSearch",
        ),
        environment={"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"},
        unset_environment=("CLAUDE_CODE_SSE_PORT", "TERM_PROGRAM", "TERM_PROGRAM_VERSION"),
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
}


def prompt_from_tape(path: Path) -> str:
    match = PROMPT_PATTERN.search(path.read_text(encoding="utf-8"))
    if match is None:
        raise RuntimeError(f"could not find the visible Type command in {path.relative_to(ROOT)}")
    return match.group(1)


def child_environment(demo: Demo) -> dict[str, str]:
    environment = os.environ.copy()
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
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
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

        def pump(timeout: float) -> bool:
            readable, _, _ = select.select([fd], [], [], timeout)
            if not readable:
                return False
            try:
                data = os.read(fd, 65_536)
            except OSError:
                return False
            if not data:
                return False
            recorder.output(data)
            return True

        def pump_for(duration: float) -> None:
            deadline = time.monotonic() + duration
            while time.monotonic() < deadline:
                pump(max(0.0, deadline - time.monotonic()))

        try:
            ready_deadline = time.monotonic() + READY_TIMEOUT
            while demo.ready_text not in recorder.transcript:
                if time.monotonic() >= ready_deadline:
                    raise TimeoutError(f"{demo_name} did not become ready within {READY_TIMEOUT:g} seconds")
                pump(0.25)

            pump_for(2.0)
            for character in prompt:
                recorder.event("i", character)
                os.write(fd, character.encode("utf-8"))
                pause = TYPING_DELAY + (0.035 if character in ".;" else 0.0)
                pump_for(pause)

            pump_for(0.4)
            recorder.event("i", "\r")
            os.write(fd, b"\r")

            response_start = len(recorder.transcript)
            response_deadline = time.monotonic() + RESPONSE_TIMEOUT
            last_output_at = time.monotonic()
            while True:
                if pump(0.25):
                    last_output_at = time.monotonic()
                response = recorder.transcript[response_start:]
                complete = COMPLETION_MARKER in response
                if complete and time.monotonic() - last_output_at >= 3.0:
                    break
                if time.monotonic() >= response_deadline:
                    raise TimeoutError(f"{demo_name} did not finish within {RESPONSE_TIMEOUT:g} seconds")

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
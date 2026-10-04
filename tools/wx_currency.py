from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import frida


ROOT = Path(__file__).resolve().parents[1]
AGENT_PATH = ROOT / "frida" / "wx_currency.js"
DEFAULT_APP_ID = "wx0c4a175295d64921"
DEFAULT_MARKER = "HorrorDormitory"
DEFAULT_DEVICE_BUNDLE_SOURCE = "/data/local/tmp/mgss-js-game.js"
SLOTS = {"honey", "gold", "lightning"}


def run_adb(adb: str, serial: str | None, *args: str, check: bool = True) -> str:
    command = [adb]
    if serial:
        command += ["-s", serial]
    command += list(args)
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if check and completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"ADB command failed: {' '.join(command)}\n{detail}")
    return completed.stdout.strip()


def find_adb(explicit: str | None) -> str:
    if explicit:
        return explicit
    found = shutil.which("adb")
    if found:
        return found
    local = Path.home() / ".local" / "bin" / "adb.exe"
    if local.exists():
        return str(local)
    raise RuntimeError("adb was not found; install Android SDK Platform-Tools or pass --adb")


def choose_serial(adb: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    output = run_adb(adb, None, "devices")
    devices = []
    for line in output.splitlines()[1:]:
        columns = line.split()
        if len(columns) >= 2 and columns[1] == "device":
            devices.append(columns[0])
    if len(devices) != 1:
        raise RuntimeError(f"Expected one connected Android device, found: {devices}")
    return devices[0]


def resolve_bundle_source(explicit: str | None, appid: str) -> Path | None:
    configured = explicit or os.environ.get("MGSS_BUNDLE_SOURCE")
    if configured:
        source = Path(configured).expanduser().resolve()
        if not source.is_file():
            raise RuntimeError(f"Bundle source does not exist: {source}")
        return source

    source = (
        Path.home()
        / ".codex"
        / "mcp"
        / "wx-mp-mcp"
        / "static"
        / "out"
        / appid
        / "app"
        / "js"
        / "game.js"
    )
    return source if source.is_file() else None


def prepare_bundle_source(
    adb: str,
    serial: str,
    source: Path | None,
    device_path: str,
) -> None:
    if source is None:
        print(
            "warning: unpacked app/js/game.js was not found; "
            "runtime-lock will need --bundle-source or MGSS_BUNDLE_SOURCE",
            file=sys.stderr,
        )
        return
    run_adb(adb, serial, "push", str(source), device_path)
    print(f"Prepared bundle source: {source} -> {device_path}")


def prepare_transport(adb: str, serial: str, host_port: int, server_path: str) -> None:
    run_adb(adb, serial, "forward", f"tcp:{host_port}", "tcp:27042")
    launch = (
        f"test -x {server_path} && "
        f"(pidof frida-server >/dev/null || "
        f"setsid {server_path} >/data/local/tmp/frida-server.log 2>&1 </dev/null &)"
    )
    run_adb(adb, serial, "shell", launch)


def appbrand_pids(adb: str, serial: str) -> list[int]:
    output = run_adb(adb, serial, "shell", "ps -A -o PID,NAME")
    found: list[int] = []
    for line in output.splitlines():
        match = re.search(r"^\s*(\d+)\s+com\.tencent\.mm:appbrand\d+\s*$", line)
        if match:
            found.append(int(match.group(1)))
    return found


def load_agent(session: frida.core.Session, source: str) -> frida.core.Script:
    script = session.create_script(source)

    def on_message(message: dict[str, Any], _data: bytes | None) -> None:
        if message.get("type") == "error":
            print(f"[agent-error] {message.get('stack') or message}", file=sys.stderr)
        elif message.get("type") == "send":
            print(f"[agent] {json.dumps(message.get('payload'), ensure_ascii=False)}")

    script.on("message", on_message)
    script.load()
    return script


def attach_target(
    device: frida.core.Device,
    source: str,
    pids: list[int],
    forced_pid: int | None,
    marker: str,
) -> tuple[int, frida.core.Session, frida.core.Script]:
    candidates = [forced_pid] if forced_pid else pids
    if not candidates:
        raise RuntimeError("No com.tencent.mm:appbrand process is running; open the mini-game first")

    for pid in candidates:
        session = device.attach(pid)
        script = load_agent(session, source)
        if forced_pid:
            return pid, session, script
        try:
            result = script.exports_sync.probe(marker, 1)
            if result.get("hits"):
                return pid, session, script
        except Exception:
            pass
        script.unload()
        session.detach()

    raise RuntimeError(f"No appbrand process contains marker {marker!r}; keep the target game visible and retry")


def parse_number(text: str) -> int | float:
    number = float(text)
    return int(number) if number.is_integer() else number


def print_result(result: Any) -> None:
    print(json.dumps(result, ensure_ascii=False, indent=2))


def print_help() -> None:
    print(
        """
Commands:
  scan SLOT VALUE [TYPE,...]      Initial exact scan (default: i32,f64,smi32,smi64)
  exact SLOT VALUE               Keep candidates equal to VALUE
  changed SLOT                   Keep candidates changed since the last scan/refine
  unchanged SLOT                 Keep candidates unchanged since the last scan/refine
  increased SLOT                 Keep candidates that increased
  decreased SLOT                 Keep candidates that decreased
  list SLOT [LIMIT]              Show live candidate values
  select SLOT INDEX[,INDEX]      Keep only selected candidate indexes
  set SLOT VALUE [MAX_WRITES]    Write VALUE; candidate guard defaults to 64
  lock SLOT VALUE [MS] [MAX]     Write and lock VALUE; default interval is 100 ms
  persist VALUE                  Persist PlayerData._gold through the MMKV hook
  storage                        Show MMKV PlayerData hook state
  runtime-lock VALUE             Patch bundle loading; lock only the local player
  runtime-source DEVICE_PATH     Set the device-side unpacked bundle source
  runtime-status                 Show scoped JSRuntime patch state
  runtime-unlock                 Remove JSRuntime loader hooks
  unlock SLOT                    Stop a lock
  clear SLOT                     Clear candidates and lock
  status                         Show all candidate banks and locks
  help                           Show this help
  quit                           Detach and exit

Slots: honey (蜜獾币), gold (局内金币), lightning (局内闪电)
""".strip()
    )


def validate_slot(slot: str) -> str:
    slot = slot.lower()
    if slot not in SLOTS:
        raise ValueError(f"Unknown slot {slot!r}; choose one of {sorted(SLOTS)}")
    return slot


def repl(script: frida.core.Script) -> None:
    exports = script.exports_sync
    print_help()
    while True:
        try:
            line = input("wx-currency> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not line:
            continue
        parts = line.split()
        command = parts[0].lower()
        try:
            if command in {"quit", "exit", "q"}:
                return
            if command == "help":
                print_help()
            elif command == "status":
                print_result(exports.status())
            elif command == "storage":
                print_result(exports.storagestatus())
            elif command == "runtime-status":
                print_result(exports.runtimestatus())
            elif command == "runtime-lock" and len(parts) >= 2:
                print_result(exports.runtimelock(parse_number(parts[1])))
            elif command == "runtime-source" and len(parts) >= 2:
                print_result(exports.runtimesource(parts[1]))
            elif command == "runtime-unlock":
                print_result(exports.runtimeunlock())
            elif command == "scan" and len(parts) >= 3:
                slot = validate_slot(parts[1])
                value = parse_number(parts[2])
                types = parts[3].split(",") if len(parts) >= 4 else []
                print_result(exports.scan(slot, value, types, {}))
            elif command in {"exact", "changed", "unchanged", "increased", "decreased"}:
                if len(parts) < 2:
                    raise ValueError(f"Usage: {command} SLOT" + (" VALUE" if command == "exact" else ""))
                slot = validate_slot(parts[1])
                value = parse_number(parts[2]) if command == "exact" and len(parts) >= 3 else None
                print_result(exports.refine(slot, command, value))
            elif command == "list" and len(parts) >= 2:
                slot = validate_slot(parts[1])
                limit = int(parts[2]) if len(parts) >= 3 else 20
                print_result(exports.list(slot, limit))
            elif command == "select" and len(parts) >= 3:
                slot = validate_slot(parts[1])
                indexes = [int(item) for item in parts[2].split(",")]
                print_result(exports.select(slot, indexes))
            elif command in {"set", "write"} and len(parts) >= 3:
                slot = validate_slot(parts[1])
                value = parse_number(parts[2])
                max_writes = int(parts[3]) if len(parts) >= 4 else 64
                print_result(exports.write(slot, value, max_writes))
            elif command == "lock" and len(parts) >= 3:
                slot = validate_slot(parts[1])
                value = parse_number(parts[2])
                interval = int(parts[3]) if len(parts) >= 4 else 100
                max_writes = int(parts[4]) if len(parts) >= 5 else 64
                print_result(exports.lock(slot, value, interval, max_writes))
            elif command == "unlock" and len(parts) >= 2:
                print_result(exports.unlock(validate_slot(parts[1])))
            elif command == "persist" and len(parts) >= 2:
                print_result(exports.storagewrite(parse_number(parts[1])))
            elif command == "clear" and len(parts) >= 2:
                print_result(exports.clear(validate_slot(parts[1])))
            else:
                print("Unknown or incomplete command. Enter 'help'.")
        except Exception as error:
            print(f"error: {error}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="WeChat Horror Dormitory runtime currency debugger")
    parser.add_argument("--adb", help="Path to adb executable")
    parser.add_argument("--serial", help="ADB device serial; auto-selected when only one device is connected")
    parser.add_argument("--host-port", type=int, default=27042, help="Local forwarded Frida port")
    parser.add_argument("--server-path", default="/data/local/tmp/frida-server", help="Device frida-server path")
    parser.add_argument("--pid", type=int, help="Attach directly instead of marker-based appbrand detection")
    parser.add_argument("--marker", default=DEFAULT_MARKER, help="ASCII marker used to identify the target process")
    parser.add_argument("--appid", default=DEFAULT_APP_ID, help="Documented target appid")
    parser.add_argument(
        "--bundle-source",
        help="Unpacked app/js/game.js used to replace the WXA descriptor at load time",
    )
    parser.add_argument(
        "--device-bundle-source",
        default=DEFAULT_DEVICE_BUNDLE_SOURCE,
        help="Device path holding the unpacked bundle source",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    adb = find_adb(args.adb)
    serial = choose_serial(adb, args.serial)
    prepare_bundle_source(
        adb,
        serial,
        resolve_bundle_source(args.bundle_source, args.appid),
        args.device_bundle_source,
    )
    prepare_transport(adb, serial, args.host_port, args.server_path)

    source = AGENT_PATH.read_text(encoding="utf-8")
    manager = frida.get_device_manager()
    device = manager.add_remote_device(f"127.0.0.1:{args.host_port}")
    pid, session, script = attach_target(
        device,
        source,
        appbrand_pids(adb, serial),
        args.pid,
        args.marker,
    )
    identity = script.exports_sync.ping()
    print(f"Attached: serial={serial} pid={pid} appid={args.appid} runtime={identity}")
    print_result(script.exports_sync.runtimesource(args.device_bundle_source))
    print_result(script.exports_sync.storagehook())
    try:
        repl(script)
    finally:
        try:
            script.unload()
        finally:
            session.detach()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"fatal: {exc}", file=sys.stderr)
        raise SystemExit(1)

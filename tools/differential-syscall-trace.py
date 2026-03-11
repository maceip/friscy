#!/usr/bin/env python3
"""
Differential syscall boundary tracer for friscy vs qemu-riscv64.

Usage:
  python3 tools/differential-syscall-trace.py \
    --friscy-cmd "./build-native/friscy --differential-syscall-trace -- /path/to/guest" \
    --qemu-cmd "qemu-riscv64 -strace /path/to/guest"
  python3 tools/differential-syscall-trace.py \
    --friscy-rootfs /path/to/rootfs \
    --qemu-rootfs /path/to/rootfs \
    --guest-cmd "/bin/bash -lc 'echo pre; node -e \"console.log(\\\"node-ok\\\")\"; echo post'" \
    --qemu-rootfs-entry-mode guest
  python3 tools/differential-syscall-trace.py \
    --differential-tag repro-node-mmap \
    --friscy-rootfs /path/to/rootfs \
    --qemu-rootfs /path/to/rootfs \
    --guest-cmd "/bin/bash -lc 'echo pre; node -e \"console.log(\\\"node-ok\\\")\"; echo post'"
    --qemu-rootfs-entry-mode guest
"""

from __future__ import annotations

import argparse
import os
import re
import shlex
import subprocess
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

DIFF_RE = re.compile(
    r"^\[DIFF\] "
    r"sys=(?P<sys>\d+) "
    r"pc=0x(?P<pc>[0-9a-fA-F]+) "
    r"a0=0x(?P<a0>[0-9a-fA-F]+) "
    r"a1=0x(?P<a1>[0-9a-fA-F]+) "
    r"a2=0x(?P<a2>[0-9a-fA-F]+) "
    r"a3=0x(?P<a3>[0-9a-fA-F]+) "
    r"a4=0x(?P<a4>[0-9a-fA-F]+) "
    r"a5=0x(?P<a5>[0-9a-fA-F]+) "
    r"ret=0x(?P<ret>[0-9a-fA-F]+) "
    r"pre_hash=0x(?P<pre>[0-9a-fA-F]+) "
    r"post_hash=0x(?P<post>[0-9a-fA-F]+)"
)

QEMU_RE = re.compile(
    r"^\s*(?:\[\s*\d+\]\s*)?"
    r"(?:(?:\d+)\s+)?"
    r"(?:(?P<pc>0x[0-9a-fA-F]+):\s*)?"
    r"(?:(?P<sysnum>\d+)\s+)?"
    r"(?P<name>[A-Za-z_][A-Za-z0-9_]*)\((?P<args>[^)]*)\)\s*"
    r"(?:=\s*"
    r"(?P<ret>-?0x[0-9a-fA-F]+|-?\d+)"
    r")?"
)
QEMU_EVENT_START_RE = re.compile(
    r"(?:\[\s*\d+\]\s*)?"
    r"(?:(?:\d+)\s+)?"
    r"(?:(?:0x[0-9a-fA-F]+):\s*)?"
    r"(?:(?:\d+)\s+)?"
    r"[A-Za-z_][A-Za-z0-9_]*\("
)
QEMU_RET_CONT_RE = re.compile(r"^\s*=\s*(?P<ret>-?0x[0-9a-fA-F]+|-?\d+)")

PHASE_ORDER = [
    "fork-save",
    "child-execve",
    "first-mmap-after-exec",
    "child-exit",
    "parent-restore",
]

FOCUS_SYSCALLS = {222, 226, 220, 435, 221, 93, 94}
ADDR_SPACE_PTR_SYSCALLS = {222}
MAP_FIXED = 0x10

syscall_name_map = {
    "mmap": 222,
    "mmap2": 222,
    "munmap": 215,
    "mprotect": 226,
    "clone": 220,
    "clone3": 435,
    "execve": 221,
    "wait4": 61,
    "waitpid": 61,
    "exit": 93,
    "exit_group": 94,
}

syscall_display_name = {
    61: "wait4",
    93: "exit",
    94: "exit_group",
    215: "munmap",
    220: "clone",
    221: "execve",
    222: "mmap",
    226: "mprotect",
    435: "clone3",
}

PHASE_MARKER_PATTERNS: Sequence[Tuple[str, re.Pattern[str]]] = (
    ("fork-save", re.compile(r"\[fork-save\]")),
    ("child-execve", re.compile(r"\[friscy\] execve: loading new binary ")),
    ("child-exit", re.compile(r"\[(?:fork-exit|exit_group|exit)\]|\[resume\] EBREAK in fork child")),
    ("parent-restore", re.compile(r"\[fork-restore\] (?:begin|resume)")),
)


@dataclass
class FrEvent:
    idx: int
    sys: int
    pc: int
    ret: int
    a0: int
    a1: int
    a2: int
    a3: int
    a4: int
    a5: int
    pre_hash: int
    post_hash: int
    raw: str
    line_no: int
    phase: Optional[str] = None
    symbol: Optional[str] = None


@dataclass
class QEvent:
    idx: int
    sysnum: Optional[int]
    name: Optional[str]
    pc: Optional[int]
    ret: int
    a0: Optional[int]
    a1: Optional[int]
    a2: Optional[int]
    a3: Optional[int]
    a4: Optional[int]
    a5: Optional[int]
    raw: str
    line_no: int
    phase: Optional[str] = None


@dataclass
class PhaseMarker:
    phase: str
    line_no: int
    detail: str


@dataclass
class PhaseState:
    markers: List[PhaseMarker]
    first_mmap_after_exec_line: Optional[int]


@dataclass
class EventMismatch:
    idx: int
    reason: str
    friscy: Optional[FrEvent]
    qemu: Optional[QEvent]


@dataclass
class MmapReturnState:
    first_success_ret: Optional[int] = None
    first_success_nonfixed_ret: Optional[int] = None


@dataclass
class SymbolRange:
    label: str
    path: Path
    base: int
    lo: int
    hi: int


@dataclass
class SymbolEntry:
    name: str
    value: int
    size: int


class Symbolizer:
    def __init__(self, args: argparse.Namespace):
        self.enabled = not args.no_symbolize
        self.addr2line = args.addr2line
        self.readelf = args.readelf
        self.ranges: List[SymbolRange] = []
        self.cache: Dict[int, str] = {}
        self.symbol_cache: Dict[Path, List[SymbolEntry]] = {}
        if not self.enabled:
            return
        self._init_ranges(args)

    def _init_ranges(self, args: argparse.Namespace) -> None:
        candidates: List[Tuple[str, Optional[str], int]] = [
            ("ld-musl", args.symbol_root or args.qemu_rootfs or args.friscy_rootfs, 0x18000000),
            ("node", args.symbol_root or args.qemu_rootfs or args.friscy_rootfs, 0x40000),
            ("bash", args.symbol_root or args.qemu_rootfs or args.friscy_rootfs, 0x40000),
        ]
        rel_paths = {
            "ld-musl": ["lib/ld-musl-riscv64.so.1", "usr/lib/ld-musl-riscv64.so.1"],
            "node": ["usr/bin/node", "bin/node"],
            "bash": ["bin/bash", "usr/bin/bash"],
        }
        for label, root, base in candidates:
            path = self._resolve_rootfs_path(root, rel_paths[label])
            if path is None:
                continue
            load_range = self._read_load_range(path)
            if load_range is None:
                continue
            lo, hi = load_range
            self.ranges.append(SymbolRange(label=label, path=path, base=base, lo=lo, hi=hi))

    @staticmethod
    def _resolve_rootfs_path(root: Optional[str], rel_candidates: Sequence[str]) -> Optional[Path]:
        if root is None:
            return None
        root_path = Path(root)
        if not root_path.exists() or not root_path.is_dir():
            return None
        for rel in rel_candidates:
            candidate = root_path / rel
            if candidate.exists():
                return candidate
        return None

    def _read_load_range(self, path: Path) -> Optional[Tuple[int, int]]:
        try:
            proc = subprocess.run(
                [self.readelf, "-Wl", str(path)],
                text=True,
                capture_output=True,
                check=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError):
            self.enabled = False
            return None
        lo: Optional[int] = None
        hi = 0
        for line in proc.stdout.splitlines():
            line = line.strip()
            if not line.startswith("LOAD"):
                continue
            parts = line.split()
            if len(parts) < 6:
                continue
            try:
                vaddr = int(parts[2], 16)
                memsz = int(parts[5], 16)
            except ValueError:
                continue
            lo = vaddr if lo is None else min(lo, vaddr)
            hi = max(hi, vaddr + memsz)
        if lo is None or hi <= lo:
            return None
        return lo, hi

    def symbolize(self, pc: int) -> Optional[str]:
        if not self.enabled:
            return None
        cached = self.cache.get(pc)
        if cached is not None:
            return cached
        for rng in self.ranges:
            load_base = rng.base - rng.lo
            if load_base <= pc < load_base + (rng.hi - rng.lo):
                relative_pc = pc - load_base
                symbol = self._addr2line(rng, relative_pc)
                if symbol:
                    self.cache[pc] = f"{rng.label}:{symbol}"
                    return self.cache[pc]
        self.cache[pc] = None  # type: ignore[assignment]
        return None

    def _addr2line(self, rng: SymbolRange, relative_pc: int) -> Optional[str]:
        nearest = self._nearest_symbol(rng.path, relative_pc)
        try:
            proc = subprocess.run(
                [self.addr2line, "-Cfipe", str(rng.path), hex(relative_pc)],
                text=True,
                capture_output=True,
                check=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError):
            self.enabled = False
            return None
        lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
        if not lines:
            return self._format_symbol(relative_pc, nearest)
        head = lines[0]
        if head in {"??", "??:0"} or head.startswith("?? "):
            return self._format_symbol(relative_pc, nearest)
        func = head
        if " at " in head:
            func = head.split(" at ", 1)[0]
        if "+" in func:
            return func
        if nearest is not None and nearest.name == func:
            return self._format_symbol(relative_pc, nearest)
        return self._format_symbol(relative_pc, nearest, fallback=func)

    def _nearest_symbol(self, path: Path, relative_pc: int) -> Optional[SymbolEntry]:
        symbols = self.symbol_cache.get(path)
        if symbols is None:
            symbols = self._load_symbols(path)
            self.symbol_cache[path] = symbols
        best: Optional[SymbolEntry] = None
        for sym in symbols:
            if sym.value > relative_pc:
                break
            if best is None or sym.value >= best.value:
                best = sym
        if best is None:
            return None
        if best.size > 0 and relative_pc >= best.value + best.size:
            return best
        return best

    def _load_symbols(self, path: Path) -> List[SymbolEntry]:
        try:
            proc = subprocess.run(
                [self.readelf, "-Ws", str(path)],
                text=True,
                capture_output=True,
                check=True,
            )
        except (FileNotFoundError, subprocess.CalledProcessError):
            return []
        out: List[SymbolEntry] = []
        for line in proc.stdout.splitlines():
            line = line.strip()
            if not line or ":" not in line or " FUNC " not in f" {line} ":
                continue
            parts = line.split()
            if len(parts) < 8:
                continue
            try:
                value = int(parts[1], 16)
                size = int(parts[2], 10)
            except ValueError:
                continue
            name = parts[-1]
            if not name or name == "UND":
                continue
            out.append(SymbolEntry(name=name, value=value, size=size))
        out.sort(key=lambda item: item.value)
        return out

    @staticmethod
    def _format_symbol(relative_pc: int, nearest: Optional[SymbolEntry], fallback: Optional[str] = None) -> str:
        if nearest is None:
            return fallback or f"0x{relative_pc:x}"
        delta = relative_pc - nearest.value
        if delta == 0:
            return nearest.name
        return f"{nearest.name}+0x{delta:x}"


def parse_int(num: str) -> int:
    if num.startswith("0x") or num.startswith("0X") or num.startswith("-0x") or num.startswith("-0X"):
        return int(num, 16)
    return int(num, 10)


def to_signed64(v: int) -> int:
    if v >= 1 << 63:
        v -= 1 << 64
    return v


def _parse_qemu_mmap_arg(arg: Optional[str]) -> Optional[int]:
    if arg is None:
        return None
    token = arg.strip()
    if not token:
        return None
    if token == "NULL":
        return 0
    if token == "-1":
        return -1
    if token.startswith("-0x") or token.startswith("-0X"):
        try:
            return int(token, 16)
        except ValueError:
            return None
    if token.startswith("0x") or token.startswith("0X"):
        try:
            return int(token, 16)
        except ValueError:
            return None
    if token.isdigit() or (token.startswith("-") and token[1:].isdigit()):
        try:
            return int(token, 10)
        except ValueError:
            return None
    if "|" in token:
        mapping = {
            "PROT_NONE": 0,
            "PROT_READ": 1,
            "PROT_WRITE": 2,
            "PROT_EXEC": 4,
            "MAP_SHARED": 1,
            "MAP_PRIVATE": 2,
            "MAP_ANONYMOUS": 32,
            "MAP_FIXED": 16,
            "MAP_FIXED_NOREPLACE": 0x100000,
            "MAP_GROWSDOWN": 0x100,
        }
        total = 0
        for part in token.split("|"):
            value = mapping.get(part.strip())
            if value is None:
                return None
            total |= value
        return total
    return None


def _normalize_mmap_return(ret: int, state: MmapReturnState, fixed: bool = False) -> Optional[int]:
    if to_signed64(ret) < 0:
        return None
    if fixed:
        if state.first_success_ret is None:
            state.first_success_ret = ret
        return ret - state.first_success_ret
    if state.first_success_nonfixed_ret is None:
        state.first_success_nonfixed_ret = ret
    return ret - state.first_success_nonfixed_ret


def extract_phase_markers(text: str) -> PhaseState:
    markers: List[PhaseMarker] = []
    child_execve_line: Optional[int] = None
    first_mmap_after_exec_line: Optional[int] = None
    saw_fork_save = False
    for line_no, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        diff_match = DIFF_RE.search(stripped)
        if diff_match:
            sysnum = int(diff_match.group("sys"))
            if not saw_fork_save and sysnum in {220, 435}:
                markers.append(PhaseMarker(phase="fork-save", line_no=line_no, detail=stripped))
                saw_fork_save = True
            elif sysnum == 221 and child_execve_line is None:
                markers.append(PhaseMarker(phase="child-execve", line_no=line_no, detail=stripped))
                child_execve_line = line_no
            elif (
                child_execve_line is not None
                and first_mmap_after_exec_line is None
                and sysnum == 222
            ):
                first_mmap_after_exec_line = line_no
                markers.append(
                    PhaseMarker(
                        phase="first-mmap-after-exec",
                        line_no=line_no,
                        detail=stripped,
                    )
                )
            elif sysnum in {93, 94}:
                markers.append(PhaseMarker(phase="child-exit", line_no=line_no, detail=stripped))
            elif (
                sysnum == 61
                and not any(marker.phase == "parent-restore" for marker in markers)
            ):
                markers.append(PhaseMarker(phase="parent-restore", line_no=line_no, detail=stripped))
        for phase, pattern in PHASE_MARKER_PATTERNS:
            if pattern.search(stripped):
                markers.append(PhaseMarker(phase=phase, line_no=line_no, detail=stripped))
                if phase == "child-execve":
                    child_execve_line = line_no
                break
        if (
            child_execve_line is not None
            and first_mmap_after_exec_line is None
            and "[DIFF]" in stripped
            and " sys=222 " in f" {stripped} "
        ):
            first_mmap_after_exec_line = line_no
            markers.append(
                PhaseMarker(
                    phase="first-mmap-after-exec",
                    line_no=line_no,
                    detail=stripped,
                )
            )
    return PhaseState(markers=markers, first_mmap_after_exec_line=first_mmap_after_exec_line)


def event_phase_for_line(markers: Sequence[PhaseMarker], line_no: int) -> Optional[str]:
    current: Optional[str] = None
    for marker in markers:
        if marker.line_no > line_no:
            break
        current = marker.phase
    return current


def parse_friscy(text: str, phase_state: PhaseState, symbolizer: Symbolizer) -> List[FrEvent]:
    out: List[FrEvent] = []
    idx = 0
    for line_no, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        m = DIFF_RE.search(stripped)
        if not m:
            continue
        d = m.groupdict()
        pc = int(d["pc"], 16)
        out.append(
            FrEvent(
                idx=idx,
                sys=int(d["sys"]),
                pc=pc,
                ret=int(d["ret"], 16),
                a0=int(d["a0"], 16),
                a1=int(d["a1"], 16),
                a2=int(d["a2"], 16),
                a3=int(d["a3"], 16),
                a4=int(d["a4"], 16),
                a5=int(d["a5"], 16),
                pre_hash=int(d["pre"], 16),
                post_hash=int(d["post"], 16),
                raw=stripped,
                line_no=line_no,
                phase=event_phase_for_line(phase_state.markers, line_no),
                symbol=symbolizer.symbolize(pc),
            )
        )
        idx += 1
    return out


def _iter_qemu_records(text: str) -> Iterable[Tuple[int, str]]:
    pending: List[Tuple[int, str]] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        cont = QEMU_RET_CONT_RE.match(stripped)
        if cont and pending:
            pending_line, pending_raw = pending.pop(0)
            yield pending_line, f"{pending_raw} {stripped}"
            continue

        starts = list(QEMU_EVENT_START_RE.finditer(line))
        if not starts:
            continue

        for idx, start in enumerate(starts):
            end = starts[idx + 1].start() if idx + 1 < len(starts) else len(line)
            record = line[start.start():end].strip()
            if not record:
                continue
            match = QEMU_RE.search(record)
            if not match:
                continue
            sysname = match.group("name")
            sysnum = int(match.group("sysnum")) if match.group("sysnum") else syscall_name_map.get(sysname or "")
            if match.group("ret") is None:
                # QEMU can interleave multi-threaded strace output so a syscall
                # begins on one line and its return value lands on a later line.
                # Keep only known syscalls pending so long-lived waits like
                # epoll/futex do not steal a focused mmap/mprotect continuation.
                if sysnum is not None:
                    pending.append((line_no, record))
                continue
            yield line_no, record


def parse_qemu(text: str) -> List[QEvent]:
    out: List[QEvent] = []
    idx = 0
    execve_seen = False
    for line_no, line in _iter_qemu_records(text):
        m = QEMU_RE.search(line)
        if not m:
            continue
        d = m.groupdict()
        ret_token = d["ret"] or "0"
        sysname = d.get("name")
        sysnum = int(d["sysnum"]) if d.get("sysnum") else syscall_name_map.get(sysname or "")
        args = [a.strip() for a in (d.get("args", "") or "").split(",")]
        for _ in range(6 - len(args)):
            args.append("")
        phase: Optional[str] = None
        if sysnum in {220, 435}:
            phase = "fork-save"
        elif sysnum == 221:
            phase = "child-execve"
            execve_seen = True
        elif execve_seen and sysnum == 222:
            phase = "first-mmap-after-exec"
            execve_seen = False
        elif sysnum in {93, 94}:
            phase = "child-exit"
        elif sysnum == 61:
            phase = "parent-restore"
        out.append(
            QEvent(
                idx=idx,
                sysnum=sysnum,
                name=sysname,
                pc=int(d["pc"], 16) if d.get("pc") else None,
                ret=parse_int(ret_token),
                a0=_parse_qemu_mmap_arg(args[0]),
                a1=_parse_qemu_mmap_arg(args[1]),
                a2=_parse_qemu_mmap_arg(args[2]),
                a3=_parse_qemu_mmap_arg(args[3]),
                a4=_parse_qemu_mmap_arg(args[4]),
                a5=_parse_qemu_mmap_arg(args[5]),
                raw=line.strip(),
                line_no=line_no,
                phase=phase,
            )
        )
        idx += 1
    return out


def run_command(label: str, cmd: str, timeout: Optional[int], cwd: Optional[str]) -> Tuple[str, int]:
    argv: List[str] = cmd if isinstance(cmd, list) else shlex.split(cmd)
    proc = subprocess.run(
        argv,
        shell=False,
        text=True,
        capture_output=True,
        cwd=cwd,
        timeout=timeout,
    )
    if proc.returncode != 0:
        print(f"[{label}] exited with code {proc.returncode}")
    return proc.stdout + proc.stderr, proc.returncode


def maybe_filter_friscy(
    events: Iterable[FrEvent],
    syscall: Optional[int],
    pc: Optional[int],
    focused_mode: bool,
) -> List[FrEvent]:
    out: List[FrEvent] = []
    for ev in events:
        if focused_mode and ev.sys not in FOCUS_SYSCALLS:
            continue
        if syscall is not None and ev.sys != syscall:
            continue
        if pc is not None and ev.pc != pc:
            continue
        out.append(ev)
    return out


def maybe_filter_qemu(
    events: Iterable[QEvent],
    syscall: Optional[int],
    focused_mode: bool,
) -> List[QEvent]:
    out: List[QEvent] = []
    for ev in events:
        if focused_mode and ev.sysnum not in FOCUS_SYSCALLS:
            continue
        if syscall is not None and ev.sysnum != syscall:
            continue
        out.append(ev)
    return out


def syscall_display(sysnum: Optional[int]) -> str:
    if sysnum is None:
        return "unknown"
    return f"SYS{sysnum}:{syscall_display_name.get(sysnum, 'unknown')}"


def event_match(
    fev: FrEvent,
    qev: QEvent,
    fr_mmap_state: MmapReturnState,
    qemu_mmap_state: MmapReturnState,
) -> Optional[str]:
    qsys = qev.sysnum
    if fev.sys != qsys:
        return "syscall"

    # Normalize mmap return addresses so host address-space choice differences do
    # not become false positives.
    if fev.sys in ADDR_SPACE_PTR_SYSCALLS:
        f_ret = to_signed64(fev.ret)
        q_ret = to_signed64(qev.ret)
        if (f_ret < 0) != (q_ret < 0):
            return "return-class"
        # Return addresses in guest processes can vary due ASLR and allocator layout
        # differences (especially for non-fixed anonymous mappings), while still being
        # semantically equivalent. We only fail on success/failure class changes.
        return None

    f_signed = to_signed64(fev.ret)
    q_signed = to_signed64(qev.ret)
    if fev.ret != qev.ret and f_signed != q_signed:
        return "return"
    return None


def compare_traces(friscy_events: List[FrEvent], qemu_events: List[QEvent], max_div: int) -> List[EventMismatch]:
    mismatches: List[EventMismatch] = []
    fr_mmap_state = MmapReturnState()
    qemu_mmap_state = MmapReturnState()
    max_i = max(len(friscy_events), len(qemu_events))
    for i in range(max_i):
        fe = friscy_events[i] if i < len(friscy_events) else None
        qe = qemu_events[i] if i < len(qemu_events) else None
        if fe is None or qe is None:
            mismatches.append(EventMismatch(idx=i, reason="stream-length", friscy=fe, qemu=qe))
        else:
            reason = event_match(
                fe,
                qe,
                fr_mmap_state=fr_mmap_state,
                qemu_mmap_state=qemu_mmap_state,
            )
            if reason is not None:
                mismatches.append(EventMismatch(idx=i, reason=reason, friscy=fe, qemu=qe))
        if len(mismatches) >= max_div:
            break
    return mismatches


def write_log(path: str, text: str) -> None:
    out = Path(path)
    out.write_text(text)


def tag_or_default(args: argparse.Namespace) -> str:
    if args.differential_tag:
        return args.differential_tag
    return "manual"


def _looks_like_rootfs_archive(path: Path) -> bool:
    name = path.name.lower()
    return any(
        name.endswith(ext)
        for ext in (".tar", ".tar.gz", ".tgz", ".tar.xz", ".txz", ".tar.bz2", ".tbz", ".tbz2", ".tar.zst", ".tzst", ".tar.lz4")
    )


def _qemu_rootfs_node_candidates(rootfs: Path) -> list[str]:
    candidates = ["/usr/bin/node", "/bin/node", "/usr/local/bin/node"]
    found: list[str] = []
    for candidate in candidates:
        if (rootfs / candidate.lstrip("/")).exists():
            found.append(candidate)
    return found


def _ensure_qemu_rootfs_node_alias(rootfs: Path) -> None:
    target = rootfs / "usr/bin/node"
    alias = rootfs / "bin/node"
    if alias.exists() or alias.is_symlink() or not target.exists():
        return
    alias.parent.mkdir(parents=True, exist_ok=True)
    alias.symlink_to(os.path.relpath(target, alias.parent))


def _guest_cmd_mentions_node(cmd: str) -> bool:
    pattern = re.compile(r"(?<![A-Za-z0-9_./-])(?:/usr/bin/node|/bin/node|node)(?![A-Za-z0-9_./-])")
    return pattern.search(cmd) is not None


def _validate_friscy_rootfs(path: Path) -> None:
    if not path.exists():
        raise RuntimeError(f"--friscy-rootfs path does not exist: {path}")
    if path.is_dir():
        raise RuntimeError(f"--friscy-rootfs expects a tar archive path; got directory: {path}")
    if not path.is_file():
        raise RuntimeError(f"--friscy-rootfs is not a file: {path}")


def _qemu_entry_for_checking(
    entry: str,
    qemu_rootfs: Path,
    host_entry_mode: bool,
) -> str:
    if not host_entry_mode:
        return entry
    if not entry.startswith("/"):
        return entry
    if entry.startswith(str(qemu_rootfs)):
        try:
            rel = Path(entry).resolve(strict=False).relative_to(qemu_rootfs.resolve(strict=False))
            return "/" + "/".join(rel.parts)
        except ValueError:
            return entry
    return "/" + entry.lstrip("/")


def _qemu_entry_for_launch(
    entry: str,
    qemu_rootfs: Path,
    host_entry_mode: bool,
) -> str:
    if not host_entry_mode:
        return entry
    if not entry.startswith("/"):
        return entry
    if entry.startswith(str(qemu_rootfs)):
        return entry
    return str(qemu_rootfs / entry.lstrip("/"))


def _guest_node_path_for_qemu_rootfs(node_path: str, qemu_rootfs: Path) -> str:
    if not node_path.startswith(str(qemu_rootfs)):
        return node_path
    try:
        rel = Path(node_path).resolve(strict=False).relative_to(qemu_rootfs.resolve(strict=False))
        return "/" + "/".join(rel.parts)
    except ValueError:
        return node_path


def _qemu_launch_node_path_for_rootfs(
    node_path: str,
    qemu_rootfs: Path,
    host_entry_mode: bool,
) -> str:
    guest_path = _guest_node_path_for_qemu_rootfs(node_path, qemu_rootfs)
    if not host_entry_mode:
        return guest_path
    if not guest_path.startswith("/"):
        return guest_path
    return str(qemu_rootfs / guest_path.lstrip("/"))


def _validate_qemu_rootfs(path: Path, guest_argv: Sequence[str], host_entry_mode: bool) -> None:
    if not path.exists():
        raise RuntimeError(f"--qemu-rootfs path does not exist: {path}")
    if _looks_like_rootfs_archive(path):
        raise RuntimeError(
            f"--qemu-rootfs must be an extracted directory; archive provided: {path}. "
            "Use full extracted rootfs (for example /tmp/friscy-full-rootfs)."
        )
    if path.is_file():
        raise RuntimeError(f"--qemu-rootfs must be a directory: {path}")
    if not path.is_dir():
        raise RuntimeError(f"--qemu-rootfs is not a directory: {path}")

    guest_entry = _qemu_entry_for_checking(guest_argv[0], path, host_entry_mode)
    if guest_entry.startswith("/"):
        guest_path = path / guest_entry.lstrip("/")
        if not guest_path.exists():
            raise RuntimeError(f"Guest entry not found in qemu rootfs: {guest_entry} at {guest_path}")

        if guest_entry in {"/bin/bash", "/usr/bin/bash"}:
            if not (
                (path / "usr/lib/libreadline.so.8").exists()
                or (path / "lib/libreadline.so.8").exists()
                or (path / "lib/x86_64-linux-gnu/libreadline.so.8").exists()
            ):
                raise RuntimeError(
                    "qemu rootfs is missing libreadline.so.8 required by bash. "
                    "Use a full qemu rootfs (not the partial /tmp/friscy-codex-rootfs extraction)."
                )

    if not ((path / "lib/ld-musl-riscv64.so.1").exists() or (path / "usr/lib/ld-musl-riscv64.so.1").exists()):
        raise RuntimeError(
            f"qemu rootfs is missing a RISC-V musl loader in {path}/lib or {path}/usr/lib. "
            "This commonly means the rootfs is not fully extracted."
        )


def _resolve_node_path_for_guest_cmd(
    cmd: str,
    qemu_rootfs: Path,
    node_path: Optional[str],
    host_entry_mode: bool,
) -> Optional[str]:
    if not _guest_cmd_mentions_node(cmd):
        return None

    requested = node_path
    if requested is None:
        candidates = _qemu_rootfs_node_candidates(qemu_rootfs)
        if not candidates:
            raise RuntimeError(
                "guest command contains node but qemu rootfs exposes no /usr/bin/node, /bin/node, or /usr/local/bin/node. "
                "Use a rootfs that includes a node binary."
            )
        requested = candidates[0]
    requested = _guest_node_path_for_qemu_rootfs(requested, qemu_rootfs)
    if requested.startswith("/") and not (qemu_rootfs / requested.lstrip("/")).exists():
        raise RuntimeError(
            f"requested --node-path '{requested}' was not found in qemu rootfs {qemu_rootfs}"
        )
    return requested


def _normalize_command(cmd: str) -> str:
    try:
        parts = shlex.split(cmd)
    except ValueError:
        return cmd
    if not parts:
        return cmd
    binary = parts[0]
    if ("/" not in binary) and not binary.startswith("."):
        return cmd
    try:
        parts[0] = str(Path(binary).expanduser().resolve(strict=False))
    except (TypeError, OSError):
        return cmd
    return " ".join(shlex.quote(p) for p in parts)


def _apply_node_path(guest_cmd: str, node_path: Optional[str]) -> str:
    if not node_path:
        return guest_cmd
    pattern = re.compile(r"(?<![A-Za-z0-9_./-])(?:/usr/bin/node|/bin/node|node)(?![A-Za-z0-9_./-])")
    replaced = pattern.sub(node_path, guest_cmd)
    return replaced


def maybe_add_export_checkpoint(cmd: str, checkpoint_path: str) -> str:
    parts = shlex.split(cmd)
    if "--export-checkpoint" in parts:
        return cmd
    if "--" in parts:
        sep = parts.index("--")
        parts = parts[:sep] + ["--export-checkpoint", checkpoint_path] + parts[sep:]
    else:
        parts += ["--export-checkpoint", checkpoint_path]
    return " ".join(shlex.quote(p) for p in parts)


def preset_invocation(args: argparse.Namespace, friscy_cmd: str, qemu_cmd: str) -> str:
    script_path = str(Path(__file__).resolve())
    parts = ["python3", script_path, "--differential-tag", tag_or_default(args)]
    if args.friscy_rootfs is not None:
        parts += [
            "--friscy-rootfs",
            args.friscy_rootfs,
            "--qemu-rootfs",
            args.qemu_rootfs,
            "--qemu-rootfs-entry-mode",
            args.qemu_rootfs_entry_mode,
            "--guest-cmd",
            args.guest_cmd,
        ]
    else:
        parts += ["--friscy-cmd", friscy_cmd, "--qemu-cmd", qemu_cmd]

    if args.node_path is not None:
        parts += ["--node-path", args.node_path]

    if args.max_divergences != 20:
        parts += ["--max-divergences", str(args.max_divergences)]
    if args.timeout is not None:
        parts += ["--timeout", str(args.timeout)]
    if args.focus_sys is not None:
        parts += ["--focus-sys", str(args.focus_sys)]
    if args.focus_pc is not None:
        parts += ["--focus-pc", hex(args.focus_pc)]
    if args.friscy_log is not None:
        parts += ["--friscy-log", args.friscy_log]
    if args.qemu_log is not None:
        parts += ["--qemu-log", args.qemu_log]
    if args.cwd is not None:
        parts += ["--cwd", args.cwd]
    if args.focused_diff:
        parts += ["--focused-diff"]
    if args.divergence_window != 4:
        parts += ["--divergence-window", str(args.divergence_window)]
    if args.divergence_checkpoint is not None:
        parts += ["--divergence-checkpoint", args.divergence_checkpoint]

    return " ".join(shlex.quote(p) for p in parts)


def build_mode_commands(args: argparse.Namespace) -> tuple[str, str]:
    if (args.friscy_rootfs is None) != (args.qemu_rootfs is None):
        raise RuntimeError("both --friscy-rootfs and --qemu-rootfs must be supplied together")
    if args.friscy_rootfs is None:
        if args.friscy_cmd is None or args.qemu_cmd is None:
            raise RuntimeError("either provide both --friscy-cmd and --qemu-cmd, or use --friscy-rootfs/--qemu-rootfs")
        return (
            _normalize_command(_apply_node_path(args.friscy_cmd, args.node_path)),
            _normalize_command(_apply_node_path(args.qemu_cmd, args.node_path)),
        )

    if args.friscy_cmd is not None or args.qemu_cmd is not None:
        raise RuntimeError("rootfs mode is active; omit --friscy-cmd/--qemu-cmd")

    if not args.guest_cmd:
        raise RuntimeError("--guest-cmd is required when using rootfs mode")

    friscy_rootfs = Path(args.friscy_rootfs).expanduser().resolve(strict=False)
    qemu_rootfs = Path(args.qemu_rootfs).expanduser().resolve(strict=False)

    qemu_bin = args.qemu_bin
    if qemu_bin == "qemu-riscv64" and shutil.which(qemu_bin) is None:
        static_qemu = shutil.which("qemu-riscv64-static")
        if static_qemu is not None:
            qemu_bin = static_qemu
    if shutil.which(qemu_bin) is None:
        raise RuntimeError(f"qemu binary not found: {qemu_bin}")

    node_path = None if args.node_path is None else args.node_path.strip()
    if node_path == "":
        node_path = None
    if node_path == "auto":
        node_path = None

    guest_argv = shlex.split(args.guest_cmd)
    if not guest_argv:
        raise RuntimeError("--guest-cmd could not be parsed into arguments")

    _validate_friscy_rootfs(friscy_rootfs)
    host_entry_mode = args.qemu_rootfs_entry_mode == "host"
    _ensure_qemu_rootfs_node_alias(qemu_rootfs)
    resolved_node_path = _resolve_node_path_for_guest_cmd(
        args.guest_cmd,
        qemu_rootfs,
        node_path,
        host_entry_mode=host_entry_mode,
    )
    friscy_guest_cmd = _apply_node_path(args.guest_cmd, resolved_node_path)
    qemu_guest_cmd = _apply_node_path(
        args.guest_cmd,
        None
        if resolved_node_path is None
        else _qemu_launch_node_path_for_rootfs(
            resolved_node_path,
            qemu_rootfs,
            host_entry_mode=host_entry_mode,
        ),
    )
    friscy_guest_argv = shlex.split(friscy_guest_cmd)
    qemu_guest_argv = shlex.split(qemu_guest_cmd)
    _validate_qemu_rootfs(qemu_rootfs, qemu_guest_argv, host_entry_mode=host_entry_mode)

    guest_entry = qemu_guest_argv[0]
    qemu_guest_entry = _qemu_entry_for_launch(guest_entry, qemu_rootfs, host_entry_mode=host_entry_mode)
    qemu_guest_argv = [qemu_guest_entry, *qemu_guest_argv[1:]]

    quoted_friscy_rootfs = shlex.quote(str(friscy_rootfs))
    quoted_qemu_rootfs = shlex.quote(str(qemu_rootfs))
    quoted_friscy_guest = [shlex.quote(a) for a in friscy_guest_argv]
    quoted_qemu_guest = [shlex.quote(a) for a in qemu_guest_argv]

    friscy_cmd = " ".join(
        [
            shlex.quote(args.friscy_bin),
            "--rootfs",
            quoted_friscy_rootfs,
            "--differential-syscall-trace",
            *quoted_friscy_guest,
        ]
    )
    qemu_parts = []
    if host_entry_mode:
        qemu_parts += ["env", "QEMU_LD_PREFIX=" + str(qemu_rootfs)]
    qemu_parts += [
        shlex.quote(qemu_bin),
        "-L",
        quoted_qemu_rootfs,
        "-strace",
        *quoted_qemu_guest,
    ]
    qemu_cmd = " ".join(qemu_parts)
    return friscy_cmd, qemu_cmd


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Compare friscy differential syscall traces against qemu-strace")
    p.add_argument("--friscy-cmd", help="Manual Friscy command line to run")
    p.add_argument("--qemu-cmd", help="Manual qemu-riscv64 command line to run")
    p.add_argument("--friscy-rootfs", help="Build Friscy command from a rootfs path")
    p.add_argument("--qemu-rootfs", help="Build qemu command from a rootfs path")
    p.add_argument("--guest-cmd", help="Guest command executed under rootfs mode, e.g. /bin/bash -lc 'echo hi'")
    p.add_argument(
        "--qemu-rootfs-entry-mode",
        choices=("host", "guest"),
        default="host",
        help=(
            "How qemu should invoke the rootfs entry when using --qemu-rootfs: "
            "'guest' passes entry paths unchanged so qemu resolves them under -L; "
            "'host' prefixes qemu rootfs to the guest path and exports QEMU_LD_PREFIX "
            "so nested execs of host-prefixed guest ELFs keep using the extracted rootfs."
        ),
    )
    p.add_argument("--node-path", help="Replace '/bin/node', '/usr/bin/node', or 'node' in command strings (rootfs + manual modes). Use 'auto' in rootfs mode to pick the first known node path in guest rootfs.")
    p.add_argument("--differential-tag", "--diff-tag", dest="differential_tag", help="Preset tag for reproducible launcher replay")
    p.add_argument("--friscy-bin", default="./build-native/friscy")
    p.add_argument("--qemu-bin", default="qemu-riscv64")
    p.add_argument("--max-divergences", type=int, default=20)
    p.add_argument("--timeout", type=int, default=None)
    p.add_argument("--focus-sys", type=int, default=None)
    p.add_argument("--focus-pc", type=lambda x: int(x, 16), default=None)
    p.add_argument("--focused-diff", action="store_true", help="Only diff mmap/munmap/mprotect/clone/execve/wait4/exit-family")
    p.add_argument("--divergence-window", type=int, default=4, help="Context window around first divergence")
    p.add_argument("--divergence-checkpoint", default=None, help="Best-effort checkpoint export path triggered after first divergence")
    p.add_argument("--friscy-log", default=None)
    p.add_argument("--qemu-log", default=None)
    p.add_argument("--cwd", default=None)
    p.add_argument("--symbol-root", default=None, help="Rootfs directory used for guest PC symbolization")
    p.add_argument("--addr2line", default="riscv64-linux-gnu-addr2line")
    p.add_argument("--readelf", default="readelf")
    p.add_argument("--no-symbolize", action="store_true")
    return p.parse_args()


def print_phase_markers(phase_state: PhaseState) -> None:
    if not phase_state.markers:
        print("[phase] no markers detected")
        return
    print("[phase] markers:")
    for marker in phase_state.markers:
        print(f"  line {marker.line_no:>5}: {marker.phase}: {marker.detail}")
    missing = [phase for phase in PHASE_ORDER if phase not in {m.phase for m in phase_state.markers}]
    if missing:
        print(f"[phase] missing: {', '.join(missing)}")


def describe_friscy_event(ev: FrEvent) -> str:
    parts = [f"idx={ev.idx}", syscall_display(ev.sys), f"pc=0x{ev.pc:x}"]
    if ev.symbol:
        parts.append(f"sym={ev.symbol}")
    if ev.phase:
        parts.append(f"phase={ev.phase}")
    parts.append(f"ret={to_signed64(ev.ret)}")
    return " ".join(parts)


def describe_qemu_event(ev: QEvent) -> str:
    parts = [f"idx={ev.idx}", syscall_display(ev.sysnum)]
    if ev.pc is not None:
        parts.append(f"pc=0x{ev.pc:x}")
    if ev.phase:
        parts.append(f"phase={ev.phase}")
    parts.append(f"ret={to_signed64(ev.ret)}")
    return " ".join(parts)


def print_event_context(
    friscy_events: Sequence[FrEvent],
    qemu_events: Sequence[QEvent],
    mismatch: EventMismatch,
    window: int,
) -> None:
    start = max(0, mismatch.idx - window)
    end = min(max(len(friscy_events), len(qemu_events)), mismatch.idx + window + 1)
    print(f"[first-divergence] idx={mismatch.idx} reason={mismatch.reason} window={window}")
    for i in range(start, end):
        prefix = ">>" if i == mismatch.idx else "  "
        fe = friscy_events[i] if i < len(friscy_events) else None
        qe = qemu_events[i] if i < len(qemu_events) else None
        left = describe_friscy_event(fe) if fe is not None else "(no friscy event)"
        right = describe_qemu_event(qe) if qe is not None else "(no qemu event)"
        print(f"{prefix} [{i:>4}] friscy {left}")
        print(f"{prefix} [{i:>4}] qemu   {right}")
    if mismatch.friscy is not None:
        print(f"[first-divergence] friscy raw: {mismatch.friscy.raw}")
    if mismatch.qemu is not None:
        print(f"[first-divergence] qemu raw:   {mismatch.qemu.raw}")


def maybe_export_divergence_checkpoint(
    args: argparse.Namespace,
    checkpoint_path: Optional[str],
    friscy_cmd: str,
) -> None:
    if checkpoint_path is None:
        return
    export_cmd = maybe_add_export_checkpoint(friscy_cmd, checkpoint_path)
    print(f"[checkpoint] best-effort export rerun: {export_cmd}")
    _, rc = run_command("friscy-checkpoint", export_cmd, args.timeout, args.cwd)
    path = Path(checkpoint_path)
    if rc == 0 and path.exists():
        print(f"[checkpoint] wrote {path}")
        return
    print("[checkpoint] export did not produce a checkpoint; native friscy can only export at supported stop points")


def main() -> int:
    args = parse_args()
    friscy_cmd, qemu_cmd = build_mode_commands(args)
    tag = tag_or_default(args)
    print(f"[run] tag: {tag}")
    print(f"[run] preset-cmd: {preset_invocation(args, friscy_cmd, qemu_cmd)}")
    print(f"[run] friscy-cmd: {friscy_cmd}")
    print(f"[run] qemu-cmd:   {qemu_cmd}")

    if args.differential_tag and args.friscy_log is None:
        args.friscy_log = f"{tag}.friscy.log"
    if args.differential_tag and args.qemu_log is None:
        args.qemu_log = f"{tag}.qemu.log"

    symbolizer = Symbolizer(args)
    friscy_output, _ = run_command("friscy", friscy_cmd, args.timeout, args.cwd)
    qemu_output, _ = run_command("qemu", qemu_cmd, args.timeout, args.cwd)

    if args.friscy_log:
        write_log(args.friscy_log, friscy_output)
    if args.qemu_log:
        write_log(args.qemu_log, qemu_output)

    phase_state = extract_phase_markers(friscy_output)
    friscy_events = parse_friscy(friscy_output, phase_state, symbolizer)
    qemu_events = parse_qemu(qemu_output)

    print(f"[parse] friscy events: {len(friscy_events)}")
    print(f"[parse] qemu events:   {len(qemu_events)}")

    if not friscy_events:
        print("[error] no DIFF entries from friscy. Add --differential-syscall-trace and re-run.")
        return 2
    if not qemu_events:
        print("[error] no qemu syscall lines parsed. Verify qemu -strace output.")
        return 2

    print_phase_markers(phase_state)

    if args.focus_sys is not None or args.focus_pc is not None or args.focused_diff:
        friscy_events = maybe_filter_friscy(friscy_events, args.focus_sys, args.focus_pc, args.focused_diff)
        qemu_events = maybe_filter_qemu(qemu_events, args.focus_sys, args.focused_diff)
        print(f"[filter] focus events: friscy={len(friscy_events)} qemu={len(qemu_events)}")

    mismatches = compare_traces(friscy_events, qemu_events, args.max_divergences)
    if mismatches:
        first = mismatches[0]
        print_event_context(friscy_events, qemu_events, first, args.divergence_window)
        maybe_export_divergence_checkpoint(args, args.divergence_checkpoint, friscy_cmd)
    else:
        print("[first-divergence] none")

    print(f"[summary] friscy={len(friscy_events)} qemu={len(qemu_events)} mismatches={len(mismatches)}")
    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main())

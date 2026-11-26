"""Put a slim pyvalhalla into a staged API folder as plain files, for scripts/deploy-vercel.sh
(SPEC-deploy.md, "Valhalla's share of the cold start").

Installed, pyvalhalla is 261 MB, over the Python builder's 225 MB standard size, and then every new
instance installs packages before it can answer. Most of that is zeros: auditwheel's patchelf put
each segment it added at a 2 MiB file offset, so the 50 bundled libraries are 96% padding. This
downloads the Linux wheel the lock names (hash checked), keeps only `valhalla/` without its command
line tools and `pyvalhalla.libs/`, moves each library's segments down to the first offset the loader
accepts, puts both under `src/` (on PYTHONPATH in the function) and drops pyvalhalla from the root
package in the staged `uv.lock`, which Vercel installs from with `uv sync --frozen`.

Usage: python3 scripts/vendor_valhalla.py STAGED_API_DIR
"""

import hashlib
import io
import struct
import subprocess
import sys
import tomllib
import zipfile
from pathlib import Path

WHEEL_SUFFIX = "-cp312-abi3-manylinux_2_28_x86_64.whl"  # Vercel's Python 3.12 on x86_64 Linux
KEEP = ("valhalla/", "pyvalhalla.libs/")
SKIP = ("valhalla/bin/",)  # valhalla_service and the tile builders; the API only imports the module
LOCK_LINE = '    { name = "pyvalhalla" },\n'

PAGE = 0x1000
PT_LOAD = 1
SHT_NULL, SHT_NOBITS = 0, 8
SHF_ALLOC = 2
EHDR = struct.Struct("<16sHHIQQQIHHHHHH")
PHDR = struct.Struct("<IIQQQQQQ")
SHDR = struct.Struct("<IIQQQQIIQQ")


def headers(data: bytes) -> tuple[list[int], list[list[int]], list[list[int]]]:
    if data[:4] != b"\x7fELF" or data[4] != 2 or data[5] != 1:
        raise ValueError("not a 64-bit little-endian ELF file")
    eh = list(EHDR.unpack_from(data))
    phs = [list(PHDR.unpack_from(data, eh[5] + i * PHDR.size)) for i in range(eh[10])]
    shs = [list(SHDR.unpack_from(data, eh[6] + i * SHDR.size)) for i in range(eh[12])]
    return eh, phs, shs


def compact(data: bytes) -> bytes:
    """The same library without the padding between load segments. Addresses don't change, so
    code, relocations and the dynamic table stay valid; only file offsets move."""
    eh, phs, shs = headers(data)
    loads: list[tuple[int, int, int]] = []  # (old offset, old end, shift down) in file order
    end = 0
    for p in sorted((p for p in phs if p[0] == PT_LOAD), key=lambda p: p[2]):
        off, vaddr, filesz = p[2], p[3], p[5]
        if loads and off < loads[-1][1]:  # shares bytes with the segment before: move together
            shift = loads[-1][2]
        else:  # the loader needs offset == vaddr modulo the page, nothing more
            shift = off - (end + (vaddr - end) % PAGE)
        if shift < 0:
            raise ValueError(f"segment at {off:#x} would move up")
        loads.append((off, off + filesz, shift))
        end = max(end, off + filesz - shift)

    def moved(off: int, size: int = 0) -> int | None:
        for start, stop, shift in loads:
            if start <= off and off + size <= stop:
                return off - shift
        return None

    out = bytearray(end)
    for start, stop, shift in loads:
        out[start - shift : stop - shift] = data[start:stop]
    for p in phs:
        new = moved(p[2], p[5])
        if new is None:
            raise ValueError(f"program header at {p[2]:#x} lies outside the load segments")
        if p[0] == PT_LOAD and new != p[2]:
            p[7] = PAGE  # keeps (vaddr - offset) % align == 0, which readelf and friends check
        p[2] = new
    # Sections the loader never maps (names, symbols, debug links) go after the segments.
    for s in sorted(shs, key=lambda s: s[4]):
        if s[1] == SHT_NULL or s[1] == SHT_NOBITS:  # no bytes in the file
            s[4] = moved(s[4]) or s[4]
            continue
        new = moved(s[4], s[5])
        if new is None:
            if s[2] & SHF_ALLOC:
                raise ValueError(f"mapped section at {s[4]:#x} lies outside the load segments")
            new = -(-len(out) // max(s[8], 1)) * max(s[8], 1)
            out += bytes(new - len(out)) + data[s[4] : s[4] + s[5]]
        s[4] = new
    phoff = moved(eh[5], len(phs) * PHDR.size)
    if phoff is None:
        raise ValueError("program header table lies outside the load segments")
    eh[5], eh[6] = phoff, -(-len(out) // 8) * 8
    out += bytes(eh[6] - len(out))
    for s in shs:
        out += SHDR.pack(*s)
    EHDR.pack_into(out, 0, *eh)
    for i, p in enumerate(phs):
        PHDR.pack_into(out, phoff + i * PHDR.size, *p)
    check_same(data, bytes(out))
    return bytes(out)


def check_same(old: bytes, new: bytes) -> None:
    """Self-check: every segment and section holds the same bytes at the same address, apart from
    the file and program headers, whose offsets this rewrote."""
    old_eh, old_ph, old_sh = headers(old)
    new_eh, new_ph, new_sh = headers(new)

    def masked(data: bytes, eh: list[int]) -> bytes:
        out = bytearray(data)
        out[: EHDR.size] = bytes(EHDR.size)
        out[eh[5] : eh[5] + eh[10] * PHDR.size] = bytes(eh[10] * PHDR.size)
        return bytes(out)

    old, new = masked(old, old_eh), masked(new, new_eh)
    for a, b in zip(old_ph, new_ph, strict=True):  # offset is field 2, filesz 5, align 7
        if a[:2] + a[3:7] != b[:2] + b[3:7] or old[a[2] : a[2] + a[5]] != new[b[2] : b[2] + b[5]]:
            raise AssertionError(f"segment changed: {a} -> {b}")
        if a[0] == PT_LOAD and (b[3] - b[2]) % PAGE:
            raise AssertionError(f"segment at {b[2]:#x} not page-congruent")
    for a, b in zip(old_sh, new_sh, strict=True):  # offset is field 4, size 5
        if a[:4] + a[5:] != b[:4] + b[5:]:
            raise AssertionError(f"section header changed: {a} -> {b}")
        if a[1] != SHT_NOBITS and old[a[4] : a[4] + a[5]] != new[b[4] : b[4] + b[5]]:
            raise AssertionError(f"section bytes moved wrongly at old offset {a[4]:#x}")


def main(api: Path) -> None:
    lock_path = api / "uv.lock"
    text = lock_path.read_text()
    wheels = [
        p.get("wheels", []) for p in tomllib.loads(text)["package"] if p["name"] == "pyvalhalla"
    ]
    wheel = next((w for ws in wheels for w in ws if w["url"].endswith(WHEEL_SUFFIX)), None)
    if wheel is None:
        sys.exit(f"vendor_valhalla: no pyvalhalla wheel ending {WHEEL_SUFFIX} in uv.lock")
    # curl, not urllib: python.org's macOS Python has no CA certificates until a manual step
    blob = subprocess.run(
        ["curl", "-fsSL", "--max-time", "300", wheel["url"]], stdout=subprocess.PIPE, check=True
    ).stdout
    if "sha256:" + hashlib.sha256(blob).hexdigest() != wheel["hash"]:
        sys.exit(f"vendor_valhalla: hash mismatch for {wheel['url']}")

    src = api / "src"
    before = after = 0
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        for info in z.infolist():
            name = info.filename
            if info.is_dir() or not name.startswith(KEEP) or name.startswith(SKIP):
                continue
            data = z.read(info)
            before += len(data)
            if name.endswith(".so") or ".so." in name:
                data = compact(data)
            after += len(data)
            path = src / name  # wheel names are checked by the hash; still refuse to leave src/
            if not path.resolve().is_relative_to(src.resolve()):
                sys.exit(f"vendor_valhalla: unsafe path in wheel: {name}")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

    if text.count(LOCK_LINE) != 1:
        sys.exit("vendor_valhalla: expected one pyvalhalla dependency line in uv.lock")
    text = text.replace(LOCK_LINE, "")
    root = next(p for p in tomllib.loads(text)["package"] if p["source"].get("editable") == ".")
    if any(d["name"] == "pyvalhalla" for d in root.get("dependencies", [])):
        sys.exit("vendor_valhalla: pyvalhalla still a dependency of the root package")
    lock_path.write_text(text)
    print(
        f"vendor_valhalla: {wheel['url'].rsplit('/', 1)[1]}, {before / 2**20:.1f} MiB kept, "
        f"{after / 2**20:.1f} MiB after compacting, into {src}"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 scripts/vendor_valhalla.py STAGED_API_DIR")
    main(Path(sys.argv[1]))

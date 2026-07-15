#!/usr/bin/env python3
"""Assemble lab_mcu_stm32.hex: GPIOA PA0 blink (source LED: HIGH = on)."""


def u32(x: int) -> bytes:
    return bytes([x & 0xFF, (x >> 8) & 0xFF, (x >> 16) & 0xFF, (x >> 24) & 0xFF])


def ldr_pc(rt: int, target_addr: int, insn_addr: int) -> int:
    pc = (insn_addr + 4) & ~3
    assert target_addr >= pc and (target_addr - pc) % 4 == 0
    imm = (target_addr - pc) // 4
    assert 0 <= imm <= 255
    return 0x4800 | (rt << 8) | imm


def b_op(insn_a: int, target: int) -> int:
    off = (target - (insn_a + 4)) // 2
    assert -1024 <= off <= 1023, off
    return 0xE000 | (off & 0x7FF)


def checksum(bs: list[int]) -> int:
    return (-(sum(bs))) & 0xFF


def ihex(addr: int, data: bytes) -> str:
    rec = [len(data), (addr >> 8) & 0xFF, addr & 0xFF, 0] + list(data)
    rec.append(checksum(rec))
    return ':' + ''.join(f'{b:02X}' for b in rec)


def main() -> None:
    # RCC enable IOPAEN; GPIOA CRL MODE0=01 (out 10MHz); ODR toggle PA0
    pool_vals = [
        0x40021018,  # RCC_APB2ENR
        0x00000004,  # IOPAEN
        0x40010800,  # GPIOA base
        0x00000001,  # CRL PA0 out PP
        0x00000001,  # ODR PA0 high
        0x00000000,  # ODR PA0 low
    ]

    patched: dict[int, int] = {}
    addr = 0x08000100
    ldr_sites: list[tuple[int, int, int]] = []

    def emit(hwv: int) -> None:
        nonlocal addr
        patched[addr] = hwv
        addr += 2

    def emit_ldr(rt: int, pool_idx: int) -> None:
        nonlocal addr
        ldr_sites.append((addr, rt, pool_idx))
        emit(0)

    # enable GPIOA clock
    emit_ldr(0, 0)
    emit_ldr(1, 1)
    emit(0x6001)  # STR R1, [R0]

    # configure PA0 output
    emit_ldr(0, 2)
    emit_ldr(1, 3)
    emit(0x6001)  # STR R1, [R0]  → CRL

    loop_addr = addr
    emit_ldr(1, 4)
    emit(0x60C1)  # STR R1, [R0, #12] → ODR high
    for _ in range(120):
        emit(0xBF00)  # NOP delay
    emit_ldr(1, 5)
    emit(0x60C1)  # ODR low
    for _ in range(120):
        emit(0xBF00)
    b_site = addr
    emit(0)

    while addr % 4 != 0:
        emit(0xBF00)

    pool_addrs: list[int] = []
    for v in pool_vals:
        pool_addrs.append(addr)
        emit(v & 0xFFFF)
        emit((v >> 16) & 0xFFFF)

    for ia, rt, pi in ldr_sites:
        patched[ia] = ldr_pc(rt, pool_addrs[pi], ia)
    patched[b_site] = b_op(b_site, loop_addr)

    end = max(patched.keys()) + 2
    size = end - 0x08000000
    img = bytearray(max(size, 0x42))
    img[0:4] = u32(0x20001000)
    img[4:8] = u32(0x08000101)
    for a, h in patched.items():
        o = a - 0x08000000
        img[o] = h & 0xFF
        img[o + 1] = (h >> 8) & 0xFF
    img[0x40] = 0xFE
    img[0x41] = 0xE7

    lines = [':020000040800F2']
    off = 0
    while off < len(img):
        chunk = bytes(img[off:off + 16])
        interesting = (
            off < 0x10
            or (0x40 <= off < 0x50)
            or off >= 0x100
            or any(b != 0 for b in chunk)
        )
        if interesting:
            lines.append(ihex(off, chunk))
        off += 16
    lines.append(':00000001FF')
    text = '\n'.join(lines) + '\n'

    paths = [
        r'c:\Projects\ElecDraw_Harmony\hex_files\lab_mcu_stm32.hex',
        r'c:\Projects\ElecDraw_Harmony\entry\src\main\resources\rawfile\hex_files\lab_mcu_stm32.hex',
    ]
    for p in paths:
        with open(p, 'w', newline='\n', encoding='ascii') as f:
            f.write(text)
        print('wrote', p, 'bytes', len(img))


if __name__ == '__main__':
    main()

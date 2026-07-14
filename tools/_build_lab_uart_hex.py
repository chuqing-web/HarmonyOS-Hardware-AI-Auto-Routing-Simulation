#!/usr/bin/env python3
"""Assemble lab_uart.hex: USART init + RX echo + free-run TX 0x55."""


def u32(x: int) -> bytes:
    return bytes([x & 0xFF, (x >> 8) & 0xFF, (x >> 16) & 0xFF, (x >> 24) & 0xFF])


def ldr_pc(rt: int, target_addr: int, insn_addr: int) -> int:
    pc = (insn_addr + 4) & ~3
    assert target_addr >= pc and (target_addr - pc) % 4 == 0
    imm = (target_addr - pc) // 4
    assert 0 <= imm <= 255
    return 0x4800 | (rt << 8) | imm


def beq_op(insn_a: int, target: int) -> int:
    off = (target - (insn_a + 4)) // 2
    assert -128 <= off <= 127, off
    return 0xD000 | (off & 0xFF)


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
    pool_vals = [
        0x40021018,  # RCC_APB2ENR
        0x00000400,  # enable bits
        0x40010800,  # GPIOA
        0x00004B00,  # CRH
        0x40013800,  # USART1
        0x00001D4C,  # CR1
        0x0000200C,  # Baud/other
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

    emit_ldr(0, 0)
    emit_ldr(1, 1)
    emit(0x6001)
    emit_ldr(0, 2)
    emit_ldr(1, 3)
    emit(0x6001)
    emit_ldr(0, 4)
    emit_ldr(1, 5)
    emit(0x6081)
    emit_ldr(1, 6)
    emit(0x60C1)

    loop_addr = addr
    emit(0x7801)
    emit(0x2220)
    emit(0x4211)
    beq_site = addr
    emit(0)
    emit(0x7903)
    wait_addr = addr
    emit(0x7801)
    emit(0x2280)
    emit(0x4211)
    beq_wait_site = addr
    emit(0)
    emit(0x7103)
    b_echo_done = addr
    emit(0)
    tx_poll = addr
    emit(0x7801)
    emit(0x2280)
    emit(0x4211)
    beq_idle = addr
    emit(0)
    emit(0x2155)
    emit(0x7101)
    b_end = addr
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

    patched[beq_site] = beq_op(beq_site, tx_poll)
    patched[beq_wait_site] = beq_op(beq_wait_site, wait_addr)
    patched[b_echo_done] = b_op(b_echo_done, loop_addr)
    patched[beq_idle] = beq_op(beq_idle, loop_addr)
    patched[b_end] = b_op(b_end, loop_addr)

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
        r'c:\Projects\ElecDraw_Harmony\hex_files\lab_uart.hex',
        r'c:\Projects\ElecDraw_Harmony\entry\src\main\resources\rawfile\hex_files\lab_uart.hex',
    ]
    for p in paths:
        with open(p, 'w', newline='\n', encoding='ascii') as f:
            f.write(text)
        print('wrote', p, 'bytes', len(img))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Assemble lab_peripheral.hex: KEY(PA1) → RELAY(PA2)/BUZZER(PA3), stable LCD/OLED lines.

GPIOA teaching map: package Pn = PA(n-1)
  KEY=P2(PA1 input) REL=P3(PA2) BUZ=P4(PA3)
  OLED_SDA=P8(PA7) OLED_SCL=P9(PA8)
  LCD_RS=P11(PA10) D4..D7=P12..P15(PA11..14) E=P16(PA15)

Logic (active-low KEY with external pull-up):
  KEY pressed  (PA1=0) → PA2+PA3 high (relay coil / buzzer on)
  KEY released (PA1=1) → PA2+PA3 low
  LCD/OLED lines held low idle (no blink)
"""


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


def beq_op(insn_a: int, target: int) -> int:
    off = (target - (insn_a + 4)) // 2
    assert -128 <= off <= 127, off
    return 0xD000 | (off & 0xFF)


def bne_op(insn_a: int, target: int) -> int:
    off = (target - (insn_a + 4)) // 2
    assert -128 <= off <= 127, off
    return 0xD100 | (off & 0xFF)


def checksum(bs: list[int]) -> int:
    return (-(sum(bs))) & 0xFF


def ihex(addr: int, data: bytes) -> str:
    rec = [len(data), (addr >> 8) & 0xFF, addr & 0xFF, 0] + list(data)
    rec.append(checksum(rec))
    return ':' + ''.join(f'{b:02X}' for b in rec)


def main() -> None:
    # CRL nibbles (low → high pin): PA0..PA7
    # PA1 = input floating (CNF=01 MODE=00 → 0x4)
    # PA2/PA3/PA7 = out PP 10MHz (0x1)
    # Was 0x10011040 — that encoded PA2=MODE00 (input!) so REL never drove.
    # Correct: PA0=0 PA1=4 PA2=1 PA3=1 PA4=0 PA5=0 PA6=0 PA7=1 → 0x10001140
    crl = 0x10001140
    # CRH: PA8/PA10..PA15 out PP; PA9 unused
    crh = 0x11111101
    # Active outputs when KEY pressed: REL(PA2) + BUZ(PA3)
    odr_on = (1 << 2) | (1 << 3)
    odr_off = 0x00000000

    pool_vals = [
        0x40021018,  # RCC_APB2ENR
        0x00000004,  # IOPAEN
        0x40010800,  # GPIOA CRL
        crl,
        0x40010804,  # GPIOA CRH
        crh,
        0x40010808,  # GPIOA IDR
        0x4001080C,  # GPIOA ODR
        odr_on,
        odr_off,
    ]

    patched: dict[int, int] = {}
    addr = 0x08000100
    ldr_sites: list[tuple[int, int, int]] = []
    patch_sites: dict[str, int] = {}

    def emit(hwv: int) -> None:
        nonlocal addr
        patched[addr] = hwv
        addr += 2

    def emit_ldr(rt: int, pool_idx: int) -> None:
        nonlocal addr
        ldr_sites.append((addr, rt, pool_idx))
        emit(0)

    # RCC IOPAEN
    emit_ldr(0, 0)
    emit_ldr(1, 1)
    emit(0x6001)  # STR R1, [R0]

    # GPIOA CRL
    emit_ldr(0, 2)
    emit_ldr(1, 3)
    emit(0x6001)

    # GPIOA CRH
    emit_ldr(0, 4)
    emit_ldr(1, 5)
    emit(0x6001)

    # R4 = IDR, R5 = ODR (stable across loop)
    emit_ldr(4, 6)
    emit_ldr(5, 7)

    loop_addr = addr
    emit(0x6820)  # LDR R0, [R4]          ; IDR
    emit(0x0840)  # LSRS R0, R0, #1       ; PA1 → bit0
    emit(0x07C0)  # LSLS R0, R0, #31
    emit(0x0FC0)  # LSRS R0, R0, #31      ; R0 = PA1 (0/1)

    # if PA1==0 (pressed) → ODR=on else ODR=off
    patch_sites['bne_released'] = addr
    emit(0)       # BNE released
    emit_ldr(1, 8)
    emit(0x6029)  # STR R1, [R5]
    patch_sites['b_continue'] = addr
    emit(0)       # B continue
    released_addr = addr
    emit_ldr(1, 9)
    emit(0x6029)  # STR R1, [R5]
    continue_addr = addr
    for _ in range(40):
        emit(0xBF00)
    patch_sites['b_loop'] = addr
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

    patched[patch_sites['bne_released']] = bne_op(patch_sites['bne_released'], released_addr)
    patched[patch_sites['b_continue']] = b_op(patch_sites['b_continue'], continue_addr)
    patched[patch_sites['b_loop']] = b_op(patch_sites['b_loop'], loop_addr)

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
        r'c:\Projects\ElecDraw_Harmony\hex_files\lab_peripheral.hex',
        r'c:\Projects\ElecDraw_Harmony\entry\src\main\resources\rawfile\hex_files\lab_peripheral.hex',
    ]
    for p in paths:
        with open(p, 'w', newline='\n', encoding='ascii') as f:
            f.write(text)
        print('wrote', p, 'bytes', len(img))


if __name__ == '__main__':
    main()

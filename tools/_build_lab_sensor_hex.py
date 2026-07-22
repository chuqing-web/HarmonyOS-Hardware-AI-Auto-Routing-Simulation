#!/usr/bin/env python3
"""Assemble lab_sensor.hex: STM32 reads sensors → indicator LEDs.

Pin map (matches redesigned buildLabSensor):
  PA0  ADC (POT+LDR)            input → D_ADC  PA4 when PA0 high
  PA3  1WIRE / DS18B20 teach    input → D_TEMP PA6 when PA3 high (warm)
  PB0  HALL (magnet pulls low)  input → D_HALL PA5 when PB0 low
  PA4/PA5/PA6 LED anodes (active-high)

CRL_A = 0x01114004  PA0/PA3=in(0x4), PA4/5/6=out(0x1)
CRL_B = 0x00000004  PB0=in
"""


def u32(x: int) -> bytes:
    return bytes([x & 0xFF, (x >> 8) & 0xFF, (x >> 16) & 0xFF, (x >> 24) & 0xFF])


def ldr_pc(rt: int, target_addr: int, insn_addr: int) -> int:
    pc = (insn_addr + 4) & ~3
    assert target_addr >= pc and (target_addr - pc) % 4 == 0
    imm = (target_addr - pc) // 4
    assert 0 <= imm <= 255, f'imm={imm} insn={hex(insn_addr)} pool={hex(target_addr)}'
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
    crl_a = 0x01114004
    crl_b = 0x00000004
    rcc_en = 0x0000000C  # IOPAEN|IOPBEN

    pool_vals = [
        0x40021018, rcc_en,
        0x40010800, crl_a,
        0x40010C00, crl_b,
        0x40010808,  # GPIOA IDR
        0x40010C08,  # GPIOB IDR
        0x4001080C,  # GPIOA ODR
        0x00000010,  # PA4
        0x00000020,  # PA5
        0x00000040,  # PA6
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

    # RCC
    emit_ldr(0, 0)
    emit_ldr(1, 1)
    emit(0x6001)

    # GPIOA CRL
    emit_ldr(0, 2)
    emit_ldr(1, 3)
    emit(0x6001)

    # GPIOB CRL
    emit_ldr(0, 4)
    emit_ldr(1, 5)
    emit(0x6001)

    # R4=IDR_A R5=IDR_B R6=ODR_A
    emit_ldr(4, 6)
    emit_ldr(5, 7)
    emit_ldr(6, 8)

    loop_addr = addr
    emit(0x2000)  # MOV R0, #0
    emit(0x6821)  # LDR R1, [R4]

    # PA0 → PA4
    emit(0x000A)  # MOV R2, R1
    emit(0x07D2)  # LSLS R2, R2, #31
    emit(0x0FD2)  # LSRS R2, R2, #31
    patch_sites['beq_adc'] = addr
    emit(0)
    emit_ldr(3, 9)
    emit(0x4318)  # ORR R0, R3
    skip_adc = addr

    # PA3 → PA6
    emit(0x000A)  # MOV R2, R1
    emit(0x08D2)  # LSRS R2, R2, #3
    emit(0x07D2)
    emit(0x0FD2)
    patch_sites['beq_temp'] = addr
    emit(0)
    emit_ldr(3, 11)
    emit(0x4318)
    skip_temp = addr

    # PB0 low → PA5
    emit(0x682A)  # LDR R2, [R5]
    emit(0x07D2)
    emit(0x0FD2)
    patch_sites['bne_hall'] = addr
    emit(0)
    emit_ldr(3, 10)
    emit(0x4318)
    skip_hall = addr

    emit(0x6030)  # STR R0, [R6]
    for _ in range(30):
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

    patched[patch_sites['beq_adc']] = beq_op(patch_sites['beq_adc'], skip_adc)
    patched[patch_sites['beq_temp']] = beq_op(patch_sites['beq_temp'], skip_temp)
    patched[patch_sites['bne_hall']] = bne_op(patch_sites['bne_hall'], skip_hall)
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
        r'c:\Projects\ElecDraw_Harmony\hex_files\lab_sensor.hex',
        r'c:\Projects\ElecDraw_Harmony\entry\src\main\resources\rawfile\hex_files\lab_sensor.hex',
    ]
    for p in paths:
        with open(p, 'w', newline='\n', encoding='ascii') as f:
            f.write(text)
        print('wrote', p, 'bytes', len(img), 'crl_a', hex(crl_a))


if __name__ == '__main__':
    main()

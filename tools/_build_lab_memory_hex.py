#!/usr/bin/env python3
"""Assemble lab_memory.hex: GPIO bit-bang I2C / SPI / parallel memory bus demo.

Pin map (matches buildLabMemory + LA probes):
  I2C  PB6=SCL  PB7=SDA
  SPI  PA4=CS   PA5=SCK  PA7=MOSI  (PA6=MISO input)
  MEM  PB8=EPROM_CE  PB10=SRAM_CE
  ADDR PC0=A0   DATA PA8=D0

Loop (visible on LA CH1–8):
  1) I2C start + 4 SCL clocks + stop
  2) SPI CS low + 4 SCK pulses
  3) Parallel A0 + CE pulses
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


def checksum(bs: list[int]) -> int:
    return (-(sum(bs))) & 0xFF


def ihex(addr: int, data: bytes) -> str:
    rec = [len(data), (addr >> 8) & 0xFF, addr & 0xFF, 0] + list(data)
    rec.append(checksum(rec))
    return ':' + ''.join(f'{b:02X}' for b in rec)


def main() -> None:
    crl_a = 0x14110000  # PA4/5/7 out, PA6 in
    crh_a = 0x11111111  # PA8..15 out
    crl_b = 0x11000000  # PB6/7 out
    crh_b = 0x00011111  # PB8..12 out
    crl_c = 0x11111111  # PC0..7 out

    odr_a_idle = 0x00000010       # CS high
    odr_b_idle = 0x00001FC0       # PB6..12 high
    odr_c_idle = 0x00000000

    i2c_both = 0x00001FC0
    i2c_sda0 = 0x00001F40
    i2c_scl0_sda0 = 0x00001F00
    i2c_scl0_sda1 = 0x00001F80
    i2c_scl1_sda1 = 0x00001FC0

    spi_cs0 = 0x00000000
    spi_clk1 = 0x00000020
    spi_clk1_mosi = 0x000000A0
    spi_clk0_mosi = 0x00000080

    mem_ce_lo = 0x00001EC0
    sram_ce_lo = 0x00001BC0
    a0_hi = 0x00000001
    d0_hi = 0x00000100

    init_pool = [
        0x40021018, 0x0000001C,
        0x40010800, crl_a, 0x40010804, crh_a,
        0x40010C00, crl_b, 0x40010C04, crh_b,
        0x40011000, crl_c,
        0x4001080C, 0x40010C0C, 0x4001100C,
        odr_a_idle, odr_b_idle, odr_c_idle,
    ]

    loop_pool = [
        i2c_both, i2c_sda0, i2c_scl0_sda0, i2c_scl0_sda1, i2c_scl1_sda1,
        spi_cs0, spi_clk1, spi_clk1_mosi, spi_clk0_mosi,
        odr_a_idle, odr_b_idle, odr_c_idle,
        mem_ce_lo, sram_ce_lo, a0_hi, d0_hi,
    ]

    patched: dict[int, int] = {}
    addr = 0x08000100
    init_ldr: list[tuple[int, int, int]] = []
    loop_ldr: list[tuple[int, int, int]] = []
    use_loop_pool = False

    def emit(hwv: int) -> None:
        nonlocal addr
        patched[addr] = hwv
        addr += 2

    def emit_ldr(rt: int, pool_idx: int) -> None:
        nonlocal addr
        sites = loop_ldr if use_loop_pool else init_ldr
        sites.append((addr, rt, pool_idx))
        emit(0)

    def delay(n: int = 8) -> None:
        for _ in range(n):
            emit(0xBF00)

    def store_a(pi: int) -> None:
        emit_ldr(1, pi)
        emit(0x6021)  # STR R1, [R4]

    def store_b(pi: int) -> None:
        emit_ldr(1, pi)
        emit(0x6029)  # STR R1, [R5]

    def store_c(pi: int) -> None:
        emit_ldr(1, pi)
        emit(0x6031)  # STR R1, [R6]

    # --- init ---
    emit_ldr(0, 0)
    emit_ldr(1, 1)
    emit(0x6001)

    emit_ldr(0, 2)
    emit_ldr(1, 3)
    emit(0x6001)
    emit_ldr(0, 4)
    emit_ldr(1, 5)
    emit(0x6001)

    emit_ldr(0, 6)
    emit_ldr(1, 7)
    emit(0x6001)
    emit_ldr(0, 8)
    emit_ldr(1, 9)
    emit(0x6001)

    emit_ldr(0, 10)
    emit_ldr(1, 11)
    emit(0x6001)

    emit_ldr(4, 12)
    emit_ldr(5, 13)
    emit_ldr(6, 14)

    emit_ldr(1, 15)
    emit(0x6021)
    emit_ldr(1, 16)
    emit(0x6029)
    emit_ldr(1, 17)
    emit(0x6031)

    b_over_init_pool = addr
    emit(0)

    while addr % 4 != 0:
        emit(0xBF00)

    init_pool_addrs: list[int] = []
    for v in init_pool:
        init_pool_addrs.append(addr)
        emit(v & 0xFFFF)
        emit((v >> 16) & 0xFFFF)

    after_init_pool = addr
    patched[b_over_init_pool] = b_op(b_over_init_pool, after_init_pool)
    for ia, rt, pi in init_ldr:
        patched[ia] = ldr_pc(rt, init_pool_addrs[pi], ia)

    # --- loop ---
    use_loop_pool = True
    loop_addr = addr

    # I2C  (loop pool idx 0..4)
    store_b(0)
    delay()
    store_b(1)  # START
    delay()
    for bit_hi in (False, True, False, True):
        store_b(3 if bit_hi else 2)
        delay(6)
        store_b(4 if bit_hi else 1)
        delay(6)
    store_b(1)
    delay(6)
    store_b(0)  # STOP
    delay(10)

    # SPI (5..8, idle A=9)
    store_a(5)
    delay(6)
    for mosi_hi in (False, True, False, True):
        store_a(8 if mosi_hi else 5)
        delay(5)
        store_a(7 if mosi_hi else 6)
        delay(5)
    store_a(9)
    delay(10)

    # Parallel (A0=14, D0=15, CE=12/13, idle B/C=10/11)
    store_c(14)
    store_a(15)
    delay(6)
    store_b(12)
    delay(8)
    store_b(10)
    delay(6)
    store_b(13)
    delay(8)
    store_b(10)
    store_c(11)
    store_a(9)
    delay(12)

    b_over_loop_pool = addr
    emit(0)

    while addr % 4 != 0:
        emit(0xBF00)

    loop_pool_addrs: list[int] = []
    for v in loop_pool:
        loop_pool_addrs.append(addr)
        emit(v & 0xFFFF)
        emit((v >> 16) & 0xFFFF)

    after_loop_pool = addr
    patched[b_over_loop_pool] = b_op(b_over_loop_pool, after_loop_pool)
    for ia, rt, pi in loop_ldr:
        patched[ia] = ldr_pc(rt, loop_pool_addrs[pi], ia)

    b_back = addr
    emit(0)
    patched[b_back] = b_op(b_back, loop_addr)

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
        r'c:\Projects\ElecDraw_Harmony\hex_files\lab_memory.hex',
        r'c:\Projects\ElecDraw_Harmony\entry\src\main\resources\rawfile\hex_files\lab_memory.hex',
    ]
    for p in paths:
        with open(p, 'w', newline='\n', encoding='ascii') as f:
            f.write(text)
        print('wrote', p, 'bytes', len(img))


if __name__ == '__main__':
    main()

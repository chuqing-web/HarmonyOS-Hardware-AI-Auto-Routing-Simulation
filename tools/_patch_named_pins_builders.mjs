import fs from 'fs';

function patch(path, fn) {
  let s = fs.readFileSync(path, 'utf8');
  const before = s;
  s = fn(s);
  fs.writeFileSync(path, s);
  console.log(path, s === before ? 'NOCHANGE' : 'UPDATED');
}

function patchBuilders(s) {
  // 8051
  s = s.replaceAll("crystal(doc, mcu, xtal, c1, c2, 'P18', 'P19'", "crystal(doc, mcu, xtal, c1, c2, 'XTAL1', 'XTAL2'");
  s = s.replaceAll("mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'P40', 'P20', 'P9'", "mcuCore(doc, mcu, vcc, gnd, rRst, cDec, 'VCC', 'GND', 'RST'");
  s = s.replaceAll("p(mcu, 'P31', 'P31')", "p(mcu, 'EA', 'EA')");
  // LED on 8051: P1..P8 → P1.0..P1.7
  s = s.replace(
    /const pinId = `P\$\{i \+ 1\}`;/g,
    'const pinId = `P1.${i}`;'
  );
  s = s.replaceAll("p(mcu, 'P1', 'P1')", "p(mcu, 'P1.0', 'P1.0')");

  // STM32 core
  s = s.replaceAll("'P5', 'P6'", "'OSC_IN', 'OSC_OUT'");
  s = s.replaceAll("'P48', 'P24', 'P7'", "'VDD', 'VSS', 'NRST'");
  s = s.replaceAll("const vccPin = isF407 ? 'P100' : 'P48';", "const vccPin = 'VDD';");
  s = s.replaceAll("const gndPin = isF407 ? 'P50' : 'P24';", "const gndPin = 'VSS';");
  // remaining ', P7,' in mcuCore for stm32 array
  s = s.replace(/mcuCore\(doc, mcu, vcc, gnd, rRst, cDec, vccPin, gndPin, 'P7'/g,
    "mcuCore(doc, mcu, vcc, gnd, rRst, cDec, vccPin, gndPin, 'NRST'");

  // UART
  s = s.replaceAll("p(uart, 'TX', 'TX'), p(mcu, 'P10', 'P10')", "p(uart, 'TX', 'TX'), p(mcu, 'PA9', 'PA9')");
  s = s.replaceAll("p(uart, 'RX', 'RX'), p(mcu, 'P11', 'P11')", "p(uart, 'RX', 'RX'), p(mcu, 'PA10', 'PA10')");

  // Peripheral GPIO
  s = s.replaceAll("p(sw, '1'), p(mcu, 'P2', 'P2')", "p(sw, '1'), p(mcu, 'PA1', 'PA1')");
  s = s.replaceAll("p(rRel, '1'), p(mcu, 'P3', 'P3')", "p(rRel, '1'), p(mcu, 'PA2', 'PA2')");
  s = s.replaceAll("p(rb, '1'), p(mcu, 'P4', 'P4')", "p(rb, '1'), p(mcu, 'PA3', 'PA3')");
  s = s.replaceAll("p(mcu, 'P1', 'P1'), p(gnd", "p(mcu, 'PA0', 'PA0'), p(gnd");
  s = s.replaceAll("K.ledBranch(doc, p(mcu, 'P1', 'P1')", "K.ledBranch(doc, p(mcu, 'PA0', 'PA0')");

  // LCD named + MCU pins
  s = s.replaceAll("p(lcd, '1')", "p(lcd, 'VSS', 'VSS')");
  s = s.replaceAll("p(lcd, '2')", "p(lcd, 'VDD', 'VDD')");
  s = s.replaceAll("p(lcd, '3')", "p(lcd, 'V0', 'V0')");
  s = s.replaceAll("p(lcd, '4')", "p(lcd, 'RS', 'RS')");
  s = s.replaceAll("p(lcd, '5')", "p(lcd, 'RW', 'RW')");
  s = s.replaceAll("p(lcd, '6')", "p(lcd, 'E', 'E')");
  s = s.replaceAll("p(lcd, '11')", "p(lcd, 'D4', 'D4')");
  s = s.replaceAll("p(lcd, '12')", "p(lcd, 'D5', 'D5')");
  s = s.replaceAll("p(lcd, '13')", "p(lcd, 'D6', 'D6')");
  s = s.replaceAll("p(lcd, '14')", "p(lcd, 'D7', 'D7')");
  s = s.replaceAll("p(lcd, '15')", "p(lcd, 'A', 'A')");
  s = s.replaceAll("p(lcd, '16')", "p(lcd, 'K', 'K')");

  s = s.replaceAll("p(lcd, 'RS', 'RS'), p(mcu, 'P11', 'P11')", "p(lcd, 'RS', 'RS'), p(mcu, 'PB0', 'PB0')");
  s = s.replaceAll("p(lcd, 'E', 'E'), p(mcu, 'P16', 'P16')", "p(lcd, 'E', 'E'), p(mcu, 'PB1', 'PB1')");
  s = s.replaceAll("p(lcd, 'D4', 'D4'), p(mcu, 'P12', 'P12')", "p(lcd, 'D4', 'D4'), p(mcu, 'PB12', 'PB12')");
  s = s.replaceAll("p(lcd, 'D5', 'D5'), p(mcu, 'P13', 'P13')", "p(lcd, 'D5', 'D5'), p(mcu, 'PB13', 'PB13')");
  s = s.replaceAll("p(lcd, 'D6', 'D6'), p(mcu, 'P14', 'P14')", "p(lcd, 'D6', 'D6'), p(mcu, 'PB14', 'PB14')");
  s = s.replaceAll("p(lcd, 'D7', 'D7'), p(mcu, 'P15', 'P15')", "p(lcd, 'D7', 'D7'), p(mcu, 'PB15', 'PB15')");

  // OLED I2C
  s = s.replaceAll("p(oled, 'SDA', 'SDA'), p(mcu, 'P8', 'P8')", "p(oled, 'SDA', 'SDA'), p(mcu, 'PB7', 'PB7')");
  s = s.replaceAll("p(oled, 'SCL', 'SCL'), p(mcu, 'P9', 'P9')", "p(oled, 'SCL', 'SCL'), p(mcu, 'PB6', 'PB6')");

  // Sensors
  s = s.replaceAll("p(ds, '1'), p(mcu, 'P4', 'P4')", "p(ds, 'DQ', 'DQ'), p(mcu, 'PA3', 'PA3')");
  s = s.replaceAll("p(ds, '2')", "p(ds, 'GND', 'GND')");
  // need VDD on DS - add if only 2-pin joins; sensor lab may need VDD join
  s = s.replaceAll("p(hall, '1'), p(mcu, 'P8', 'P8')", "p(hall, 'OUT', 'OUT'), p(mcu, 'PB0', 'PB0')");
  s = s.replaceAll("p(hall, '2')", "p(hall, 'GND', 'GND')");
  s = s.replaceAll("p(mcu, 'P9', 'P9'), p(vm, 'V+', 'V+'), p(ldr, '1')",
    "p(mcu, 'PA0', 'PA0'), p(vm, 'V+', 'V+'), p(ldr, '1')");

  // Memory I2C/SPI/parallel
  s = s.replaceAll("p(mcu, 'P18', 'P18'), p(eep, '5')", "p(mcu, 'PB7', 'PB7'), p(eep, 'SDA', 'SDA')");
  s = s.replaceAll("p(mcu, 'P19', 'P19'), p(eep, '6')", "p(mcu, 'PB6', 'PB6'), p(eep, 'SCL', 'SCL')");
  s = s.replaceAll("p(flash, '1'), p(mcu, 'P20', 'P20')", "p(flash, 'CS', 'CS'), p(mcu, 'PA4', 'PA4')");
  s = s.replaceAll("p(flash, '2'), p(mcu, 'P21', 'P21')", "p(flash, 'DO', 'DO'), p(mcu, 'PA6', 'PA6')");
  s = s.replaceAll("p(flash, '5'), p(mcu, 'P22', 'P22')", "p(flash, 'DI', 'DI'), p(mcu, 'PA7', 'PA7')");
  s = s.replaceAll("p(flash, '6'), p(mcu, 'P23', 'P23')", "p(flash, 'CLK', 'CLK'), p(mcu, 'PA5', 'PA5')");

  s = s.replaceAll("p(eprom, '20'), p(mcu, 'P25', 'P25')", "p(eprom, 'CE', 'CE'), p(mcu, 'PB8', 'PB8')");
  s = s.replaceAll("p(eprom, '22'), p(mcu, 'P26', 'P26')", "p(eprom, 'OE', 'OE'), p(mcu, 'PB9', 'PB9')");
  s = s.replaceAll("p(sram, '20'), p(mcu, 'P28', 'P28')", "p(sram, 'CE', 'CE'), p(mcu, 'PB10', 'PB10')");
  s = s.replaceAll("p(sram, '22'), p(mcu, 'P29', 'P29')", "p(sram, 'OE', 'OE'), p(mcu, 'PB11', 'PB11')");
  s = s.replaceAll("p(sram, '27'), p(mcu, 'P30', 'P30')", "p(sram, 'WE', 'WE'), p(mcu, 'PB12', 'PB12')");

  s = s.replace(
    "const addrMem = ['10', '9', '8', '7', '6', '5', '4', '3'];\n  const addrMcu = ['P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15'];",
    "const addrMem = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];\n  const addrMcu = ['PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7'];"
  );
  s = s.replace(
    "const dataMem = ['11', '12', '13', '15', '16', '17', '18', '19'];\n  const dataMcu = ['P27', 'P31', 'P32', 'P33', 'P34', 'P35', 'P36', 'P37'];",
    "const dataMem = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];\n  const dataMcu = ['PA8', 'PA9', 'PA10', 'PA11', 'PA12', 'PA13', 'PA14', 'PA15'];"
  );

  // EEPROM power pins named
  s = s.replaceAll("p(eep, '1'), p(eep, '2'), p(eep, '3'), p(eep, '4'), p(eep, '7')",
    "p(eep, 'A0', 'A0'), p(eep, 'A1', 'A1'), p(eep, 'A2', 'A2'), p(eep, 'VSS', 'VSS'), p(eep, 'WP', 'WP')");
  s = s.replaceAll("p(eep, '8')", "p(eep, 'VCC', 'VCC')");
  s = s.replaceAll("p(flash, '8'), p(flash, '3'), p(flash, '7')",
    "p(flash, 'VCC', 'VCC'), p(flash, 'WP', 'WP'), p(flash, 'HOLD', 'HOLD')");
  s = s.replaceAll("p(flash, '4')", "p(flash, 'GND', 'GND')");

  // Parallel mem power - use named VCC/GND; leave NC ties simplified
  s = s.replaceAll("p(eprom, '14'), p(sram, '14')", "p(eprom, 'GND', 'GND'), p(sram, 'GND', 'GND')");
  s = s.replaceAll("p(eprom, '28'), p(sram, '28'), p(eprom, '1')",
    "p(eprom, 'VCC', 'VCC'), p(sram, 'VCC', 'VCC'), p(eprom, 'VPP', 'VPP')");

  // Remove bogus grounding of random MCU package pins — tie unused to nothing; keep local gnd symbols linked
  s = s.replace(
    /K\.joinWired\(doc, 'GND', NetType\.GROUND, \[\s*p\(gndMcuL[\s\S]*?p\(mcu, 'P17', 'P17'\)\s*\]\);/,
    "K.joinWired(doc, 'GND', NetType.GROUND, [\n    p(gndMcuL, '1', 'GND'), p(mcu, 'VSS', 'VSS')\n  ]);"
  );
  s = s.replace(
    /K\.joinWired\(doc, 'GND', NetType\.GROUND, \[\s*p\(gndMcuR[\s\S]*?p\(mcu, 'P47', 'P47'\)\s*\]\);/,
    "K.joinWired(doc, 'GND', NetType.GROUND, [\n    p(gndMcuR, '1', 'GND'), p(mcu, 'VSSA', 'VSSA')\n  ]);"
  );

  return s;
}

patch('c:/Projects/ElecDraw_Harmony/features/ai_engine/src/main/ets/algorithms/LabTemplateBuilders.ets', patchBuilders);
patch('c:/Projects/ElecDraw_Harmony/tools/lab_templates/builders.mjs', patchBuilders);

/**
 * Bilingual dictionary — default language: en
 */
(function (global) {
  const dict = {
    en: {
      'nav.features': 'Features',
      'nav.pipeline': 'Pipeline',
      'nav.simulation': 'Simulation',
      'nav.pcb': 'PCB',
      'nav.labs': 'Labs',
      'nav.announcement': 'News',
      'hero.eyebrow': 'HarmonyOS NEXT · ElecDraw',
      'hero.title': 'Schematic simulation, AI schematics, and PCB auto-routing — on HarmonyOS',
      'hero.sub': 'Edit and simulate circuits, generate schematics from natural language, then auto-route copper on board — one native toolchain from idea to layout.',
      'hero.ctaPrimary': 'Explore capabilities',
      'hero.ctaSecondary': 'PCB auto-routing',
      'hero.badge': 'v1.1.0 · Native ArkTS',
      'hero.floatTitle': 'Simulate · Generate · Route',
      'hero.floatBody': 'Three pillars: schematic simulation, AI schematic generation, PCB auto-routing.',
      'ann.eyebrow': 'Latest announcement',
      'ann.title': 'AI-SCH News',
      'ann.loading': 'Loading announcement…',
      'ann.error': 'Announcement unavailable. Please try again later.',
      'ann.openLink': 'Open details',
      'why.eyebrow': 'Three core capabilities',
      'why.title': 'Simulate · Generate · Route — built for real circuits',
      'why.card1.title': 'Schematic simulation',
      'why.card1.body': 'Mixed-signal kernel with virtual instruments — run topology, watch waveforms, and verify behavior before you build.',
      'why.card2.title': 'AI schematic generation',
      'why.card2.body': 'Natural language becomes structured constraints; local engines place, net, and ERC-gate — never “text pretending to be a circuit.”',
      'why.card3.title': 'PCB auto-routing',
      'why.card3.body': 'Forward annotation from schematic, copper-aware maze routing, then inspect layers in 2D and the board in 3D.',
      'why.card4.title': 'HarmonyOS native',
      'why.card4.body': 'Built for 2-in-1 / tablet on HarmonyOS NEXT with modular HAR architecture and familiar schematic UX.',
      'cap.eyebrow': 'Flagship capability family',
      'cap.title': 'From idea to routed board',
      'cap.ai.title': 'AI schematic generation',
      'cap.ai.body': 'Clarify → select → layout → net → route → QA. Versioned prompts and a multi-agent loop land editable, simulatable topology.',
      'cap.sim.title': 'Schematic simulation',
      'cap.sim.body': 'Analog MNA, event-driven digital, MCU teaching paths — with scope, logic analyzer, and sources live-bound to nets.',
      'cap.mcu.title': 'MCU debug',
      'cap.mcu.body': 'Intel HEX load, SFR / core registers, breakpoints, virtual UART with instrument loopback.',
      'cap.inst.title': 'Virtual instruments',
      'cap.inst.body': 'Scope, logic analyzer, DMM, sources, UART terminal — live-bound to schematic nets.',
      'cap.pcb.title': 'PCB auto-routing',
      'cap.pcb.body': 'Same routing engine as the editor: obstacle-aware path search, multi-layer copper, teaching-board layouts ready for 2D/3D review.',
      'cap.pcb3d.title': 'PCB 3D preview',
      'cap.pcb3d.body': 'Inspect footprints, silkscreen, and board geometry in an interactive 3D view before fab.',
      'cap.lab.title': 'Lab templates',
      'cap.lab.body': 'Dozens of .schsim / .pcbsim experiments spanning passives, op-amps, digital gates, MCU, and UART.',
      'pcb.eyebrow': 'PCB auto-routing',
      'pcb.title': 'From netlist to copper — then inspect in 2D & 3D',
      'pcb.sub': 'Auto-route after schematic capture, review copper layers in 2D, and validate the physical board in 3D — the same HarmonyOS-native toolchain.',
      'pcb.tag2d': '2D copper & auto-route',
      'pcb.tag3d': '3D board preview',
      'pcb.note2d': 'Multi-layer traces, pads, and silk after auto-routing',
      'pcb.note3d': 'Spatial check of packages and board outline',
      'pipe.eyebrow': 'AI schematic pipeline',
      'pipe.title': 'Clarify → Select → Layout → Net → Route → QA',
      'pipe.s1': 'Clarify',
      'pipe.s1d': 'Topology-critical questions only',
      'pipe.s2': 'Select',
      'pipe.s2d': 'Library BOM, no hallucinated parts',
      'pipe.s3': 'Layout',
      'pipe.s3d': 'Region adjacency → GA place',
      'pipe.s4': 'Net',
      'pipe.s4d': 'Pin nets + usage manuals',
      'pipe.s5': 'Route',
      'pipe.s5d': 'Editor-grade auto-router',
      'pipe.s6': 'QA',
      'pipe.s6d': 'ERC & geometry hard gates',
      'plat.eyebrow': 'Platform',
      'plat.title': 'Native on HarmonyOS NEXT',
      'plat.body': 'AI-SCH Simulator (com.elecdraw.aischsim) targets SDK API 12+, Stage model ArkUI — schematic simulation, AI generation, and PCB auto-routing for classroom, contest, and pre-validation workflows.',
      'plat.li1': 'Bundle · com.elecdraw.aischsim',
      'plat.li2': 'License · Apache-2.0',
      'plat.li3': 'Vendor · ElecDraw',
      'footer.tag': 'Schematic simulation · AI schematics · PCB auto-routing on HarmonyOS',
      'footer.api': 'Announcement API',
      'footer.github': 'Deploy repository',
      'footer.copy': '© 2024–2026 ElecDraw · AI-SCH Simulator'
    },
    zh: {
      'nav.features': '能力',
      'nav.pipeline': '流水线',
      'nav.simulation': '仿真',
      'nav.pcb': 'PCB',
      'nav.labs': '实验',
      'nav.announcement': '公告',
      'hero.eyebrow': 'HarmonyOS NEXT · ElecDraw',
      'hero.title': '原理图仿真 · AI 生成原理图 · PCB 自动布线',
      'hero.sub': '在鸿蒙上编辑并仿真电路，用自然语言生成可验证原理图，再自动完成 PCB 铜箔布线——从想法到板级布局，一套原生工具链。',
      'hero.ctaPrimary': '了解能力',
      'hero.ctaSecondary': 'PCB 自动布线',
      'hero.badge': 'v1.1.0 · 原生 ArkTS',
      'hero.floatTitle': '仿真 · 生成 · 布线',
      'hero.floatBody': '三大核心：原理图仿真、AI 生成原理图、PCB 自动布线。',
      'ann.eyebrow': '最新公告',
      'ann.title': 'AI-SCH 动态',
      'ann.loading': '正在加载公告…',
      'ann.error': '公告暂时无法加载，请稍后再试。',
      'ann.openLink': '查看详情',
      'why.eyebrow': '三大核心能力',
      'why.title': '仿真 · 生成 · 布线——面向真实电路',
      'why.card1.title': '原理图仿真',
      'why.card1.body': '混合信号内核配合虚拟仪器——跑通拓扑、观察波形，在动手焊接前验证行为。',
      'why.card2.title': 'AI 生成原理图',
      'why.card2.body': '自然语言落地为结构化约束；本地引擎完成摆放、建网与 ERC 门禁——杜绝「一段文字当电路」。',
      'why.card3.title': 'PCB 自动布线',
      'why.card3.body': '原理图正向标注、铜箔感知自动布线，再在 2D 审层、3D 检板。',
      'why.card4.title': '鸿蒙原生',
      'why.card4.body': '面向 HarmonyOS NEXT 的 2in1 / 平板，模块化 HAR 架构与熟悉的原理图交互体验。',
      'cap.eyebrow': '旗舰能力家族',
      'cap.title': '从想法到已布线的板',
      'cap.ai.title': 'AI 生成原理图',
      'cap.ai.body': '澄清 → 选型 → 布局 → 建网 → 布线 → QA。分阶段 Prompt 与多 Agent 闭环，输出可编辑、可仿真的拓扑。',
      'cap.sim.title': '原理图仿真',
      'cap.sim.body': '模拟 MNA、事件驱动数字、MCU 教学路径——示波器、逻辑分析仪与信号源与网络实时绑定。',
      'cap.mcu.title': 'MCU 调试',
      'cap.mcu.body': 'Intel HEX 加载、SFR / 核心寄存器、断点、虚拟 UART 与仪器回环。',
      'cap.inst.title': '虚拟仪器',
      'cap.inst.body': '示波器、逻辑分析仪、万用表、信号源、UART 终端——与原理图网络实时绑定。',
      'cap.pcb.title': 'PCB 自动布线',
      'cap.pcb.body': '与编辑器同源的自动布线引擎：避障寻径、多层铜箔，教学板布局可直接进入 2D/3D 检视。',
      'cap.pcb3d.title': 'PCB 3D 预览',
      'cap.pcb3d.body': '在投板前检查封装、丝印与板框的三维空间关系。',
      'cap.lab.title': '实验模板',
      'cap.lab.body': '覆盖无源、运放、数字门、MCU、UART 等数十套 .schsim / .pcbsim 实验。',
      'pcb.eyebrow': 'PCB 自动布线',
      'pcb.title': '从网络表到铜箔 — 再以 2D / 3D 检视',
      'pcb.sub': '原理图捕获后自动布线，在 2D 审阅铜箔层，在 3D 校验实物板几何——同一套鸿蒙原生工具链。',
      'pcb.tag2d': '2D 铜箔与自动布线',
      'pcb.tag3d': '3D 板级预览',
      'pcb.note2d': '自动布线后的多层走线、焊盘与丝印',
      'pcb.note3d': '封装与板框的空间检查',
      'pipe.eyebrow': 'AI 原理图流水线',
      'pipe.title': '澄清 → 选型 → 布局 → 建网 → 布线 → QA',
      'pipe.s1': '澄清',
      'pipe.s1d': '只追问拓扑歧义',
      'pipe.s2': '选型',
      'pipe.s2d': '库内 BOM，抑幻觉',
      'pipe.s3': '布局',
      'pipe.s3d': '区域邻接 → GA 摆放',
      'pipe.s4': '建网',
      'pipe.s4d': '引脚网络 + 用法手册',
      'pipe.s5': '布线',
      'pipe.s5d': '编辑器级自动布线',
      'pipe.s6': 'QA',
      'pipe.s6d': 'ERC 与几何硬门禁',
      'plat.eyebrow': '平台',
      'plat.title': '原生运行于 HarmonyOS NEXT',
      'plat.body': 'AI-SCH 仿真器（com.elecdraw.aischsim）面向 SDK API 12+、ArkUI Stage 模型——原理图仿真、AI 生成原理图与 PCB 自动布线，服务高校实验、竞赛训练与方案预验证。',
      'plat.li1': '包名 · com.elecdraw.aischsim',
      'plat.li2': '许可证 · Apache-2.0',
      'plat.li3': '厂商 · ElecDraw',
      'footer.tag': '原理图仿真 · AI 生成原理图 · PCB 自动布线',
      'footer.api': '公告 API',
      'footer.github': '部署仓库',
      'footer.copy': '© 2024–2026 ElecDraw · AI-SCH 仿真器'
    }
  };

  let lang = 'en';

  function t(key) {
    const table = dict[lang] || dict.en;
    return table[key] ?? dict.en[key] ?? key;
  }

  function apply() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      const on = btn.getAttribute('data-lang-btn') === lang;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
  }

  function setLang(next) {
    lang = next === 'zh' ? 'zh' : 'en';
    try {
      localStorage.setItem('aisch-lang', lang);
    } catch (_e) { /* ignore */ }
    apply();
  }

  function init() {
    let saved = null;
    try {
      saved = localStorage.getItem('aisch-lang');
    } catch (_e) { /* ignore */ }
    lang = saved === 'zh' || saved === 'en' ? saved : 'en';
    apply();
    document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang-btn')));
    });
  }

  global.AischI18n = { init, setLang, t, getLang: () => lang };
})(window);

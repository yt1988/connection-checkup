// The tools a checkup runs, in the order 1ms-shell's docs/checkup.md fixes: three phases (bandwidth last, so it
// doesn't disturb the latency measurements), five report sections with their weights, and each tool's name in the
// ten languages (the same wording as the 1ms.dog bar, from 1ms-shell's sites.js).
//
// Where a tool lives is announced by the page that frames it: <meta name="<id>" content="https://…"> (the shell
// injects one per tool). DEFAULT_ORIGINS is only for development, where no shell is in front of the page.

export const PHASES = [["who", "ipqs", "egress", "ipv6", "dns"], ["unlock", "home"], ["speed"]];
export const TOOLS = PHASES.flat();
// a phase ends when every tool in it has answered, or after this long
export const PHASE_TIMEOUT = 90000;

export const SECTIONS = [
  { id: "privacy", tools: ["who", "egress"], weight: 20 },
  { id: "ipqs", tools: ["ipqs"], weight: 25 },
  { id: "unlock", tools: ["unlock"], weight: 20 },
  { id: "conn", tools: ["ipv6", "dns", "home"], weight: 15 },
  { id: "speed", tools: ["speed"], weight: 20 },
];
export const sectionOf = id => SECTIONS.find(s => s.tools.includes(id));

export const DEFAULT_ORIGINS = {
  who: "https://who.1ms.dog", ipqs: "https://ipqs.1ms.dog", egress: "https://egress.1ms.dog", ipv6: "https://ipv6.1ms.dog",
  dns: "https://dns.1ms.dog", unlock: "https://unlock.1ms.dog", home: "https://1ms.dog", speed: "https://speed.1ms.dog",
};

// the tools' names, as the 1ms.dog bar shows them (1ms-shell src/sites.js); the home page is the brand
export const NAMES = {
  who: { en: "Who Are You", "zh-CN": "你是谁", "zh-TW": "你是誰", ja: "あなたは誰", ko: "당신은 누구", es: "¿Quién eres?", fr: "Qui êtes-vous ?", de: "Wer sind Sie?", pt: "Quem é você?", ru: "Кто вы?" },
  ipqs: { en: "IP Quality Test", "zh-CN": "IP 质量测试", "zh-TW": "IP 品質測試", ja: "IP 品質テスト", ko: "IP 품질 테스트", es: "Test de calidad IP", fr: "Test qualité IP", de: "IP-Qualitätstest", pt: "Teste de qualidade IP", ru: "Тест качества IP" },
  egress: { en: "EgressLens", "zh-CN": "出口照妖镜", "zh-TW": "出口照妖鏡", ja: "出口照魔鏡", ko: "출구 IP 돋보기", es: "Lupa IP", fr: "Loupe IP", de: "IP-Lupe", pt: "Lupa de IP", ru: "IP-лупа" },
  ipv6: { en: "IPv6 Test", "zh-CN": "IPv6 测试", "zh-TW": "IPv6 測試", ja: "IPv6 テスト", ko: "IPv6 테스트", es: "Test de IPv6", fr: "Test IPv6", de: "IPv6-Test", pt: "Teste de IPv6", ru: "Тест IPv6" },
  dns: { en: "DNS Test", "zh-CN": "DNS 测试", "zh-TW": "DNS 測試", ja: "DNS テスト", ko: "DNS 테스트", es: "Test de DNS", fr: "Test DNS", de: "DNS-Test", pt: "Teste de DNS", ru: "Тест DNS" },
  unlock: { en: "Streaming & AI Unlock Check", "zh-CN": "流媒体/AI 解锁检测", "zh-TW": "串流/AI 解鎖檢測", ja: "動画配信/AI 解除チェック", ko: "스트리밍/AI 언락 체크", es: "Desbloqueo de streaming/IA", fr: "Déblocage streaming/IA", de: "Streaming-/KI-Unlock-Check", pt: "Desbloqueio de streaming/IA", ru: "Разблокировка стриминга/ИИ" },
  home: { en: "1ms.dog", "zh-CN": "1ms.dog", "zh-TW": "1ms.dog", ja: "1ms.dog", ko: "1ms.dog", es: "1ms.dog", fr: "1ms.dog", de: "1ms.dog", pt: "1ms.dog", ru: "1ms.dog" },
  speed: { en: "Speed Test", "zh-CN": "网速测试", "zh-TW": "網速測試", ja: "スピードテスト", ko: "인터넷 속도 측정", es: "Test de velocidad", fr: "Test de débit", de: "Speedtest", pt: "Teste de velocidade", ru: "Тест скорости" },
};
export const LANGS_ALL = ["en", "zh-CN", "zh-TW", "ja", "ko", "es", "fr", "de", "pt", "ru"];
export const nameOf = (id, lang) => {
  const n = NAMES[id] && NAMES[id][lang];
  if (!n) throw new Error(`no name for ${id} in ${lang}`);
  return n;
};

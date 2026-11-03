// Region names and flags, as 1ms-shell docs/tool-contract.md §5 has them: TW gets a fixed name in each language
// instead of the system one, and the cn flag. Hong Kong and Macao keep their system names and own flags.
export const TW = { "zh-CN": "中国台湾", "zh-TW": "中國台灣", en: "Taiwan, China", ja: "中国台湾", ko: "중국 대만", es: "Taiwán, China", fr: "Taïwan, Chine", de: "Taiwan, China", pt: "Taiwan, China", ru: "Тайвань, Китай" };
export const regionName = (cc, lang) => cc === "TW" ? (TW[lang] || TW.en) : new Intl.DisplayNames([lang], { type: "region" }).of(cc);
// this page shows no flags yet; any it adds take their file name from here
export const flagCode = cc => cc === "TW" ? "cn" : cc.toLowerCase();

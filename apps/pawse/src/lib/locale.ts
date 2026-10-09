import { getLocales } from "expo-localization";

import { useSetting } from "./settings";

/** Countries offered in Settings; "auto" follows the phone, "ZZ" is worldwide. */
export const REGIONS: [string, string][] = [
  ["IN", "India"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["CA", "Canada"],
  ["AU", "Australia"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["NL", "Netherlands"],
  ["BR", "Brazil"],
  ["MX", "Mexico"],
  ["JP", "Japan"],
  ["KR", "South Korea"],
  ["ID", "Indonesia"],
  ["PH", "Philippines"],
  ["PK", "Pakistan"],
  ["BD", "Bangladesh"],
  ["NG", "Nigeria"],
  ["ZA", "South Africa"],
  ["AE", "United Arab Emirates"],
  ["TR", "Turkey"],
];

/** Feed languages YouTube Music serves well. */
export const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["hi", "Hindi"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["id", "Indonesian"],
  ["tr", "Turkish"],
  ["ru", "Russian"],
  ["ar", "Arabic"],
  ["bn", "Bengali"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["mr", "Marathi"],
  ["pa", "Punjabi"],
];

const phone = (() => {
  try {
    return getLocales()[0];
  } catch {
    return undefined;
  }
})();

/** The phone's two-letter region, if it has one. */
export const phoneRegion = (): string | null => {
  const r = phone?.regionCode?.toUpperCase();
  return r && /^[A-Z]{2}$/.test(r) ? r : null;
};

/** The region to ask YouTube for: the user's pick, else the phone's, else worldwide. */
export function regionCode(setting: string | undefined): string {
  if (setting && setting !== "auto") return setting;
  return phoneRegion() ?? "ZZ";
}

/** The feed language: the user's pick, else the phone's when YouTube serves it, else English. */
export function languageCode(setting: string | undefined): string {
  if (setting && setting !== "auto") return setting;
  const l = phone?.languageCode?.toLowerCase() ?? "";
  return LANGUAGES.some(([code]) => code === l) ? l : "en";
}

export const regionName = (code: string) =>
  code === "ZZ"
    ? "Worldwide"
    : (REGIONS.find(([c]) => c === code)?.[1] ?? code);
export const languageName = (code: string) =>
  LANGUAGES.find(([c]) => c === code)?.[1] ?? code;

export const useRegion = () => regionCode(useSetting("region", "auto"));
export const useLanguage = () => languageCode(useSetting("language", "auto"));

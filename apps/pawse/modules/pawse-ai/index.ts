import { NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type AiStatus = "ready" | "downloadable" | "downloading" | "unavailable";

declare class PawseAINative extends NativeModule {
  supportsLanguage(code: string): boolean;
  status(): Promise<AiStatus>;
  download(): Promise<boolean>;
  summarize(text: string, language: string): Promise<string | null>;
  respond(prompt: string, context: string): Promise<string | null>;
}

const native =
  Platform.OS === "web"
    ? null
    : requireOptionalNativeModule<PawseAINative>("PawseAI");

export const PawseAI = {
  linked: native != null,

  supportsLanguage(code: string): boolean {
    try {
      return native?.supportsLanguage(code) ?? false;
    } catch {
      return false;
    }
  },

  async status(): Promise<AiStatus> {
    try {
      return (await native?.status()) ?? "unavailable";
    } catch {
      return "unavailable";
    }
  },

  async download(): Promise<boolean> {
    try {
      return (await native?.download()) ?? false;
    } catch {
      return false;
    }
  },

  async summarize(text: string, language: string): Promise<string | null> {
    try {
      return (await native?.summarize(text, language)) ?? null;
    } catch {
      return null;
    }
  },

  async respond(prompt: string, context: string): Promise<string | null> {
    try {
      return (await native?.respond(prompt, context)) ?? null;
    } catch {
      return null;
    }
  },
};

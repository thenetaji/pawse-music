import { askText, SheetNote, showSheet } from "../../components/action-sheet";
import { showToast } from "../../components/toast";
import { Chip } from "../../components/ui";
import { planMix, playMix } from "../../lib/ai/dj";
import { aiStatus, downloadModel, useAiFeature } from "../../lib/ai/model";
import { haptic } from "../../lib/haptics";

const EXAMPLE = "rainy 90s Bollywood but upbeat";

async function makeMix(request: string) {
  const status = await aiStatus();
  if (status === "downloadable") {
    showSheet({
      header: (
        <SheetNote
          title="Download Gemini Nano?"
          body="The AI DJ runs on your phone. It downloads the model once, then works offline."
        />
      ),
      actions: [
        {
          label: "Download",
          onPress: async () => {
            showToast("Downloading Gemini Nano");
            if (await downloadModel()) void makeMix(request);
            else showToast("Couldn’t download it", { bad: true });
          },
        },
      ],
    });
    return;
  }
  if (status !== "ready") {
    showToast("The AI DJ isn’t ready yet", { bad: true });
    return;
  }
  showToast("Making your mix", { ms: 10_000 });
  const plan = await planMix(request);
  const played = await playMix(plan).catch(() => false);
  showToast(played ? plan.title : "Couldn’t find a mix for that", {
    bad: !played,
  });
}

export function startAiDj() {
  haptic.light();
  askText({
    title: "AI DJ",
    placeholder: EXAMPLE,
    confirm: "Make a mix",
    onSubmit: (text) => {
      if (text && text !== EXAMPLE) void makeMix(text);
    },
  });
}

export function AiDjChip({ accent }: { accent: string }) {
  const on = useAiFeature("aiDj");
  return on ? <Chip label="AI DJ" accent={accent} onPress={startAiDj} /> : null;
}

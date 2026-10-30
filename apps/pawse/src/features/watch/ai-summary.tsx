import type { CaptionTrack } from "@pawse/music-core";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Spinner } from "../../components/spinner";
import { answerParts, askContext, excerptsFor } from "../../lib/ai/ask";
import {
  downloadModel,
  modelLanguage,
  modelLanguageName,
  respond,
  summarize,
  useAiStatus,
} from "../../lib/ai/model";
import { bulletsOf, summarizeTranscript } from "../../lib/ai/summary";
import { haptic } from "../../lib/haptics";
import { useLanguage } from "../../lib/locale";
import { display } from "../../lib/type";
import { loadTranscript } from "./ai-watch";
import { Panel } from "./watch-panels";

type Summary =
  | { state: "working"; done?: number; total?: number }
  | { state: "done"; bullets: string[] }
  | { state: "failed" | "empty" };
type Exchange = { question: string; answer?: string; failed?: boolean };

const summaries = new Map<string, string[]>();

export function SummaryPanel({
  id,
  tracks,
  onSeek,
  onClose,
}: {
  id: string;
  tracks: CaptionTrack[];
  onSeek: (sec: number) => void;
  onClose: () => void;
}) {
  const language = useLanguage();
  const name = modelLanguageName(language);
  const key = `${id}:${modelLanguage(language)}`;
  const status = useAiStatus();
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [summary, setSummary] = useState<Summary>(() => {
    const bullets = summaries.get(key);
    return bullets ? { state: "done", bullets } : { state: "working" };
  });
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [text, setText] = useState("");
  const scroll = useRef<ScrollView>(null);
  const asking = exchanges.some((x) => !x.answer && !x.failed);

  if (status === "ready" && !ready) setReady(true);

  useEffect(() => {
    if (!ready || summaries.has(key)) return;
    let live = true;
    void (async () => {
      const cues = await loadTranscript(id, tracks, language);
      if (!live) return;
      if (!cues.length) return setSummary({ state: "empty" });
      const result = await summarizeTranscript(
        cues,
        (chunk) => summarize(chunk, name),
        (done, total) => live && setSummary({ state: "working", done, total }),
      );
      if (!live) return;
      if (!result) return setSummary({ state: "failed" });
      const bullets = bulletsOf(result);
      summaries.set(key, bullets);
      setSummary({ state: "done", bullets });
    })();
    return () => {
      live = false;
    };
    // The video and language decide the summary; the track list is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  const ask = async () => {
    const question = text.trim();
    if (!question || asking || !ready) return;
    haptic.light();
    setText("");
    setExchanges((list) => [...list, { question }]);
    const cues = await loadTranscript(id, tracks, language);
    const reply = cues.length
      ? await respond(question, askContext(excerptsFor(question, cues), name))
      : null;
    setExchanges((list) =>
      list.map((x) =>
        x.question === question && !x.answer && !x.failed
          ? reply
            ? { ...x, answer: reply.trim() }
            : { ...x, failed: true }
          : x,
      ),
    );
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const download = async () => {
    setDownloading(true);
    setReady(await downloadModel());
    setDownloading(false);
  };

  return (
    <Panel title="Summary" onClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {status === "downloadable" && !ready ? (
            <View style={styles.card}>
              <Text style={styles.note}>
                Summaries use Gemini Nano on this phone. It downloads once, then
                works offline.
              </Text>
              <Pressable
                onPress={download}
                disabled={downloading}
                style={styles.button}
              >
                <Text style={styles.buttonText}>
                  {downloading ? "Downloading…" : "Download"}
                </Text>
              </Pressable>
            </View>
          ) : summary.state === "working" ? (
            <View style={styles.working}>
              <Spinner size={20} />
              <Text style={styles.note}>
                {summary.total
                  ? `Reading part ${Math.min(summary.done ?? 0, summary.total)} of ${summary.total}`
                  : "Reading the captions"}
              </Text>
            </View>
          ) : summary.state === "done" ? (
            <View style={styles.card}>
              {summary.bullets.map((b, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
              <Text style={styles.small}>
                Made on this phone from the captions.
              </Text>
            </View>
          ) : (
            <Text style={styles.note}>
              {summary.state === "empty"
                ? "This video has no captions to read."
                : "Couldn’t summarise this one."}
            </Text>
          )}

          {exchanges.map((x, i) => (
            <View key={i} style={styles.exchange}>
              <Text style={styles.question}>{x.question}</Text>
              {x.answer ? (
                <Text style={styles.answer}>
                  {answerParts(x.answer).map((p, j) =>
                    p.sec === undefined ? (
                      p.text
                    ) : (
                      <Text
                        key={j}
                        style={styles.stamp}
                        onPress={() => onSeek(p.sec!)}
                      >
                        {p.text}
                      </Text>
                    ),
                  )}
                </Text>
              ) : x.failed ? (
                <Text style={styles.note}>Couldn’t answer that.</Text>
              ) : (
                <Spinner size={16} />
              )}
            </View>
          ))}
        </ScrollView>
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={ask}
            editable={ready}
            returnKeyType="send"
            placeholder="Ask this video"
            placeholderTextColor="rgba(255,255,255,0.4)"
            selectionColor="#fff"
            maxLength={200}
            style={styles.input}
          />
          <Pressable
            onPress={ask}
            disabled={!text.trim() || asking || !ready}
            style={[
              styles.button,
              (!text.trim() || asking || !ready) && styles.off,
            ]}
          >
            <Text style={styles.buttonText}>Ask</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Panel>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: 16, paddingBottom: 24, gap: 14 },
  card: {
    padding: 14,
    borderRadius: 12,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  working: { flexDirection: "row", alignItems: "center", gap: 10 },
  note: { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 20 },
  small: { color: "rgba(255,255,255,0.45)", fontSize: 12 },
  bullet: { flexDirection: "row", gap: 8 },
  dot: { color: "#fff", fontSize: 15, lineHeight: 21 },
  bulletText: { flex: 1, color: "#fff", fontSize: 15, lineHeight: 21 },
  exchange: { gap: 6 },
  question: { color: "#fff", fontSize: 15, ...display("800") },
  answer: { color: "rgba(255,255,255,0.9)", fontSize: 15, lineHeight: 21 },
  stamp: { color: "#3EA6FF" },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    color: "#fff",
    fontSize: 15,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  button: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  buttonText: { color: "#000", fontSize: 14, ...display("800") },
  off: { opacity: 0.4 },
});

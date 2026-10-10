import type { Track } from "@pawse/music-core";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import { CheckGlyph } from "../../components/glyphs";
import { Chip, PressScale } from "../../components/ui";
import {
  commitImport,
  decodeImportBytes,
  type ImportSource,
  importFromYouTubeAccount,
  type MatchResult,
  matchTracks,
  parseImportFile,
} from "../../data/import";
import {
  type PastKind,
  parsePastPlays,
  playYears,
  savePastPlays,
} from "../../data/import/past-plays";
import { addPlays } from "../../data/journal";
import { importPlaylist, useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { count } from "../../lib/plural";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { Cat, type CatColor } from "../cat/cat";
import { useAccent } from "../now-playing/now-palette";

type List = ImportSource["lists"][number];
const thousands = (n: number) =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
type Reviewed = { list: List; results: MatchResult[] };
type Stage =
  | { kind: "start" }
  | { kind: "pick"; source: ImportSource; on: boolean[] }
  | { kind: "matching"; done: number; total: number; title: string }
  | { kind: "review"; lists: Reviewed[] };

export default function ImportPage() {
  const insets = useSafeAreaInsets();
  const color = useSetting<CatColor>("catColor", "orange");
  const accent = useAccent();
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const [stage, setStage] = useState<Stage>({ kind: "start" });
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [past, setPast] = useState<{ kind: PastKind; label: string } | null>(
    null,
  );

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setMsg(null);
    try {
      setMsg(await fn());
      haptic.success();
    } catch (e) {
      setMsg((e as Error).message || "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  const pickFiles = async () => {
    setMsg(null);
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: ["text/*", "application/json", "text/csv", "*/*"],
    });
    if (res.canceled) return;
    const lists: List[] = [];
    let kind = "";
    for (const a of res.assets) {
      try {
        const bytes =
          Platform.OS === "web"
            ? new Uint8Array(await (await fetch(a.uri)).arrayBuffer())
            : await new File(a.uri).bytes();
        const src = parseImportFile(a.name, decodeImportBytes(bytes));
        kind ||= src.kind;
        lists.push(...src.lists.filter((l) => l.items.length));
      } catch {}
    }
    if (!lists.length) {
      setMsg(
        "Couldn't find songs in that file. Unzip Takeout or Apple exports first and pick the CSV or JSON inside.",
      );
      return;
    }
    haptic.light();
    setStage({
      kind: "pick",
      source: { kind, lists },
      on: lists.map(() => true),
    });
  };

  const importPast = async (kind: PastKind) => {
    if (past) return;
    setMsg(null);
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["application/json", "text/html", "text/csv", "*/*"],
    });
    if (res.canceled) return;
    const a = res.assets[0];
    if (/\.zip$/i.test(a.name)) {
      setMsg(
        "Unzip it first and pick watch-history.json/html or the Play Activity CSV.",
      );
      return;
    }
    setPast({ kind, label: "Reading…" });
    try {
      const text =
        Platform.OS === "web"
          ? await (await fetch(a.uri)).text()
          : await new File(a.uri).text();
      const { plays } = await parsePastPlays(kind, a.name, text);
      if (!plays.length)
        throw new Error(
          kind === "youtube"
            ? "No YouTube Music plays in that file."
            : "No plays in that file.",
        );
      const added = await savePastPlays(plays, addPlays, (done) =>
        setPast({
          kind,
          label: `Saving ${thousands(done)} of ${thousands(plays.length)}`,
        }),
      );
      haptic.success();
      setMsg(
        added
          ? `Added ${thousands(added)} ${added === 1 ? "play" : "plays"} from ${playYears(plays)}.`
          : "Those plays are already in your history.",
      );
    } catch (e) {
      setMsg((e as Error).message || "Couldn't read that file.");
    } finally {
      setPast(null);
    }
  };

  const match = async (lists: List[]) => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    const total = lists.reduce((n, l) => n + l.items.length, 0);
    let before = 0;
    const out: Reviewed[] = [];
    try {
      for (const list of lists) {
        setStage({ kind: "matching", done: before, total, title: list.title });
        const results = await matchTracks(
          list.items,
          (done) =>
            setStage({
              kind: "matching",
              done: before + done,
              total,
              title: list.title,
            }),
          ctrl.signal,
        );
        before += list.items.length;
        out.push({ list, results });
      }
      haptic.success();
      setStage({ kind: "review", lists: out });
    } catch {
      setStage({ kind: "start" });
      setMsg(ctrl.signal.aborted ? "Stopped." : "Matching failed. Try again.");
    }
  };

  const save = (lists: Reviewed[]) => {
    let added = 0;
    for (const { list, results } of lists) {
      const liked = /liked|favou?rite|loved/i.test(list.title);
      added += commitImport(
        results,
        liked ? { kind: "liked" } : { kind: "playlist", title: list.title },
      ).added;
    }
    haptic.success();
    setStage({ kind: "start" });
    setMsg(`Added ${count(added, "song")} to your library.`);
  };

  const title =
    stage.kind === "review"
      ? "Check matches"
      : stage.kind === "pick"
        ? "Choose lists"
        : "Import";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        <Text style={styles.h1}>{title}</Text>
        <Pressable
          hitSlop={10}
          onPress={() => {
            abort.current?.abort();
            if (stage.kind === "start") router.back();
            else setStage({ kind: "start" });
          }}
        >
          <Text style={styles.done}>
            {stage.kind === "start" ? "Done" : "Cancel"}
          </Text>
        </Pressable>
      </View>

      {stage.kind === "matching" ? (
        <View style={styles.matching}>
          <Cat mood="chase" size={130} color={color} />
          <Text style={styles.matchTitle}>Finding your songs</Text>
          <Text style={styles.matchSub} numberOfLines={1}>
            {stage.title} · {stage.done} of {stage.total}
          </Text>
          <View style={styles.bar}>
            <View
              style={[
                styles.fill,
                {
                  width: `${(stage.done / Math.max(1, stage.total)) * 100}%`,
                  backgroundColor: accent,
                },
              ]}
            />
          </View>
        </View>
      ) : stage.kind === "pick" ? (
        <PickLists
          stage={stage}
          accent={accent}
          onToggle={(i) =>
            setStage({
              ...stage,
              on: stage.on.map((v, j) => (j === i ? !v : v)),
            })
          }
          onGo={() =>
            void match(stage.source.lists.filter((_, i) => stage.on[i]))
          }
        />
      ) : stage.kind === "review" ? (
        <Review
          lists={stage.lists}
          accent={accent}
          onChange={(lists) => setStage({ kind: "review", lists })}
          onSave={() => save(stage.lists)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.center}>
            <Cat
              mood={busy || past ? "chase" : msg ? "happy" : "curious"}
              size={96}
              color={color}
            />
          </View>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}

          <Card
            title="YouTube Music account"
            body={
              signedIn
                ? "Copy your liked songs and playlists into Pawse. They stay even after you sign out."
                : "Sign in once, import, then sign out if you like. Your music stays in Pawse."
            }
          >
            <PressScale
              onPress={() =>
                signedIn
                  ? void run("account", async () => {
                      const r = await importFromYouTubeAccount((label) =>
                        setBusy(label),
                      );
                      return `Copied ${count(r.liked, "liked song")} and ${count(r.playlists, "playlist")}.`;
                    })
                  : push("/sign-in")
              }
              style={[styles.cta, { backgroundColor: accent }]}
            >
              {busy && busy !== "link" ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator color="#000" />
                  <Text style={styles.ctaText} numberOfLines={1}>
                    {busy === "account" ? "Starting…" : busy}
                  </Text>
                </View>
              ) : (
                <Text style={styles.ctaText}>
                  {signedIn ? "Copy my library" : "Sign in to import"}
                </Text>
              )}
            </PressScale>
          </Card>

          <Card
            title="A file"
            body="Google Takeout (YouTube Music), your Apple Music data, an Apple Music or iTunes playlist export, or any CSV with titles and artists."
          >
            <PressScale
              onPress={() => void pickFiles()}
              style={[styles.cta, styles.ghost]}
            >
              <Text style={[styles.ctaText, { color: "#fff" }]}>
                Choose files
              </Text>
            </PressScale>
            <Pressable
              onPress={() =>
                showSheet({
                  header: <Help />,
                  actions: [{ label: "Got it", onPress: () => {} }],
                })
              }
            >
              <Text style={[styles.how, { color: accent }]}>
                How do I get these files?
              </Text>
            </Pressable>
          </Card>

          <Card
            title="Past listening history"
            body="Plays from before Pawse, for your stats and Wrapped."
          >
            <PastChoice
              label="YouTube Music (Google Takeout)"
              how="takeout.google.com → YouTube and YouTube Music → History, JSON."
              busy={past?.kind === "youtube" ? past.label : null}
              onPress={() => void importPast("youtube")}
            />
            <PastChoice
              label="Apple Music (privacy.apple.com)"
              how="privacy.apple.com → Request a copy → Apple Media Services. Pick Play Activity CSV."
              busy={past?.kind === "apple" ? past.label : null}
              onPress={() => void importPast("apple")}
            />
          </Card>

          <Card
            title="A playlist link"
            body="Any public or unlisted YouTube Music or YouTube playlist."
          >
            <View style={styles.field}>
              <TextInput
                value={link}
                onChangeText={setLink}
                placeholder="music.youtube.com/playlist?list=…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Pressable
                hitSlop={8}
                onPress={async () => setLink(await Clipboard.getStringAsync())}
              >
                <Text style={[styles.paste, { color: accent }]}>Paste</Text>
              </Pressable>
            </View>
            <PressScale
              onPress={() =>
                link.trim() &&
                void run("link", async () => {
                  const id = await importPlaylist(link.trim());
                  const p = useLibrary
                    .getState()
                    .playlists.find((x) => x.id === id);
                  return `Imported ${p?.title ?? "playlist"} · ${count(p?.tracks.length ?? 0, "song")}`;
                })
              }
              style={[
                styles.cta,
                styles.ghost,
                !link.trim() && { opacity: 0.4 },
              ]}
            >
              {busy === "link" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.ctaText, { color: "#fff" }]}>
                  Import playlist
                </Text>
              )}
            </PressScale>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

function Card({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      {children}
    </Animated.View>
  );
}

function PastChoice({
  label,
  how,
  busy,
  onPress,
}: {
  label: string;
  how: string;
  busy: string | null;
  onPress: () => void;
}) {
  return (
    <View>
      <PressScale onPress={onPress} style={[styles.cta, styles.ghost]}>
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="#fff" />
            <Text style={[styles.ctaText, { color: "#fff" }]} numberOfLines={1}>
              {busy}
            </Text>
          </View>
        ) : (
          <Text style={[styles.ctaText, { color: "#fff" }]}>{label}</Text>
        )}
      </PressScale>
      <Text style={styles.pastHow}>{how}</Text>
    </View>
  );
}

function Help() {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.helpTitle}>Google Takeout</Text>
      <Text style={styles.helpText}>
        takeout.google.com → deselect all → tick “YouTube and YouTube Music” →
        export. Unzip it in Files, then pick the CSVs in “music (library and
        uploads)” and “playlists”.
      </Text>
      <Text style={styles.helpTitle}>Apple Music, even if it expired</Text>
      <Text style={styles.helpText}>
        privacy.apple.com → Request a copy of your data → Apple Media Services.
        When it arrives, unzip it and pick “Apple Music Library Tracks.json” and
        the playlist files.
      </Text>
      <Text style={styles.helpTitle}>Apple Music on a Mac or PC</Text>
      <Text style={styles.helpText}>
        Select a playlist → File → Library → Export Playlist, save as text.
      </Text>
    </View>
  );
}

function PickLists({
  stage,
  accent,
  onToggle,
  onGo,
}: {
  stage: Extract<Stage, { kind: "pick" }>;
  accent: string;
  onToggle: (i: number) => void;
  onGo: () => void;
}) {
  const count = stage.source.lists.reduce(
    (n, l, i) => n + (stage.on[i] ? l.items.length : 0),
    0,
  );
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.lead}>
        Found {stage.source.lists.length}{" "}
        {stage.source.lists.length === 1 ? "list" : "lists"}. Pawse finds each
        song on YouTube Music and lets you check the unsure ones.
      </Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {stage.source.lists.map((l, i) => (
          <Pressable
            key={`${l.title}${i}`}
            onPress={() => onToggle(i)}
            style={styles.listRow}
          >
            <View
              style={[
                styles.check,
                stage.on[i] && { backgroundColor: accent, borderColor: accent },
              ]}
            >
              {stage.on[i] ? (
                <CheckGlyph size={14} weight={3.2} color="#000" />
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {l.title}
              </Text>
              <Text style={styles.rowSub}>{l.items.length} songs</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <PressScale
        onPress={onGo}
        style={[
          styles.cta,
          { backgroundColor: accent, marginBottom: 30 },
          !count && { opacity: 0.4 },
        ]}
      >
        <Text style={styles.ctaText}>Find {count} songs</Text>
      </PressScale>
    </View>
  );
}

function Review({
  lists,
  accent,
  onChange,
  onSave,
}: {
  lists: Reviewed[];
  accent: string;
  onChange: (lists: Reviewed[]) => void;
  onSave: () => void;
}) {
  const [show, setShow] = useState<MatchResult["status"]>("unsure");
  const all = lists.flatMap((l, li) =>
    l.results.map((r, ri) => ({ r, li, ri })),
  );
  const n = (s: MatchResult["status"]) =>
    all.filter((x) => x.r.status === s).length;
  const rows = all.filter((x) => x.r.status === show).slice(0, 300);

  const choose = (li: number, ri: number, track: Track | null) => {
    haptic.tick();
    onChange(
      lists.map((l, i) =>
        i !== li
          ? l
          : {
              ...l,
              results: l.results.map((r, j) =>
                j !== ri
                  ? r
                  : track
                    ? { ...r, status: "matched" as const, track }
                    : { ...r, status: "missing" as const, track: undefined },
              ),
            },
      ),
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.chips}>
        <Chip
          label={`Check ${n("unsure")}`}
          on={show === "unsure"}
          accent={accent}
          onPress={() => setShow("unsure")}
        />
        <Chip
          label={`Matched ${n("matched")}`}
          on={show === "matched"}
          accent={accent}
          onPress={() => setShow("matched")}
        />
        <Chip
          label={`Not found ${n("missing")}`}
          on={show === "missing"}
          accent={accent}
          onPress={() => setShow("missing")}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {!rows.length ? (
          <Text style={styles.lead}>
            {show === "unsure" ? "Nothing to check." : "None here."}
          </Text>
        ) : null}
        {rows.map(({ r, li, ri }) => (
          <Animated.View
            key={`${li}:${ri}`}
            entering={FadeIn.duration(200)}
            style={styles.reviewRow}
          >
            <Text style={styles.wanted} numberOfLines={1}>
              {r.item.title}
              {r.item.artist ? ` · ${r.item.artist}` : ""}
            </Text>
            {r.status === "matched" && r.track ? (
              <Candidate
                track={r.track}
                on
                onPress={() => choose(li, ri, null)}
              />
            ) : (
              r.candidates
                .slice(0, 3)
                .map((c) => (
                  <Candidate
                    key={c.id}
                    track={c}
                    onPress={() => choose(li, ri, c)}
                  />
                ))
            )}
            {r.status !== "matched" && !r.candidates.length ? (
              <Text style={styles.rowSub}>
                No close match on YouTube Music.
              </Text>
            ) : null}
          </Animated.View>
        ))}
      </ScrollView>
      <PressScale
        onPress={onSave}
        style={[styles.cta, { backgroundColor: accent, marginBottom: 30 }]}
      >
        <Text style={styles.ctaText}>Add {n("matched")} songs</Text>
      </PressScale>
    </View>
  );
}

function Candidate({
  track,
  on,
  onPress,
}: {
  track: Track;
  on?: boolean;
  onPress: () => void;
}) {
  const d = track.durationSec;
  return (
    <Pressable onPress={onPress} style={[styles.cand, on && styles.candOn]}>
      <Artwork thumbnails={track.thumbnails} size={40} radius={6} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.candTitle} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {track.artists.map((a) => a.name).join(", ")}
          {d
            ? ` · ${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, "0")}`
            : ""}
        </Text>
      </View>
      <Text style={styles.candMark}>{on ? "✓" : "Use"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000", paddingHorizontal: 20 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h1: { color: "#fff", fontSize: 34, ...display("800"), letterSpacing: -0.8 },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  center: { alignItems: "center", marginTop: 18, marginBottom: 8 },
  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  cardTitle: { color: "#fff", fontSize: 18, ...display("800") },
  cardBody: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14.5,
    lineHeight: 20,
    marginTop: 4,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  input: { flex: 1, color: "#fff", fontSize: 16 },
  paste: { fontSize: 15, ...display("700") },
  cta: {
    marginTop: 12,
    height: 50,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  ghost: { backgroundColor: "rgba(255,255,255,0.12)" },
  ctaText: { color: "#000", fontSize: 16, ...display("800") },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  pastHow: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 6,
    textAlign: "center",
  },
  how: { fontSize: 14, ...display("700"), marginTop: 12, textAlign: "center" },
  msg: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 6,
    lineHeight: 21,
  },
  helpTitle: { color: "#fff", fontSize: 15, ...display("800") },
  helpText: { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 20 },
  matching: { flex: 1, alignItems: "center", justifyContent: "center" },
  matchTitle: { color: "#fff", fontSize: 22, ...display("800"), marginTop: 12 },
  matchSub: { color: "rgba(255,255,255,0.55)", fontSize: 15, marginTop: 4 },
  bar: {
    width: "80%",
    height: 5,
    borderRadius: 3,
    marginTop: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  fill: { height: 5 },
  lead: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    lineHeight: 21,
    marginVertical: 14,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  rowSub: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 },
  chips: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 6 },
  reviewRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
    gap: 6,
  },
  wanted: { color: "rgba(255,255,255,0.85)", fontSize: 15, ...display("700") },
  cand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  candOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  candTitle: { color: "#fff", fontSize: 15, fontWeight: "500" },
  candMark: { color: "#fff", fontSize: 14, ...display("800"), paddingRight: 6 },
});

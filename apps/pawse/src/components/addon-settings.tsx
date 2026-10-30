import { useState } from "react";
import { Linking, StyleSheet, Text, TextInput, View } from "react-native";

import {
  checkListenBrainz,
  lastFmSetup,
  saveLastFm,
  saveListenBrainz,
  signOutScrobbler,
  useScrobbleAccounts,
} from "../data/scrobbler";
import {
  Foot,
  Info,
  Link,
  Pick,
  styles as rows,
  Section,
  Toggle,
} from "./settings-rows";
import { showToast } from "./toast";
import { desktop } from "../lib/desktop";
import { useSetting } from "../lib/settings";

function Field({
  label,
  value,
  onChange,
  secret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
}) {
  return (
    <View style={rows.row}>
      <Text style={[rows.label, styles.fieldLabel]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secret}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste here"
        placeholderTextColor="rgba(255,255,255,0.3)"
        selectionColor="#fff"
        style={styles.input}
      />
    </View>
  );
}

function LastFmRows() {
  const user = useScrobbleAccounts((s) => s.lastfm);
  const [apiKey, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState<string>();
  const [busy, setBusy] = useState(false);
  if (user)
    return (
      <>
        <Info label="Last.fm" value={user} />
        <Link
          label="Sign out of Last.fm"
          danger
          onPress={() => signOutScrobbler("lastfm")}
        />
      </>
    );
  const key = apiKey.trim();
  const sec = secret.trim();
  const start = async () => {
    if (!key || !sec)
      return showToast("Paste your API key and shared secret first", {
        bad: true,
      });
    setBusy(true);
    try {
      const lf = lastFmSetup(key, sec);
      const t = await lf.getToken();
      setToken(t);
      await Linking.openURL(lf.authUrl(t));
    } catch {
      showToast("Last.fm didn’t accept that key and secret", { bad: true });
    }
    setBusy(false);
  };
  const finish = async () => {
    if (!token) return;
    setBusy(true);
    try {
      saveLastFm(key, sec, await lastFmSetup(key, sec).getSession(token));
      setToken(undefined);
    } catch {
      showToast("Allow Pawse on Last.fm first, then try again", { bad: true });
    }
    setBusy(false);
  };
  return (
    <>
      <Field label="API key" value={apiKey} onChange={setKey} />
      <Field label="Shared secret" value={secret} onChange={setSecret} secret />
      {token ? (
        <Link
          label="I’ve allowed Pawse on Last.fm"
          onPress={busy ? () => {} : finish}
        />
      ) : (
        <Link label="Sign in to Last.fm" onPress={busy ? () => {} : start} />
      )}
    </>
  );
}

function ListenBrainzRows() {
  const user = useScrobbleAccounts((s) => s.listenbrainz);
  const [token, setToken] = useState("");
  if (user)
    return (
      <>
        <Info label="ListenBrainz" value={user} />
        <Link
          label="Sign out of ListenBrainz"
          danger
          onPress={() => signOutScrobbler("listenbrainz")}
        />
      </>
    );
  return (
    <>
      <Field label="User token" value={token} onChange={setToken} secret />
      <Link
        label="Save ListenBrainz token"
        onPress={async () => {
          const t = token.trim();
          const name = t ? await checkListenBrainz(t) : undefined;
          if (name) {
            saveListenBrainz(t, name);
            setToken("");
          } else
            showToast("ListenBrainz doesn’t know that token", { bad: true });
        }}
      />
    </>
  );
}

/** Videos in their original language, and the community's best parts and chapters. */
export function VideoCommunity() {
  return (
    <>
      <Section title="Community">
        <Toggle
          k="originalTitles"
          label="Original titles and audio"
          hint="The uploader's title, and dubbed videos in their own language"
          def
        />
        <Toggle
          k="sbExtras"
          label="Best part and community chapters"
          hint="Jump to a video's best part; chapters from viewers"
          def
        />
      </Section>
      <Foot>
        Original titles and audio shows the title the uploader wrote and plays
        the original language of dubbed videos, instead of YouTube’s
        translation.
      </Foot>
    </>
  );
}

export function HelpCommunity() {
  return (
    <>
      <Section title="Community">
        <Toggle
          k="contribute"
          label="Help SponsorBlock, DeArrow and Return YouTube Dislike"
          hint="Shares your votes and suggestions, never who you are"
          def
        />
      </Section>
      <Foot>
        Helping sends your likes and dislikes, the segments, titles and
        thumbnails you suggest and your votes on skips to those projects, under
        a random id made on this device with no account. It is always off in
        Incognito.
      </Foot>
    </>
  );
}

export function Scrobbling() {
  const waiting = useScrobbleAccounts((s) => s.waiting);
  return (
    <>
      <Section title="Scrobbling">
        <LastFmRows />
        <ListenBrainzRows />
        {waiting ? (
          <Info label="Waiting to send" value={String(waiting)} />
        ) : null}
      </Section>
      <Foot>
        Songs you listen to are sent to Last.fm and ListenBrainz when half of a
        song, or four minutes, has played. Videos are left out, and so is
        everything in Incognito or with listening history paused. For Last.fm,
        make a free API account at last.fm/api/account/create and paste its key
        and shared secret.
      </Foot>
    </>
  );
}

export function DiscordSettings() {
  if (!desktop?.discordActivity) return null;
  return (
    <>
      <Section title="Discord">
        <Toggle
          k="discordStatus"
          label="Show what’s playing"
          tip="Friends on Discord now see what you play"
          def={false}
        />
      </Section>
      <Foot>
        Friends see “Listening to Pawse” with the song, artist and cover while
        music plays, through the Discord app on this computer. Never in
        Incognito.
      </Foot>
    </>
  );
}

const LATIN_SAMPLE = ["चाँद तारों के नीचे", "Chaand taaron ke neeche"];

/** One sample line, set the way the lyrics will show it. */
function LatinSample() {
  const style = useSetting("lyricsLatinStyle", "under");
  return (
    <View style={styles.sample}>
      {style === "under" ? (
        <Text style={styles.sampleOriginal}>{LATIN_SAMPLE[0]}</Text>
      ) : null}
      <Text style={styles.sampleLatin}>{LATIN_SAMPLE[1]}</Text>
    </View>
  );
}

export function LatinLyricsSettings() {
  return (
    <>
      <Section title="Lyrics in Latin letters">
        <Pick
          k="lyricsLatinStyle"
          label="Show the Latin letters"
          def="under"
          options={[
            ["under", "Under each line"],
            ["instead", "Instead of the original"],
          ]}
        />
        <LatinSample />
      </Section>
      <Foot>
        Tap Aa on the lyrics to switch. Hindi, Marathi, Punjabi, other Indian
        scripts and Korean are supported.
      </Foot>
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { marginRight: 12 },
  sample: { paddingHorizontal: 16, paddingVertical: 14, gap: 4 },
  sampleOriginal: { color: "rgba(255,255,255,0.55)", fontSize: 15 },
  sampleLatin: { color: "#fff", fontSize: 18, fontWeight: "600" },
  input: {
    flex: 1,
    textAlign: "right",
    color: "rgba(255,255,255,0.7)",
    fontSize: 16,
    paddingVertical: 14,
  },
});

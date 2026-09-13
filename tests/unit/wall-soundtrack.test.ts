import { describe, expect, it } from "vitest";

import {
  AI_SONG_LENGTH_CHOICES,
  AI_SONG_MAX_SECONDS,
  composeWaitLabel,
  sampleUnitCost,
  songLengthLabel,
  MAX_AI_TRACKS,
  MAX_UPLOAD_TRACKS,
  barMs,
  capFor,
  compileSongPrompt,
  compilePoemPrompt,
  poemWordBudget,
  POEM_STYLES,
  POEM_STYLE_HINTS,
  crossfadeMs,
  equalPowerCurve,
  transitionPlan,
  fallbackLinkTitle,
  parseMusicLink,
  playbackSequence,
  slideMsForTrack,
  DEFAULT_SONG_SETTINGS,
  analyseSamples,
  closingFadeSec,
  entryOffsetSec,
  loudnessGain,
  musicEmbed,
} from "@/lib/wall-soundtrack";
import { estimateBpm } from "@/lib/audio-analyze";

describe("streaming links", () => {
  it("accepts the three supported providers", () => {
    expect(parseMusicLink("https://open.spotify.com/playlist/37i9dQ")?.provider).toBe("spotify");
    expect(parseMusicLink("https://music.apple.com/us/playlist/summer/pl.123")?.provider).toBe(
      "apple",
    );
    expect(parseMusicLink("https://music.amazon.com/playlists/abc")?.provider).toBe("amazon");
  });

  it("rejects anything else, so we never proxy unlicensed audio", () => {
    expect(parseMusicLink("https://youtube.com/watch?v=x")).toBeNull();
    expect(parseMusicLink("not a url")).toBeNull();
    expect(parseMusicLink("")).toBeNull();
  });

  it("names a card even when the provider gives us no metadata", () => {
    expect(fallbackLinkTitle("spotify")).toMatch(/Spotify/);
  });
});

describe("song prompt", () => {
  it("carries the host's words, genre, mood and voice", () => {
    const prompt = compileSongPrompt(
      { ...DEFAULT_SONG_SETTINGS, words: "family reunion", genre: "soul", mood: "nostalgic" },
      "Kendrick Reunion",
    );
    expect(prompt).toContain("family reunion");
    expect(prompt).toContain("soul");
    expect(prompt).toContain("nostalgic");
    expect(prompt).toContain("Kendrick Reunion");
  });

  it("translates the sliders into words a model understands", () => {
    const slow = compileSongPrompt({ ...DEFAULT_SONG_SETTINGS, tempo: 1, bass: 5 }, "Party");
    const fast = compileSongPrompt({ ...DEFAULT_SONG_SETTINGS, tempo: 5, bass: 1 }, "Party");
    expect(slow).toContain("65 BPM");
    expect(slow).toContain("heavy bass");
    expect(fast).toContain("135 BPM");
    expect(fast).not.toContain("heavy bass");
  });

  it("always asks for a loopable bed with no abrupt ending", () => {
    expect(compileSongPrompt(DEFAULT_SONG_SETTINGS, "Any")).toMatch(/loopable/i);
  });
});

describe("transitions and pacing", () => {
  it("blends similar tracks slowly and contrasting ones quickly", () => {
    const long = crossfadeMs({ bpm: 100, energy: 0.5 }, { bpm: 102, energy: 0.5 });
    const short = crossfadeMs({ bpm: 70, energy: 0.1 }, { bpm: 160, energy: 0.9 });
    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThanOrEqual(1200);
    expect(long).toBeLessThanOrEqual(4500);
  });

  it("uses a sane default when a track was never analysed", () => {
    const ms = crossfadeMs({ bpm: null, energy: null }, { bpm: null, energy: null });
    expect(ms).toBeGreaterThanOrEqual(1200);
    expect(ms).toBeLessThanOrEqual(4500);
  });

  it("turns tempo into whole bars", () => {
    expect(Math.round(barMs(120))).toBe(2000);
    expect(barMs(null)).toBeNull();
  });

  it("snaps slide length to bars but stays near the requested duration", () => {
    const ms = slideMsForTrack(6000, 120);
    expect(ms % 2000).toBe(0);
    expect(ms).toBeGreaterThanOrEqual(4000);
    expect(ms).toBeLessThanOrEqual(8000);
  });

  it("falls back to the plain duration with no tempo", () => {
    expect(slideMsForTrack(6000, null)).toBe(6000);
  });

  it("loops the playlist so photos never outrun the music", () => {
    const seq = playbackSequence(["a", "b"], 5);
    expect(seq).toEqual(["a", "b", "a", "b", "a"]);
    expect(playbackSequence([], 3)).toEqual([]);
  });
});

describe("caps", () => {
  it("limits each source independently", () => {
    expect(capFor("upload")).toBe(MAX_UPLOAD_TRACKS);
    expect(capFor("ai")).toBe(MAX_AI_TRACKS);
    expect(capFor("link")).toBe(1);
  });
});

describe("tempo detection", () => {
  it("finds the beat spacing of a synthetic 120 BPM pulse", () => {
    const hz = 100;
    const envelope: number[] = [];
    for (let i = 0; i < hz * 20; i += 1) envelope.push(i % 50 === 0 ? 1 : 0.05);
    const bpm = estimateBpm(envelope, hz);
    expect(bpm).not.toBeNull();
    // 120, or a musically equivalent multiple/division.
    expect([60, 120, 180]).toContain(bpm);
  });

  it("declines to guess from too little audio", () => {
    expect(estimateBpm([0.1, 0.2, 0.3], 100)).toBeNull();
  });
});

describe("transition plan", () => {
  it("keeps power constant across the handover, so there is no mid-fade dip", () => {
    const inC = equalPowerCurve("in", 33);
    const outC = equalPowerCurve("out", 33);
    for (let i = 0; i < inC.length; i += 1) {
      const power = inC[i]! ** 2 + outC[i]! ** 2;
      expect(power).toBeGreaterThan(0.99);
      expect(power).toBeLessThan(1.01);
    }
    expect(inC[0]!).toBeLessThan(0.01);
    expect(inC[inC.length - 1]!).toBeCloseTo(1, 3);
  });

  it("lands the overlap on whole bars of the outgoing track", () => {
    const bar = barMs(120)!;
    const plan = transitionPlan({ bpm: 120, energy: 0.5 }, { bpm: 120, energy: 0.5 });
    expect(plan.overlapMs % bar).toBe(0);
  });

  it("brings the new song in faster than the old one decays", () => {
    const plan = transitionPlan({ bpm: 100, energy: 0.5 }, { bpm: 104, energy: 0.5 });
    expect(plan.fadeInMs).toBeLessThan(plan.fadeOutMs);
    expect(plan.fadeOutMs).toBe(plan.overlapMs);
  });

  it("never eats more than a third of a short track", () => {
    const plan = transitionPlan({ bpm: 90, energy: 0.5, seconds: 6 }, { bpm: 90, energy: 0.5 });
    expect(plan.overlapMs).toBeLessThanOrEqual(2000);
  });

  it("shortens the blend when two tracks clash instead of muddling them", () => {
    const close = transitionPlan({ bpm: 100, energy: 0.4 }, { bpm: 102, energy: 0.45 });
    const clash = transitionPlan({ bpm: 70, energy: 0.2 }, { bpm: 150, energy: 0.9 });
    expect(clash.overlapMs).toBeLessThan(close.overlapMs);
  });
});

// ---------------------------------------------------------------------------
// Per-track conditioning: silence trim, loudness match, beat-aligned entry,
// clean-gap mode and the closing fade.
// ---------------------------------------------------------------------------

/** A fake decoded buffer: `head` seconds of silence, tone, `tail` silence. */
function fakeBuffer(head: number, body: number, tail: number, amp = 0.5) {
  const sampleRate = 8000;
  const total = Math.round((head + body + tail) * sampleRate);
  const data = new Float32Array(total);
  const from = Math.round(head * sampleRate);
  const to = Math.round((head + body) * sampleRate);
  for (let i = from; i < to; i += 1) data[i] = Math.sin(i * 0.05) * amp;
  return {
    sampleRate,
    length: total,
    duration: total / sampleRate,
    getChannelData: () => data,
  };
}

describe("silence trimming", () => {
  it("finds the real start and end of the music", () => {
    const c = analyseSamples(fakeBuffer(0.6, 4, 0.9));
    expect(c.headSec).toBeGreaterThan(0.4);
    expect(c.headSec).toBeLessThan(0.7);
    expect(c.tailSec).toBeGreaterThan(0.7);
    expect(c.tailSec).toBeLessThan(1.0);
    expect(c.playableSec).toBeGreaterThan(3.8);
    expect(c.playableSec).toBeLessThan(4.3);
  });

  it("leaves a track with no dead air alone", () => {
    const c = analyseSamples(fakeBuffer(0, 3, 0));
    expect(c.headSec).toBe(0);
    expect(c.tailSec).toBe(0);
  });

  it("never trims more than three seconds from either end", () => {
    const c = analyseSamples(fakeBuffer(10, 3, 10));
    expect(c.headSec).toBeLessThanOrEqual(3);
    expect(c.tailSec).toBeLessThanOrEqual(3);
  });

  it("returns a silent file untouched rather than trimming it away", () => {
    const c = analyseSamples(fakeBuffer(0, 2, 0, 0));
    expect(c.headSec).toBe(0);
    expect(c.playableSec).toBeGreaterThan(1.5);
    expect(c.gain).toBe(1);
  });
});

describe("loudness match", () => {
  it("turns a loud track down and a quiet track up", () => {
    expect(loudnessGain(0.9)).toBeLessThan(1);
    expect(loudnessGain(0.15)).toBeGreaterThan(1);
  });

  it("stays inside a safe range and never boosts silence", () => {
    expect(loudnessGain(0.001)).toBe(1);
    expect(loudnessGain(null)).toBe(1);
    expect(loudnessGain(1)).toBeGreaterThanOrEqual(0.55);
    expect(loudnessGain(0.05)).toBeLessThanOrEqual(1.8);
  });

  it("brings a loud and a quiet track within a whisker of each other", () => {
    const loud = analyseSamples(fakeBuffer(0, 3, 0, 0.9));
    const quiet = analyseSamples(fakeBuffer(0, 3, 0, 0.12));
    const gap = Math.abs(loud.energy * loud.gain - quiet.energy * quiet.gain);
    expect(gap).toBeLessThan(Math.abs(loud.energy - quiet.energy));
  });
});

describe("beat-aligned entry", () => {
  it("starts on the next downbeat when the tempo is confident", () => {
    // 120bpm: half-second beats. A head trim of 0.72s lands mid-beat.
    expect(entryOffsetSec(0.72, 120, true)).toBeCloseTo(1.0, 2);
  });

  it("does not nudge a trim that already sits on the beat", () => {
    expect(entryOffsetSec(1.0, 120, true)).toBeCloseTo(1.0, 3);
  });

  it("falls back to the first audible moment without a confident tempo", () => {
    expect(entryOffsetSec(0.72, null, false)).toBeCloseTo(0.72, 3);
    expect(entryOffsetSec(0.72, 120, false)).toBeCloseTo(0.72, 3);
  });
});

describe("no-crossfade mode", () => {
  it("gives a clean gap and no overlap", () => {
    const plan = transitionPlan({ bpm: 100, energy: 0.5 }, { bpm: 100, energy: 0.5 }, {
      noCrossfade: true,
    });
    expect(plan.overlapMs).toBe(0);
    expect(plan.gapMs).toBeGreaterThan(0);
  });

  it("still blends by default", () => {
    const plan = transitionPlan({ bpm: 100, energy: 0.5 }, { bpm: 100, energy: 0.5 });
    expect(plan.overlapMs).toBeGreaterThan(0);
    expect(plan.gapMs).toBe(0);
  });
});

describe("closing fade", () => {
  it("uses up to twenty seconds", () => {
    expect(closingFadeSec(null)).toBe(20);
    expect(closingFadeSec(120)).toBe(20);
  });

  it("never waits longer than what is left of the track", () => {
    expect(closingFadeSec(7)).toBe(7);
    expect(closingFadeSec(0.2)).toBeGreaterThanOrEqual(1.5);
  });
});

describe("song length choices", () => {
  it("meters samples in ten-second units", () => {
    expect(sampleUnitCost(10)).toBe(1);
    expect(sampleUnitCost(20)).toBe(2);
    expect(sampleUnitCost(30)).toBe(3);
  });

  it("labels lengths in plain words", () => {
    expect(songLengthLabel(30)).toBe("30 seconds");
    expect(songLengthLabel(60)).toBe("1 minute");
    expect(songLengthLabel(240)).toBe("4 minutes");
  });

  it("offers one to four minute songs and never more", () => {
    expect(AI_SONG_LENGTH_CHOICES).toEqual([60, 120, 180, 240]);
    expect(Math.max(...AI_SONG_LENGTH_CHOICES)).toBe(AI_SONG_MAX_SECONDS);
  });

  it("names the wait so a host knows to stay put", () => {
    expect(composeWaitLabel(60)).toMatch(/minute/);
    expect(composeWaitLabel(240)).toMatch(/four/);
  });
});

describe("poems", () => {
  it("puts the spoken voice in front of the music and quotes the verse exactly", () => {
    const prompt = compilePoemPrompt(
      {
        ...DEFAULT_SONG_SETTINGS,
        kind: "poem",
        mood: "tender",
        genre: "piano",
        voice: "elder storyteller",
        poemStyle: "blessing",
        poemText: "For Tenia, who kept the porch light on.",
      },
      "Tenia at 80",
    );
    expect(prompt).toContain("blessing");
    expect(prompt).toContain("elder storyteller");
    expect(prompt).toContain("For Tenia, who kept the porch light on.");
    expect(prompt).toMatch(/pronounce every name/i);
    expect(prompt).toContain("Tenia at 80");
  });

  it("routes poems through the poem compiler from the shared entry point", () => {
    const settings = { ...DEFAULT_SONG_SETTINGS, kind: "poem" as const };
    expect(compileSongPrompt(settings)).toBe(compilePoemPrompt(settings));
  });

  it("scales the word budget with the length, so a 4 minute poem is longer", () => {
    expect(poemWordBudget(60)).toBeGreaterThan(40);
    expect(poemWordBudget(240)).toBeGreaterThan(poemWordBudget(60));
  });

  it("explains every poem style in plain words", () => {
    for (const style of POEM_STYLES) expect(POEM_STYLE_HINTS[style]).toBeTruthy();
  });
});

describe("streaming embeds", () => {
  it("embeds Apple Music on the embed host", () => {
    const e = musicEmbed("https://music.apple.com/us/playlist/party/pl.123");
    expect(e?.provider).toBe("apple");
    expect(e?.src).toContain("embed.music.apple.com");
  });

  it("embeds Spotify playlists", () => {
    const e = musicEmbed("https://open.spotify.com/playlist/abc123");
    expect(e?.src).toBe("https://open.spotify.com/embed/playlist/abc123");
  });

  it("passes an already-embedded Spotify link through unchanged", () => {
    expect(musicEmbed("https://open.spotify.com/embed/playlist/abc")?.src).toBe(
      "https://open.spotify.com/embed/playlist/abc",
    );
  });

  it("embeds Amazon Music by content id", () => {
    const e = musicEmbed("https://music.amazon.com/playlists/B0ABC123");
    expect(e?.provider).toBe("amazon");
    expect(e?.src).toContain("/embed/B0ABC123");
  });

  it("refuses to frame anything that is not an allow-listed service", () => {
    expect(musicEmbed("https://evil.example.com/playlist/1")).toBeNull();
    expect(musicEmbed("https://www.youtube.com/watch?v=1")).toBeNull();
    expect(musicEmbed("javascript:alert(1)")).toBeNull();
  });

  it("returns null for an Amazon link with no content id to embed", () => {
    expect(musicEmbed("https://music.amazon.com/")).toBeNull();
  });
});

// Browser-side track analysis, run once when a host adds a file. We measure
// loudness (energy) and a rough tempo so the wall can pick sensible transitions
// and change photos on the beat without doing any work at playback time.

import { analyseSamples } from "@/lib/wall-soundtrack";

export type TrackAnalysis = {
  seconds: number;
  bpm: number | null;
  energy: number | null;
  /** Near-silence at the head of the file, in ms. Skipped on playback. */
  introMs?: number;
  /** Near-silence at the tail of the file, in ms. Trimmed on playback. */
  outroMs?: number;
};


/** Average loudness, 0 to 1, from a downsampled mono view of the track. */
function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/**
 * Tempo from the onset envelope: build a coarse energy curve, then find the
 * beat spacing whose repeats line up best. Deliberately cheap and approximate;
 * a wrong-by-an-octave answer still produces musical bar lengths.
 */
export function estimateBpm(envelope: number[], envelopeHz: number): number | null {
  if (envelope.length < envelopeHz * 4) return null;
  const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
  const centred = envelope.map((v) => v - mean);
  let bestBpm: number | null = null;
  let bestScore = 0;
  for (let bpm = 60; bpm <= 180; bpm += 1) {
    const lag = Math.round((60 / bpm) * envelopeHz);
    if (lag < 2 || lag >= centred.length) continue;
    let score = 0;
    for (let i = 0; i + lag < centred.length; i += 1) score += centred[i]! * centred[i + lag]!;
    score /= centred.length - lag;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return bestScore > 0 ? bestBpm : null;
}

export async function analyseAudioFile(file: File): Promise<TrackAnalysis> {
  if (typeof window === "undefined") return { seconds: 0, bpm: null, energy: null };
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return { seconds: 0, bpm: null, energy: null };
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const seconds = Math.round(buffer.duration);

    // Trim-aware loudness: measured over the audible part only, so a file
    // that opens with half a second of nothing is not scored as quiet.
    const cond = analyseSamples(buffer);

    const envelopeHz = 100;
    const frame = Math.max(1, Math.floor(buffer.sampleRate / envelopeHz));
    const envelope: number[] = [];
    for (let i = 0; i + frame < channel.length; i += frame) {
      let peak = 0;
      for (let j = i; j < i + frame; j += 4) peak = Math.max(peak, Math.abs(channel[j]!));
      envelope.push(peak);
    }
    return {
      seconds,
      bpm: estimateBpm(envelope, envelopeHz),
      energy: cond.energy,
      introMs: Math.round(cond.headSec * 1000),
      outroMs: Math.round(cond.tailSec * 1000),
    };
  } catch {
    return { seconds: 0, bpm: null, energy: null };
  } finally {
    void ctx.close();
  }
}

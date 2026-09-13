/**
 * Group eCards voice notes, browser safe audio helpers.
 *
 * iOS Safari cannot decode WebM/Opus, so recordings must never be stored in
 * that format. When MediaRecorder genuinely gives us AAC in MP4 we use it, and
 * everywhere else we capture raw PCM and encode a 16 bit mono WAV at 24kHz,
 * which every browser can play back.
 */

export const WAV_SAMPLE_RATE = 24000;

/** True only when MediaRecorder really produces AAC in MP4, not Opus in MP4. */
export function supportsRealAacRecording(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  const supported = (t: string) =>
    typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(t);
  // Chromium advertises audio/mp4 but writes Opus inside it, and it always
  // supports WebM. Safari is the opposite, no WebM at all, real AAC in MP4.
  if (supported("audio/webm") || supported("audio/webm;codecs=opus")) return false;
  return supported("audio/mp4;codecs=mp4a.40.2") || supported("audio/mp4");
}

/** Mixes to mono and resamples with simple linear interpolation. */
export function toMono24k(buffer: AudioBuffer, targetRate = WAV_SAMPLE_RATE): Float32Array {
  const channels = buffer.numberOfChannels;
  const source = new Float32Array(buffer.length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) source[i]! += data[i]! / channels;
  }
  return resampleMono(source, buffer.sampleRate, targetRate);
}

export function resampleMono(
  input: Float32Array,
  fromRate: number,
  toRate = WAV_SAMPLE_RATE,
): Float32Array {
  if (!input.length || fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = pos - left;
    out[i] = input[left]! * (1 - frac) + input[right]! * frac;
  }
  return out;
}

/** Encodes mono float samples as a 16 bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate = WAV_SAMPLE_RATE): Blob {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Decodes any browser playable audio file into a mono 24kHz WAV blob. */
export async function fileToWav(file: Blob): Promise<Blob> {
  const Ctx: typeof AudioContext =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    return encodeWav(toMono24k(decoded));
  } finally {
    void ctx.close();
  }
}

const WORKLET_SOURCE = `
class PcmCollector extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) this.port.postMessage(new Float32Array(input[0]));
    return true;
  }
}
registerProcessor('pcm-collector', PcmCollector);
`;

export type PcmSession = {
  /** Stops capture and returns the recorded WAV blob. */
  stop: () => Promise<Blob>;
  sampleRate: number;
};

/**
 * Captures raw PCM through an AudioWorklet. Requests a 24kHz context so no
 * resampling is normally needed, and resamples on browsers that ignore it.
 */
export async function startPcmRecording(stream: MediaStream): Promise<PcmSession> {
  const Ctx: typeof AudioContext =
    (window as any).AudioContext ?? (window as any).webkitAudioContext;
  let ctx: AudioContext;
  try {
    ctx = new Ctx({ sampleRate: WAV_SAMPLE_RATE });
  } catch {
    ctx = new Ctx();
  }
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-collector");
  const chunks: Float32Array[] = [];
  node.port.onmessage = (e) => chunks.push(e.data as Float32Array);
  // Zero gain sink keeps the graph pulling without echoing to the speakers.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  source.connect(node);
  node.connect(sink);
  sink.connect(ctx.destination);

  return {
    sampleRate: ctx.sampleRate,
    stop: async () => {
      node.port.onmessage = null;
      try {
        source.disconnect();
        node.disconnect();
        sink.disconnect();
      } catch {
        /* already torn down */
      }
      const rate = ctx.sampleRate;
      await ctx.close().catch(() => {});
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let at = 0;
      for (const c of chunks) {
        merged.set(c, at);
        at += c.length;
      }
      return encodeWav(resampleMono(merged, rate), WAV_SAMPLE_RATE);
    },
  };
}

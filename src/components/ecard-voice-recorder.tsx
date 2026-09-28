import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fileToWav,
  startPcmRecording,
  supportsRealAacRecording,
  type PcmSession,
} from "@/lib/wav-audio";

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

const extForType = (mime: string) => {
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "wav";
};

/** Formats iOS Safari cannot decode are converted to WAV before upload. */
const isBroadlyPlayable = (mime: string) =>
  /(^audio\/(wav|x-wav|wave|mpeg|mp3|mp4|aac|m4a))/.test(mime);


/**
 * Voice note capture for eCard messages. Records with MediaRecorder or accepts
 * an uploaded audio file, then stores it in the existing ecard-media bucket.
 * Deliberately large, worded controls so older contributors can use it.
 */
export function VoiceNoteRecorder({
  slug,
  value,
  onChange,
  tone,
  onRemove,
}: {
  slug: string;
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  tone?: { ink: string; accent: string; accentInk: string };
  /**
   * Persisted removal for a voice note already saved on a message. When given,
   * the Remove button hands over to it, so the stored column and the file in
   * the bucket go together instead of only clearing this form.
   */
  onRemove?: () => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const pcmRef = useRef<PcmSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ink = tone?.ink ?? "currentColor";
  const border = tone ? `${tone.ink}33` : "rgba(0,0,0,0.15)";

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const uploadBlob = async (blob: Blob, rawMime: string) => {
    // Storage and audio players want a plain type, not "audio/mp4;codecs=...".
    let mime = (rawMime || blob.type || "audio/wav").split(";")[0]!.trim();
    let payload = blob;
    setUploading(true);
    setErr(null);
    try {
      // WebM/Opus and Ogg never reach the bucket, iPhone cannot decode them.
      if (!isBroadlyPlayable(mime)) {
        payload = await fileToWav(blob);
        mime = "audio/wav";
      }
      if (payload.size > MAX_AUDIO_BYTES) {
        setErr("That recording is too large. Please keep voice notes under 15MB.");
        return;
      }
      const path = `${slug}/${crypto.randomUUID()}.${extForType(mime)}`;
      const { error } = await supabase.storage.from("ecard-media").upload(path, payload, {
        contentType: mime,
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("ecard-media").getPublicUrl(path);
      setPreviewUrl(URL.createObjectURL(payload));
      onChange(data.publicUrl);
    } catch {
      setErr("That voice note would not upload. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const start = async () => {
    setErr(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("Recording is not supported on this browser. You can upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      if (supportsRealAacRecording()) {
        // Safari and iPhone, MediaRecorder here writes genuine AAC in MP4.
        const mime = MediaRecorder.isTypeSupported("audio/mp4;codecs=mp4a.40.2")
          ? "audio/mp4;codecs=mp4a.40.2"
          : "audio/mp4";
        const rec = new MediaRecorder(stream, { mimeType: mime });
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const type = rec.mimeType || mime;
          void uploadBlob(new Blob(chunksRef.current, { type }), type);
          stream.getTracks().forEach((t) => t.stop());
        };
        recorderRef.current = rec;
        rec.start();
      } else {
        // Everywhere else, capture raw PCM and encode 16 bit mono WAV, so we
        // never store WebM/Opus that iPhone cannot play.
        pcmRef.current = await startPcmRecording(stream);
      }
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setErr("We could not reach your microphone. Please allow microphone access and try again.");
    }
  };

  const stop = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    const pcm = pcmRef.current;
    if (pcm) {
      pcmRef.current = null;
      void pcm
        .stop()
        .then((blob) => uploadBlob(blob, "audio/wav"))
        .catch(() => setErr("That recording could not be saved. Please try again."))
        .finally(() => streamRef.current?.getTracks().forEach((t) => t.stop()));
      return;
    }
    try {
      recorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
  };


  const clear = () => {
    setPreviewUrl(null);
    setSeconds(0);
    onChange(undefined);
  };

  const audioSrc = previewUrl ?? value ?? null;

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: border, color: ink }}>
      <p className="text-sm font-medium">Record a voice note</p>
      <p className="mt-1 text-xs" style={{ opacity: 0.7 }}>
        Speak into your microphone, then listen back before you send it.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={() => void start()}
            disabled={uploading}
            className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-semibold disabled:opacity-60"
            style={
              tone
                ? { background: tone.accent, color: tone.accentInk }
                : { background: "var(--color-velvet, #6B4227)", color: "#fff" }
            }
          >
            {audioSrc ? "Record again" : "Start recording"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="inline-flex min-h-12 items-center justify-center rounded-full border px-6 text-base font-semibold"
            style={{ borderColor: border }}
          >
            Stop recording
          </button>
        )}
        {audioSrc && !recording && (
          <button
            type="button"
            onClick={onRemove && value && !previewUrl ? onRemove : clear}
            className="inline-flex min-h-12 items-center justify-center rounded-full border px-5 text-base font-medium"
            style={{ borderColor: border }}
          >
            Remove voice note
          </button>
        )}
      </div>

      {recording && (
        <p className="mt-2 text-sm" aria-live="polite">
          Recording, {seconds} {seconds === 1 ? "second" : "seconds"}
        </p>
      )}
      {uploading && <p className="mt-2 text-sm">Saving your voice note...</p>}

      {audioSrc && !recording && (
        <audio
          src={audioSrc}
          controls
          preload="metadata"
          aria-label="Listen back to your voice note"
          className="mt-3 w-full"
        />
      )}

      <div className="mt-4">
        <label className="block text-sm font-medium" htmlFor={`audio-file-${slug}`}>
          Or upload an audio file
        </label>
        <input
          id={`audio-file-${slug}`}
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            // Preview is set after upload, so it reflects the converted file.
            void uploadBlob(f, f.type || "audio/mpeg");

          }}
          className="mt-2 block w-full text-sm"
        />
        <p className="mt-1 text-xs" style={{ opacity: 0.65 }}>
          Keep it under 15MB.
        </p>
      </div>

      {err && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, Video, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Cut, FilmData, Scene } from "./data";
import { DISCLOSURE } from "./data";

const INK = "#f8f3ea";
const OXBLOOD = "#4e211e";
const DARK = "#17120f";
const GOLD = "#a98e66";
const CROSSFADE_FRAMES = 10;
const PICTURE_LEAD_SECONDS = 0.2;

function Device({ children, vertical }: { children: React.ReactNode; vertical: boolean }) {
  return <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 35%,#4e211e 0,#211715 55%,#120e0d 100%)", alignItems: "center", justifyContent: "center" }}><div style={{ position: "relative", height: vertical ? "72%" : "91%", aspectRatio: "390 / 844", border: "10px solid #2b2420", borderRadius: vertical ? 52 : 36, overflow: "hidden", boxShadow: "0 30px 90px #000", background: "white" }}>{children}</div></AbsoluteFill>;
}

function EndCard({ film, cut }: { film: FilmData; cut: Cut }) {
  const vertical = cut === "vertical";
  const opacity = interpolate(useCurrentFrame(), [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: INK, color: OXBLOOD, alignItems: "center", justifyContent: "center", textAlign: "center", padding: vertical ? "300px 80px 400px" : "100px" }}><div style={{ opacity }}><div style={{ fontFamily: "Georgia,serif", fontSize: vertical ? 92 : 86, lineHeight: 1.05 }}>{film.title}</div><div style={{ marginTop: 44, fontSize: vertical ? 34 : 27 }}>{film.actions.join(" | ")}</div><div style={{ marginTop: 64, fontSize: vertical ? 25 : 19, color: "#5f5a54" }}>{DISCLOSURE}</div></div></AbsoluteFill>;
}

function SceneView({ scene, cut }: { scene: Scene; cut: Cut }) {
  const vertical = cut === "vertical";
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const cardImage = vertical && scene.verticalCardImage ? scene.verticalCardImage : scene.image;
  let base: React.ReactNode;

  if (cardImage && scene.card) {
    const zoom = interpolate(frame, [0, Math.max(durationInFrames, 1)], [1, 1.05], { extrapolateRight: "clamp" });
    base = <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 35%,#4e211e 0,#211715 55%,#120e0d 100%)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}><Img src={staticFile(vertical && scene.card.verticalImage ? scene.card.verticalImage : cardImage)} style={{ width: vertical ? scene.card.verticalWidth : scene.card.width, height: "auto", transform: `scale(${zoom})`, borderRadius: 30, boxShadow: "0 30px 90px rgba(0,0,0,.55)" }} />{scene.label ? <div style={{ position: "absolute", left: vertical ? 80 : 100, right: vertical ? 80 : 100, top: vertical ? 290 : 60, color: INK, background: OXBLOOD, border: `1px solid ${GOLD}`, padding: "16px 22px", fontSize: vertical ? 35 : 27, textAlign: "center", borderRadius: 12 }}>{scene.label}</div> : null}</AbsoluteFill>;
  } else {
    const usePortrait = vertical && Boolean(scene.portraitFile);
    const file = usePortrait ? scene.portraitFile : scene.file;
    const startAt = usePortrait && scene.portraitFrom !== undefined ? scene.portraitFrom : (scene.from ?? 0);
    const crop = scene.crop?.[cut];
    const frameStyle: React.CSSProperties = crop ? { position: "absolute", width: `${crop.scale * 100}%`, height: `${crop.scale * 100}%`, left: `${(1 - crop.scale) * crop.x}%`, top: `${(1 - crop.scale) * crop.y}%` } : { position: "absolute", inset: 0 };
    const mediaStyle: React.CSSProperties = { width: "100%", height: "100%", objectFit: scene.fit ?? "cover", objectPosition: crop && crop.scale === 1 ? `${crop.x}% ${crop.y}%` : "center" };
    const media = <div style={frameStyle}>{scene.image ? <Img src={staticFile(scene.image)} style={mediaStyle} /> : file ? <Video src={staticFile(`footage/${file}`)} startFrom={Math.round(startAt * fps)} muted style={mediaStyle} /> : null}</div>;
    const phone = file?.includes("invite") || file?.includes("example") || file?.includes("ecard");
    base = <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 35%,#4e211e 0,#211715 55%,#120e0d 100%)", overflow: "hidden" }}>{phone ? <Device vertical={vertical}>{media}</Device> : media}{scene.label && !(vertical && scene.hideLabelVertical) ? <div style={{ position: "absolute", left: vertical ? 80 : 100, right: vertical ? 80 : 100, top: vertical ? 290 : 60, color: INK, background: OXBLOOD, border: `1px solid ${GOLD}`, padding: "16px 22px", fontSize: vertical ? 35 : 27, textAlign: "center", borderRadius: 12 }}>{scene.label}</div> : null}</AbsoluteFill>;
  }

  if (!scene.leadImage) return base;
  const leadFrames = Math.max(Math.round((scene.leadImageSeconds ?? 2) * fps), CROSSFADE_FRAMES + 1);
  const wallOpacity = interpolate(frame, [leadFrames - CROSSFADE_FRAMES, leadFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const leadScale = interpolate(frame, [0, leadFrames], [1, 1.025], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ background: DARK, alignItems: "center", justifyContent: "center", overflow: "hidden" }}><Img src={staticFile(scene.leadImage)} style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", transform: `scale(${leadScale})` }} /><AbsoluteFill style={{ opacity: wallOpacity }}>{base}</AbsoluteFill></AbsoluteFill>;
}

const voiceVolume = (frame: number, durationFrames: number, fps: number) => {
  const fadeIn = Math.max(1, Math.round(0.04 * fps));
  const fadeOut = Math.max(1, Math.round(0.15 * fps));
  const attack = interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const release = interpolate(frame, [Math.max(fadeIn, durationFrames - fadeOut), durationFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return Math.min(attack, release);
};

const bedVolume = (frame: number, film: FilmData, fps: number) => {
  const time = frame / fps;
  const base = 0.075;
  const ducked = base * Math.pow(10, -6 / 20);
  const ramp = 0.25;
  let level = base;
  for (const line of film.lines) {
    if (time < line.start - ramp || time >= line.captionEnd + ramp) continue;
    const attack = interpolate(time, [line.start - ramp, line.start], [base, ducked], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const release = interpolate(time, [line.captionEnd, line.captionEnd + ramp], [ducked, base], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    level = Math.min(level, attack, release);
  }
  const opening = interpolate(time, [0, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const endCardStart = film.lines.at(-1)?.start ?? Math.max(0, film.duration - 2);
  const closing = interpolate(time, [endCardStart, film.duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return level * opening * closing;
};

export function CelebrationsFilm({ film, cut, hideCaptions = false }: { film: FilmData; cut: Cut; hideCaptions?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const vertical = cut === "vertical";
  const caption = film.lines.find((line) => time >= line.start && time < line.captionEnd);
  const byId = new Map(film.lines.map((line) => [line.id, line]));
  const endCardActive = film.scenes.some((scene) => {
    if (scene.file || scene.image) return false;
    const line = byId.get(scene.lineId);
    return line ? time >= line.start && time < line.sceneEnd + 1.6 : false;
  });

  return <AbsoluteFill style={{ background: DARK, fontFamily: "Arial,sans-serif" }}>
    {film.scenes.map((scene, index) => {
      const line = byId.get(scene.lineId);
      if (!line) return null;
      const visualStart = scene.start ?? Math.max(0, line.start - PICTURE_LEAD_SECONDS);
      const nextScene = film.scenes[index + 1];
      const nextLine = nextScene ? byId.get(nextScene.lineId) : undefined;
      const nextStart = nextLine ? (nextScene?.start ?? Math.max(0, nextLine.start - PICTURE_LEAD_SECONDS)) : undefined;
      const end = nextStart !== undefined ? nextStart + CROSSFADE_FRAMES / fps : line.sceneEnd + 1.6;
      const from = Math.round(visualStart * fps);
      const duration = Math.max(1, Math.round((end - visualStart) * fps));
      const opacity = index === 0 ? 1 : interpolate(frame - from, [0, CROSSFADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return <Sequence key={scene.lineId} from={from} durationInFrames={duration} premountFor={CROSSFADE_FRAMES}><AbsoluteFill style={{ opacity }}>{scene.file || scene.image ? <SceneView scene={scene} cut={cut} /> : <EndCard film={film} cut={cut} />}</AbsoluteFill></Sequence>;
    })}
    <Audio src={staticFile(`audio/${film.bed}`)} volume={(audioFrame) => bedVolume(audioFrame, film, fps)} />
    {film.lines.map((line) => {
      const durationFrames = Math.ceil(line.duration * fps);
      return <Sequence key={line.id} from={Math.round(line.start * fps)}><Audio src={staticFile(`audio/${line.file}`)} volume={(audioFrame) => voiceVolume(audioFrame, durationFrames, fps)} /></Sequence>;
    })}
    {!hideCaptions && caption && !endCardActive ? <div style={{ position: "absolute", left: vertical ? 74 : 260, right: vertical ? 74 : 260, bottom: vertical ? 370 : 58, color: INK, background: "rgba(20,15,13,.91)", border: `1px solid ${GOLD}`, padding: vertical ? "20px 24px" : "14px 22px", fontSize: vertical ? 38 : 31, lineHeight: 1.24, textAlign: "center", borderRadius: 12 }}>{caption.text}</div> : null}
  </AbsoluteFill>;
}
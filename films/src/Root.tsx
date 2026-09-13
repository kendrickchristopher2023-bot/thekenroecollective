import React from "react";
import { Composition } from "remotion";
import { Film } from "./Film";
import { FILMS, type Cut, type FilmKey } from "./data";

const configs: Array<{ key: FilmKey; cut: Cut }> = [
  { key: "celebrations", cut: "horizontal" }, { key: "celebrations", cut: "vertical" },
  { key: "workroom", cut: "horizontal" }, { key: "workroom", cut: "vertical" },
  { key: "application-kit", cut: "horizontal" }, { key: "application-kit", cut: "vertical" },
];

export const RemotionRoot = () => <>{configs.map(({ key, cut }) => {
  const film = FILMS[key];
  return <Composition key={`${key}-${cut}`} id={`${key}-${cut}`} component={Film} durationInFrames={Math.ceil(film.duration * 30)} fps={30} width={cut === "horizontal" ? 1920 : 1080} height={cut === "horizontal" ? 1080 : 1920} defaultProps={{ film, cut }} />;
})}</>;
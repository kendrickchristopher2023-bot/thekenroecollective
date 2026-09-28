// Who can set up a Photo Wall soundtrack.
//
// This is the single switch for the feature's audience. AI song composing and
// hosted audio cost real money per use, so for now the soundtrack tools are
// internal-only: the two software owners (Chris and Adrian) can build a
// soundtrack, nobody else sees the controls.
//
// The full customer setup is preserved, not deleted. To offer it again later,
// change SOUNDTRACK_AUDIENCE to "atelier" (Atelier tier and owners) or
// "everyone" (any host who can edit the event). No other code needs to change:
// both the host panel and the server functions read this one value.
//
// Guests are never affected. Playback of an already-built soundtrack on the
// wall stays public, so a soundtrack an owner sets up for a client event still
// plays for everyone at that event.

export type SoundtrackAudience = "owners_only" | "atelier" | "everyone";

export const SOUNDTRACK_AUDIENCE: SoundtrackAudience = "owners_only";

/** True when this viewer may add, compose, reorder or remove soundtrack tracks. */
export function canManageSoundtrack(viewer: {
  isOwner: boolean;
  hasAtelier?: boolean;
}): boolean {
  if (viewer.isOwner) return true;
  if (SOUNDTRACK_AUDIENCE === "everyone") return true;
  if (SOUNDTRACK_AUDIENCE === "atelier") return !!viewer.hasAtelier;
  return false;
}

export const SOUNDTRACK_LOCKED_MESSAGE =
  "The event soundtrack is an internal tool right now and isn't part of your plan.";

// Who may use the Kenroe Sound Studio (compose, write, buy, attach).
//
// One decision, shared by the music and letter server functions, so the rule
// cannot drift between them: owners always may; everyone else only once the
// studio has been opened to the public by an owner (`music_studio_public`).
// While the studio is in private preview that setting is false, so every
// non-owner is refused with the same plain message.

export const STUDIO_LOCKED_MESSAGE =
  "The Sound Studio is in private preview. Ask us for early access.";

/** Pure rule: may this caller use the studio right now? */
export function studioAllowed(viewer: { isOwner: boolean; publicOpen: boolean }): boolean {
  if (viewer.isOwner) return true;
  return viewer.publicOpen === true;
}

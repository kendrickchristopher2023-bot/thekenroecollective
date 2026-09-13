export type Caption = { start: number; end: number; text: string };

export const CAPTIONS: Record<string, Caption[]> = {
  celebrations: [
    { start: 0.4, end: 3.7, text: "Invitations people open." },
    { start: 4.2, end: 6.2, text: "And remember." },
    { start: 6.8, end: 13.4, text: "Build the invitation, tell the story, and let every guest hear it in your voice." },
    { start: 14, end: 16.2, text: "Music makes the entrance." },
    { start: 17, end: 20.8, text: "RSVPs, seating and what to bring stay together." },
    { start: 21.5, end: 27.1, text: "Guests can see the finished example before you create a thing." },
    { start: 28, end: 33.5, text: "The photo wall becomes part of the celebration, not another folder to manage." },
    { start: 34, end: 39.2, text: "Afterward, turn the thank-you into something ready to print at home." },
    { start: 40, end: 46.7, text: "Or let everyone sign one card together, with every message waiting for the right moment." },
    { start: 47, end: 52.2, text: "And soon, compose a piece made only for them." },
    { start: 53, end: 58.2, text: "Celebrations, from The Kenroe Collective." },
  ],
  workroom: [
    { start: 0.4, end: 7.2, text: "Production work, without the ceremony. Keep every moving part where the whole team can see it." },
    { start: 7.5, end: 10, text: "Move work forward in one gesture." },
    { start: 10.5, end: 17.8, text: "Open a task for the detail, the conversation, and the file everyone needs." },
    { start: 18.5, end: 24.3, text: "Invite the right people, give each one a role, and change it whenever the work changes." },
    { start: 25, end: 29.2, text: "Connect the board to the event it is helping create." },
    { start: 30, end: 33, text: "The Workroom, from The Kenroe Collective." },
  ],
  "application-kit": [
    { start: 0.4, end: 5.1, text: "Job hunting shouldn't mean rewriting yourself from scratch for every opening." },
    { start: 5.5, end: 14.8, text: "Application Kit finds real openings from public job boards, refreshed every day. Filter by place, remote or salary." },
    { start: 15, end: 24.4, text: "Paste a job description, and your résumé is rewritten in that role's language, with a cover letter drafted from what you've actually done." },
    { start: 25, end: 29, text: "It never invents an employer, a title or a number." },
    { start: 29.5, end: 36.8, text: "Track every application, what came back and what's next, with interview prep and follow-ups ready." },
    { start: 37.2, end: 40, text: "And nothing is ever sent without you." },
    { start: 41, end: 45.7, text: "Application Kit, by invitation, from The Kenroe Collective." },
  ],
};
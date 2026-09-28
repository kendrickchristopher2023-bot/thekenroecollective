// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { useLocalDraft } from "@/hooks/use-local-draft";

function Composer({ onClearRef }: { onClearRef?: (fn: () => void) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const clear = useLocalDraft(
    "kenroe:test-draft:e1",
    { title, body },
    (d) => {
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.body === "string") setBody(d.body);
    },
    (d) => !String(d.title ?? "").trim() && !String(d.body ?? "").trim(),
  );
  onClearRef?.(clear);
  return (
    <div>
      <input aria-label="title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea aria-label="body" value={body} onChange={(e) => setBody(e.target.value)} />
      <button onClick={clear}>clear</button>
    </div>
  );
}

describe("host composers never lose typed content", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("restores a multi-paragraph message with emoji after a remount", () => {
    render(<Composer />);
    fireEvent.change(screen.getByLabelText("title"), { target: { value: "Parking update" } });
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "Line one\n\nLine two 🎉" } });

    cleanup();
    render(<Composer />);

    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("Parking update");
    expect((screen.getByLabelText("body") as HTMLTextAreaElement).value).toBe("Line one\n\nLine two 🎉");
  });

  it("clearing on the success path stops the draft coming back as a ghost", () => {
    render(<Composer />);
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "sent already" } });
    fireEvent.click(screen.getByText("clear"));

    cleanup();
    render(<Composer />);
    expect((screen.getByLabelText("body") as HTMLTextAreaElement).value).toBe("");
  });

  it("an empty composer stores nothing", () => {
    render(<Composer />);
    fireEvent.change(screen.getByLabelText("title"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("title"), { target: { value: "" } });
    expect(window.localStorage.getItem("kenroe:test-draft:e1")).toBeNull();
  });
});

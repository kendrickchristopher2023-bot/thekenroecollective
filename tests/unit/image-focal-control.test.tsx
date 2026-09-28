// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FocalImage, ImageFocalControl } from "@/components/image-focal-control";

const URL = "https://cdn.example.com/family.jpg";

afterEach(() => cleanup());

describe("ImageFocalControl keyboard/button fallbacks", () => {
  it("presets move the focus without any dragging", async () => {
    const onChange = vi.fn();
    render(<ImageFocalControl url={URL} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Show top" }));
    expect(onChange).toHaveBeenLastCalledWith(`${URL}#f=50,0,1`);
  });

  it("nudge buttons shift the focus in steps", async () => {
    const onChange = vi.fn();
    render(<ImageFocalControl url={URL} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Move photo up" }));
    expect(onChange).toHaveBeenLastCalledWith(`${URL}#f=50,46,1`);
  });

  it("arrow keys on the frame work for keyboard-only users", async () => {
    const onChange = vi.fn();
    render(<ImageFocalControl url={URL} onChange={onChange} />);
    const frame = screen.getByRole("group");
    frame.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(onChange).toHaveBeenLastCalledWith(`${URL}#f=50,46,1`);
  });

  it("fit whole photo and reset to center are both reachable", async () => {
    const onChange = vi.fn();
    render(<ImageFocalControl url={`${URL}#f=50,10,1`} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Fit whole photo/ }));
    expect(onChange).toHaveBeenLastCalledWith(`${URL}#f=50,10,1,contain`);
    await userEvent.click(screen.getByRole("button", { name: /Reset to center/ }));
    // Reset drops the fragment, restoring the original stored URL exactly.
    expect(onChange).toHaveBeenLastCalledWith(URL);
  });

  it("every control meets the 44px tap target rule", () => {
    render(<ImageFocalControl url={URL} onChange={() => {}} />);
    for (const btn of screen.getAllByRole("button")) {
      expect(btn.className).toMatch(/min-h-\[44px\]/);
    }
  });
});

describe("FocalImage", () => {
  it("renders legacy URLs centered and strips the fragment from src", () => {
    const { container, rerender } = render(<FocalImage url={URL} alt="legacy" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(URL);
    expect(img.style.objectPosition).toBe("50% 50%");

    rerender(<FocalImage url={`${URL}#f=40,12,1.5`} alt="adjusted" />);
    const next = container.querySelector("img")!;
    expect(next.getAttribute("src")).toBe(URL);
    expect(next.style.objectPosition).toBe("40% 12%");
    expect(next.style.transform).toBe("scale(1.5)");
  });
});

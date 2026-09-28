// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const ask = vi.fn();
const listThreads = vi.fn();
const getThread = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));

vi.mock("@/lib/owner-assistant.functions", () => ({
  listAssistantThreads: () => listThreads(),
  getAssistantThread: (a: any) => getThread(a),
  askAssistant: (a: any) => ask(a),
  deleteAssistantThread: vi.fn(),
}));

const listActions = vi.fn();
vi.mock("@/lib/owner-ai-actions.functions", () => ({
  listOwnerActions: (a: any) => listActions(a),
  approveOwnerAction: vi.fn(),
  rejectOwnerAction: vi.fn(),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

import { OwnerAssistantPanel } from "@/components/admin/owner-assistant-panel";

describe("OwnerAssistantPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listActions.mockResolvedValue({ actions: [] });
    listThreads.mockResolvedValue({
      threads: [],
      usage: { questionsToday: 0, remainingToday: 40, monthCost: "$0.00" },
    });
  });

  afterEach(() => cleanup());

  it("shows the allowance and the read-only promise", async () => {
    render(<OwnerAssistantPanel />);
    await waitFor(() => expect(screen.getByText(/questions left today/)).toBeTruthy());
    expect(screen.getByText(/never carries anything out/)).toBeTruthy();
  });

  it("asks a quick prompt and renders the answer with its sources", async () => {
    ask.mockResolvedValue({
      threadId: "t1",
      answer: {
        id: "m1",
        role: "assistant",
        content: "There are 0 open support tickets.",
        sources: [{ label: "Support inbox", where: "support_tickets table" }],
        toolsUsed: ["get_support_tickets"],
        createdAt: new Date().toISOString(),
      },
      usage: { questionsToday: 1, remainingToday: 39, monthCost: "$0.01" },
    });

    render(<OwnerAssistantPanel />);
    await waitFor(() => expect(screen.getByText(/questions left today/)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Pending support tickets" }));

    await waitFor(() => expect(screen.getByText(/0 open support tickets/)).toBeTruthy());
    expect(ask).toHaveBeenCalledWith({
      data: { threadId: null, question: "Pending support tickets" },
    });
    expect(screen.getByText("Read from")).toBeTruthy();
    expect(screen.getByText("Support inbox")).toBeTruthy();
    expect(screen.getByText(/support_tickets table/)).toBeTruthy();
  });

  it("surfaces a rate-limit message and keeps the question so it can be retried", async () => {
    ask.mockRejectedValue(new Error("Daily question limit reached. Try again tomorrow."));
    render(<OwnerAssistantPanel />);
    await waitFor(() => expect(screen.getByText(/questions left today/)).toBeTruthy());

    const input = screen.getByLabelText("Ask the owner assistant");
    await userEvent.type(input, "how much revenue last week");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(screen.getByText(/Daily question limit reached/)).toBeTruthy());
    expect((input as HTMLInputElement).value).toBe("how much revenue last week");
  });
});

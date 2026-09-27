import 'fake-indexeddb/auto';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { dataService } from "./dependencies";
import { calculateSessionScore } from '../features/scoring/calculateSessionScore';
beforeEach(async () => { await dataService.resetWorkspace(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function renderRoute(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}
describe("MorrowLab product flow", () => {
  it('can end and save while camera permission is still pending', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise(() => {}) } });
    await dataService.loadDemoWorkspace();
    renderRoute('/session');
    fireEvent.click(await screen.findByRole('button', { name: 'Start monitoring' }));
    const end = await screen.findByRole('button', { name: 'End session' });
    await waitFor(() => expect(end).toBeEnabled());
    await new Promise(resolve => setTimeout(resolve, 20));
    fireEvent.click(end);
    fireEvent.click(await screen.findByRole('button', { name: 'Finish session' }));
    await screen.findByRole('heading', { name: 'Progress, worth noticing.' });
    const saved = (await dataService.getRecentSessions()).find(s => !s.isDemoHistory)!;
    expect(saved.taskBreakdown).toEqual([]);
    expect(saved.score).toBe(calculateSessionScore(saved));
  });
  it("loads demo data, records fallback events, saves reflection and shows tomorrow", async () => {
    renderRoute();
    fireEvent.click(
      await screen.findByRole("button", { name: /Load demo workspace/ }),
    );
    await screen.findByRole("heading", { name: "Calculus Homework" });
    fireEvent.click(screen.getByRole("link", { name: /Start study session/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Start monitoring" }),
    );
    await screen.findByRole("button", { name: "Monitoring active" });
    // The screen activity log is stored, not shown, during the session.
    expect(screen.queryByText("Screen activity")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate phone" }));
    // Real intervals must have positive elapsed time before they can be persisted.
    await new Promise(resolve => setTimeout(resolve, 20));
    fireEvent.click(screen.getByRole("button", { name: "Simulate away" }));
    await new Promise(resolve => setTimeout(resolve, 20));
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    await screen.findByRole("heading", { name: "How did it go?" });
    // No tab evidence yet, so the estimate starts at 0; the student fills in what they did.
    expect(screen.getByLabelText("Minutes on Calculus Homework")).toHaveValue(0);
    fireEvent.change(screen.getByLabelText("Minutes on Calculus Homework"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Minutes on CS Reading"), { target: { value: "10" } });
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Finished" })[0]);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Optional note"), {
      target: { value: "A useful focus block." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
    await screen.findByRole("heading", { name: "Progress, worth noticing." });
    expect(screen.getByText("A useful focus block.")).toBeInTheDocument();
    expect(screen.getByText("Calculus Homework (25 min) · CS Reading (10 min)")).toBeInTheDocument();
    expect(screen.getByText("Screen distraction", { selector: ".summary-metrics span" }).nextElementSibling).toHaveTextContent("00:00");
    const sessions = await dataService.getRecentSessions();
    const latest = sessions.find((s) => !s.isDemoHistory)!;
    expect(latest.cameraEvents.map((e) => e.type)).toEqual([
      "phone",
      "away",
    ]);
    expect(latest.reflection?.completionPct).toBe(100);
    expect(latest.score).toBe(calculateSessionScore(latest));
    expect(latest.activitySegments.every(s => s.source === 'browser')).toBe(true);
    expect(latest.taskBreakdown.map(t => [t.taskTitle, t.seconds])).toEqual([["Calculus Homework", 1500], ["CS Reading", 600]]);
    expect(latest.subject).toBe("Math");
    expect((await dataService.listTasks()).find(t => t.title === "Calculus Homework")!.status).toBe("done");
    fireEvent.click(screen.getByRole("link", { name: /See tomorrow/ }));
    await screen.findByText("Based on 8 recent sessions");
    expect(screen.getByText("Includes demo history")).toBeInTheDocument();
    expect(
      screen.getByText("Updated from your latest session"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 study blocks")).toBeInTheDocument();
  });
  it("creates a task and requires confirmation to reset the workspace", async () => {
    renderRoute();
    await screen.findByText("A fresh page.");
    fireEvent.change(screen.getByLabelText("Task name"), {
      target: { value: "Read chapter five" },
    });
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "History" },
    });
    fireEvent.change(screen.getByLabelText("Deadline"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await screen.findByRole("heading", { name: "Read chapter five" });
    fireEvent.click(screen.getByRole("button", { name: "Reset local data" }));
    expect(await dataService.listTasks()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("button", { name: "Delete local data" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset local data" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete local data" }));
    await screen.findByText("A fresh page.");
    expect(await dataService.listTasks()).toHaveLength(0);
  });
  it("shows service failures and lets a failed session start be retried", async () => {
    await dataService.loadDemoWorkspace();
    vi.spyOn(dataService, "startSession").mockRejectedValueOnce(
      new Error("Storage is temporarily unavailable."),
    );
    renderRoute("/session");
    fireEvent.click(
      await screen.findByRole("button", { name: "Start monitoring" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storage is temporarily unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Start monitoring" }));
    await screen.findByRole("button", { name: "Monitoring active" });
  });
  it("retains reflection when saving fails and retries without duplicating history", async () => {
    await dataService.loadDemoWorkspace();
    vi.spyOn(dataService, "finishSession").mockRejectedValueOnce(
      new Error("Could not save. Try again."),
    );
    renderRoute("/session");
    fireEvent.click(
      await screen.findByRole("button", { name: "Start monitoring" }),
    );
    await screen.findByRole("button", { name: "Monitoring active" });
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    fireEvent.change(await screen.findByLabelText("Optional note"), {
      target: { value: "Keep this reflection" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Optional note")).toHaveValue(
      "Keep this reflection",
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
    await screen.findByRole("heading", { name: "Progress, worth noticing." });
    expect(
      (await dataService.getRecentSessions()).filter((s) => !s.isDemoHistory),
    ).toHaveLength(1);
  });
  it.each([
    ["/session/old-task-link", "Good morning."],
    ["/summary/missing", "Session not found"],
    ["/unknown", "Good morning."],
  ])("handles %s", async (route, heading) => {
    renderRoute(route);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument(),
    );
  });
});

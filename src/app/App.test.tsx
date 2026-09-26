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
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function renderRoute(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}
describe("MorrowLab product flow", () => {
  it("loads demo data, records fallback events, saves reflection and shows tomorrow", async () => {
    renderRoute();
    fireEvent.click(
      await screen.findByRole("button", { name: /Load demo workspace/ }),
    );
    const starts = await screen.findAllByRole("link", {
      name: /Start Session/,
    });
    expect(starts).toHaveLength(3);
    fireEvent.click(starts[0]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Start monitoring" }),
    );
    await screen.findByRole("button", { name: "Monitoring active" });
    fireEvent.click(screen.getByRole("button", { name: "Simulate phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate away" }));
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    await screen.findByRole("heading", { name: "How did it go?" });
    fireEvent.change(screen.getByRole("slider"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Optional note"), {
      target: { value: "A useful focus block." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish session" }));
    await screen.findByRole("heading", { name: "Progress, worth noticing." });
    expect(screen.getByText("A useful focus block.")).toBeInTheDocument();
    const sessions = await dataService.getRecentSessions();
    const latest = sessions.find((s) => !s.isDemoHistory)!;
    expect(latest.cameraEvents.map((e) => e.type)).toEqual([
      "studying",
      "phone",
      "away",
    ]);
    expect(latest.reflection?.completionPct).toBe(100);
    expect(latest.score).toBe(84);
    fireEvent.click(screen.getByRole("link", { name: /See tomorrow/ }));
    await screen.findByText("Based on 7 recent sessions");
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
    const task = (await dataService.listTasks())[0];
    vi.spyOn(dataService, "startSession").mockRejectedValueOnce(
      new Error("Storage is temporarily unavailable."),
    );
    renderRoute(`/session/${task.id}`);
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
    const task = (await dataService.listTasks())[0];
    vi.spyOn(dataService, "finishSession").mockRejectedValueOnce(
      new Error("Could not save. Try again."),
    );
    renderRoute(`/session/${task.id}`);
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
    ["/session/missing", "Task not found"],
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

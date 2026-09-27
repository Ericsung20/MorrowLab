import type { MorrowLabDataService } from "../contracts/services";
import type { StudySession, StudyTask } from "../contracts/morrowlab";
const KEY = "morrowlab.ui-mock.v1";
type Workspace = { tasks: StudyTask[]; sessions: StudySession[] };
function read(): Workspace {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { tasks: [], sessions: [] };
  const value = JSON.parse(raw) as Workspace;
  if (!Array.isArray(value.tasks) || !Array.isArray(value.sessions))
    throw new Error(
      "Local demo data could not be read. Reset local data to start again.",
    );
  return value;
}
function save(value: Workspace) {
  localStorage.setItem(KEY, JSON.stringify(value));
}
const id = () => crypto.randomUUID();
export const mockMorrowLabDataService: MorrowLabDataService = {
  async listTasks() {
    return read().tasks;
  },
  async createTask(input) {
    if (
      !input.title.trim() ||
      !input.subject.trim() ||
      input.estimatedMinutes < 1 ||
      !Number.isFinite(Date.parse(input.deadlineISO))
    )
      throw new Error("Please enter a title, subject, duration and deadline.");
    const task: StudyTask = {
      ...input,
      title: input.title.trim(),
      subject: input.subject.trim(),
      id: id(),
      status: "todo",
      createdAtISO: new Date().toISOString(),
    };
    const db = read();
    db.tasks.push(task);
    save(db);
    return task;
  },
  async getTask(taskId) {
    return read().tasks.find((t) => t.id === taskId);
  },
  async startSession(taskId) {
    const db = read();
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("This task no longer exists.");
    const session: StudySession = {
      id: id(),
      taskId,
      taskTitle: task.title,
      subject: task.subject,
      startedAtISO: new Date().toISOString(),
      durationSec: 0,
      cameraEvents: [],
      activitySegments: [],
    };
    db.sessions.push(session);
    save(db);
    return session;
  },
  async finishSession(sessionId, input) {
    const db = read();
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("This session could not be found.");
    if (session.endedAtISO) return session;
    // Deliberately illustrative fixture score; production scoring belongs to Engineer 2.
    Object.assign(session, input, {
      endedAtISO: new Date().toISOString(),
      durationSec: Math.round(
        input.cameraEvents.reduce((sum, e) => sum + e.durationSec, 0),
      ),
      score: 84,
    });
    const task = db.tasks.find((t) => t.id === session.taskId);
    if (task && input.reflection.completionPct === 100) task.status = "done";
    save(db);
    return session;
  },
  async getSession(sessionId) {
    return read().sessions.find((s) => s.id === sessionId);
  },
  async getRecentSessions() {
    return read()
      .sessions.filter((s) => s.endedAtISO)
      .sort((a, b) => b.startedAtISO.localeCompare(a.startedAtISO));
  },
  async getInsights() {
    return read().sessions.some((s) => s.endedAtISO)
      ? [
          "Your Math sessions perform best in the morning.",
          "A short break between subjects can help you begin again.",
          "Your afternoon sessions have fewer interruptions.",
        ]
      : [];
  },
  async getTomorrowRecommendations() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    let startMinutes = 9 * 60;
    return read()
      .tasks.filter((t) => t.status === "todo")
      .map((t) => {
        const startTime = `${String(Math.floor(startMinutes / 60) % 24).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
        startMinutes += t.estimatedMinutes + 15;
        return {
          taskId: t.id,
          taskTitle: t.title,
          subject: t.subject,
          dateISO: tomorrow.toISOString(),
          startTime,
          estimatedMinutes: t.estimatedMinutes,
          recommendationScore: 89,
          reasons: [
            "Suggested demo time: build on a consistent study routine.",
            "A focused block with room for a break afterward.",
          ],
        };
      });
  },
  async loadDemoWorkspace() {
    const db = read();
    if (db.sessions.some((s) => s.isDemoHistory)) return;
    const now = new Date();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 2);
    const tasks: StudyTask[] = [
      ["Calculus problem set", "Mathematics", 45],
      ["The science of memory", "Psychology", 30],
      ["Algorithms · chapter 04", "Computer Science", 60],
    ].map(([title, subject, minutes]) => ({
      id: id(),
      title: String(title),
      subject: String(subject),
      estimatedMinutes: Number(minutes),
      deadlineISO: deadline.toISOString(),
      createdAtISO: now.toISOString(),
      status: "todo",
    }));
    const sessions: StudySession[] = Array.from({ length: 6 }, (_, i) => {
      const task = tasks[i % 3];
      const start = new Date(now.getTime() - (i + 1) * 86400000);
      return {
        id: id(),
        taskId: task.id,
        taskTitle: task.title,
        subject: task.subject,
        startedAtISO: start.toISOString(),
        endedAtISO: new Date(start.getTime() + 1800000).toISOString(),
        durationSec: 1800,
        cameraEvents: [],
        activitySegments: [],
        reflection: { focus: 4, understanding: 4, completionPct: 80 },
        score: 84 + i,
        isDemoHistory: true,
      };
    });
    save({
      tasks: [...db.tasks, ...tasks],
      sessions: [...db.sessions, ...sessions],
    });
  },
  async resetWorkspace() {
    localStorage.removeItem(KEY);
  },
};

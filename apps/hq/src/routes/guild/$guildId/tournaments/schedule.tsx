import { useState, useCallback, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
  getAutoTournamentSchedules,
  createAutoTournamentSchedule,
  updateAutoTournamentSchedule,
  deleteAutoTournamentSchedule,
} from "#/lib/server/tournaments";
import { AuthGuard } from "#/components/auth-guard";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "#/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "#/components/ui/table";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  CalendarDays,
  Clock,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  CalendarClock,
} from "lucide-react";

const loadAutoTournamentSchedules = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getAutoTournamentSchedules(getRequestHeaders(), data.guildId);
  });

const createSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return {
      guildId: input.guildId,
      name: typeof input.name === "string" ? input.name : "",
      format: typeof input.format === "string" ? input.format : "single",
      teamCap: typeof input.teamCap === "number" ? input.teamCap : 8,
      cronExpression:
        typeof input.cronExpression === "string" ? input.cronExpression : "0 12 * * *",
      channelId: typeof input.channelId === "string" ? input.channelId : "",
      roleId: typeof input.roleId === "string" ? input.roleId : null,
      enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    };
  })
  .handler(async ({ data }) => {
    return createAutoTournamentSchedule(getRequestHeaders(), data.guildId, {
      name: data.name,
      format: data.format,
      teamCap: data.teamCap,
      cronExpression: data.cronExpression,
      channelId: data.channelId,
      roleId: data.roleId,
      enabled: data.enabled,
    });
  });

const updateSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    const rawId = input.scheduleId;
    const scheduleId =
      typeof rawId === "string" ? Number(rawId) : typeof rawId === "number" ? rawId : NaN;
    if (Number.isNaN(scheduleId)) throw new Error("scheduleId required");
    return {
      guildId: input.guildId,
      scheduleId,
      name: typeof input.name === "string" ? input.name : undefined,
      format: typeof input.format === "string" ? input.format : undefined,
      teamCap: typeof input.teamCap === "number" ? input.teamCap : undefined,
      cronExpression: typeof input.cronExpression === "string" ? input.cronExpression : undefined,
      channelId: typeof input.channelId === "string" ? input.channelId : undefined,
      roleId: input.roleId === null || typeof input.roleId === "string" ? input.roleId : undefined,
      enabled: typeof input.enabled === "boolean" ? input.enabled : undefined,
    };
  })
  .handler(async ({ data }) => {
    return updateAutoTournamentSchedule(getRequestHeaders(), data.guildId, data.scheduleId, {
      name: data.name,
      format: data.format,
      teamCap: data.teamCap,
      cronExpression: data.cronExpression,
      channelId: data.channelId,
      roleId: data.roleId,
      enabled: data.enabled,
    });
  });

const deleteSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    const rawId = input.scheduleId;
    const scheduleId =
      typeof rawId === "string" ? Number(rawId) : typeof rawId === "number" ? rawId : NaN;
    if (Number.isNaN(scheduleId)) throw new Error("scheduleId required");
    return { guildId: input.guildId, scheduleId };
  })
  .handler(async ({ data }) => {
    return deleteAutoTournamentSchedule(getRequestHeaders(), data.guildId, data.scheduleId);
  });

export const Route = createFileRoute("/guild/$guildId/tournaments/schedule")({
  loader: ({ params }) => loadAutoTournamentSchedules({ data: { guildId: params.guildId } }),
  component: TournamentScheduleRoute,
});

type Schedule = Awaited<ReturnType<typeof loadAutoTournamentSchedules>>[number];

type FrequencyType = "daily" | "weekly" | "monthly";

interface CronValues {
  frequency: FrequencyType;
  time: string;
  day: number;
}

function parseCronExpression(cron: string): CronValues | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;
  const time = `${hour?.padStart(2, "0") ?? "00"}:${minute?.padStart(2, "0") ?? "00"}`;

  if (dayOfMonth === "*" && dayOfWeek === "*") {
    return { frequency: "daily", time, day: 1 };
  }
  if (dayOfMonth === "*" && dayOfWeek !== "*") {
    return { frequency: "weekly", time, day: Number(dayOfWeek) };
  }
  if (dayOfMonth !== "*" && dayOfWeek === "*") {
    return { frequency: "monthly", time, day: Number(dayOfMonth) };
  }
  return null;
}

function buildCronExpression(values: CronValues): string {
  const [hour, minute] = values.time.split(":");
  switch (values.frequency) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${values.day}`;
    case "monthly":
      return `${minute} ${hour} ${values.day} * *`;
  }
}

function getNextOccurrences(values: CronValues, count: number): Date[] {
  const [hourStr, minuteStr] = values.time.split(":");
  const hour = Number(hourStr ?? "0");
  const minute = Number(minuteStr ?? "0");
  const dates: Date[] = [];
  const candidate = new Date();
  candidate.setHours(hour, minute, 0, 0);

  if (candidate.getTime() <= Date.now()) {
    candidate.setDate(candidate.getDate() + 1);
  }

  while (dates.length < count) {
    let include = false;
    if (values.frequency === "daily") {
      include = true;
    } else if (values.frequency === "weekly") {
      include = candidate.getDay() === values.day;
    } else if (values.frequency === "monthly") {
      const lastDayOfMonth = new Date(
        candidate.getFullYear(),
        candidate.getMonth() + 1,
        0,
      ).getDate();
      const targetDay = Math.min(values.day, lastDayOfMonth);
      include = candidate.getDate() === targetDay;
    }

    if (include) {
      dates.push(new Date(candidate));
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return dates;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFrequencyLabel(cron: string): string {
  const parsed = parseCronExpression(cron);
  if (!parsed) return cron;

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const [hour, minute] = parsed.time.split(":");
  const timeLabel = `${hour}:${minute}`;

  switch (parsed.frequency) {
    case "daily":
      return `Daily at ${timeLabel}`;
    case "weekly":
      return `Weekly on ${days[parsed.day]} at ${timeLabel}`;
    case "monthly":
      return `Monthly on day ${parsed.day} at ${timeLabel}`;
  }
}

function formatFormatLabel(format: string): string {
  return format === "double" ? "Double Elimination" : "Single Elimination";
}

type Mode = { type: "list" } | { type: "create" } | { type: "edit"; schedule: Schedule };

const DEFAULT_FORM = {
  name: "",
  format: "single" as "single" | "double",
  teamCap: 8,
  frequency: "weekly" as FrequencyType,
  time: "18:00",
  day: 1,
  channelId: "",
  roleId: "",
  enabled: true,
};

function TournamentScheduleRoute() {
  const { guildId } = Route.useParams();
  const schedules = Route.useLoaderData();
  const [mode, setMode] = useState<Mode>({ type: "list" });
  const [schedulesList, setSchedulesList] = useState<Schedule[]>(schedules);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<
    null | { type: "success"; message: string } | { type: "error"; message: string }
  >(null);

  const [form, setForm] = useState({ ...DEFAULT_FORM });

  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 4000);
    },
    [setToast],
  );

  const resetForm = useCallback(() => {
    setForm({ ...DEFAULT_FORM });
  }, []);

  const handleStartCreate = useCallback(() => {
    resetForm();
    setMode({ type: "create" });
    setToast(null);
  }, [resetForm]);

  const handleStartEdit = useCallback(
    (schedule: Schedule) => {
      const parsed = parseCronExpression(schedule.cronExpression);
      setForm({
        name: schedule.name,
        format: schedule.format as "single" | "double",
        teamCap: schedule.teamCap,
        frequency: parsed?.frequency ?? "weekly",
        time: parsed?.time ?? "18:00",
        day: parsed?.day ?? 1,
        channelId: schedule.channelId,
        roleId: schedule.roleId ?? "",
        enabled: schedule.enabled,
      });
      setMode({ type: "edit", schedule });
      setToast(null);
    },
    [setForm, setMode],
  );

  const handleBack = useCallback(() => {
    setMode({ type: "list" });
    setToast(null);
  }, []);

  const updateField = useCallback(
    <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const cronValues = useMemo(
    () => ({
      frequency: form.frequency,
      time: form.time,
      day: form.day,
    }),
    [form.frequency, form.time, form.day],
  );

  const nextOccurrences = useMemo(() => getNextOccurrences(cronValues, 5), [cronValues]);

  const validateForm = useCallback((): string | null => {
    if (!form.name.trim()) return "Name is required.";
    if (form.teamCap < 2) return "Team cap must be at least 2.";
    if (!form.channelId.trim()) return "Channel ID is required.";
    if (!form.time.match(/^\d{2}:\d{2}$/)) return "Invalid time format.";
    if (form.frequency === "weekly" && (form.day < 0 || form.day > 6)) {
      return "Invalid day of week.";
    }
    if (form.frequency === "monthly" && (form.day < 1 || form.day > 31)) {
      return "Invalid day of month.";
    }
    return null;
  }, [form]);

  const handleSave = useCallback(async () => {
    const error = validateForm();
    if (error) {
      showToast("error", error);
      return;
    }

    setIsSaving(true);
    setToast(null);

    const cronExpression = buildCronExpression(cronValues);

    try {
      if (mode.type === "create") {
        const result = await createSchedule({
          data: {
            guildId,
            name: form.name.trim(),
            format: form.format,
            teamCap: form.teamCap,
            cronExpression,
            channelId: form.channelId.trim(),
            roleId: form.roleId.trim() || null,
            enabled: form.enabled,
          },
        });
        if (result) {
          setSchedulesList((prev) => [result, ...prev]);
          showToast("success", "Schedule created successfully.");
          setMode({ type: "list" });
          resetForm();
        } else {
          showToast("error", "Failed to create schedule.");
        }
      } else if (mode.type === "edit") {
        const result = await updateSchedule({
          data: {
            guildId,
            scheduleId: mode.schedule.id,
            name: form.name.trim(),
            format: form.format,
            teamCap: form.teamCap,
            cronExpression,
            channelId: form.channelId.trim(),
            roleId: form.roleId.trim() || null,
            enabled: form.enabled,
          },
        });
        if (result) {
          setSchedulesList((prev) => prev.map((s) => (s.id === result.id ? result : s)));
          showToast("success", "Schedule updated successfully.");
          setMode({ type: "list" });
          resetForm();
        } else {
          showToast("error", "Failed to update schedule.");
        }
      }
    } catch {
      showToast("error", "An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  }, [mode, form, guildId, cronValues, validateForm, showToast, resetForm]);

  const handleToggleEnabled = useCallback(
    async (schedule: Schedule) => {
      try {
        const result = await updateSchedule({
          data: {
            guildId,
            scheduleId: schedule.id,
            enabled: !schedule.enabled,
          },
        });
        if (result) {
          setSchedulesList((prev) => prev.map((s) => (s.id === result.id ? result : s)));
        }
      } catch {
        showToast("error", "Failed to toggle schedule.");
      }
    },
    [guildId, showToast],
  );

  const handleDelete = useCallback(
    async (schedule: Schedule) => {
      if (!confirm(`Delete schedule "${schedule.name}"?`)) return;
      try {
        const success = await deleteSchedule({
          data: { guildId, scheduleId: schedule.id },
        });
        if (success) {
          setSchedulesList((prev) => prev.filter((s) => s.id !== schedule.id));
          showToast("success", "Schedule deleted.");
        } else {
          showToast("error", "Failed to delete schedule.");
        }
      } catch {
        showToast("error", "An unexpected error occurred.");
      }
    },
    [guildId, showToast],
  );

  if (mode.type !== "list") {
    return (
      <AuthGuard guildId={guildId}>
        <div className="hq-shell">
          <div className="mb-6">
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={handleBack}>
              <ChevronLeft size={14} />
              Back to schedules
            </Button>
          </div>

          <div className="hq-header">
            <div>
              <h1 className="hq-title">
                {mode.type === "create" ? "Create Schedule" : "Edit Schedule"}
              </h1>
              <p className="hq-subtitle">
                {mode.type === "create"
                  ? "Set up a new auto-tournament schedule."
                  : `Editing "${mode.schedule.name}".`}
              </p>
            </div>
          </div>

          {toast && (
            <div
              className={`mt-6 flex items-center gap-2 rounded border px-4 py-3 text-sm ${
                toast.type === "success"
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {toast.message}
            </div>
          )}

          <div className="mt-6 grid gap-6">
            <Card className="hq-card">
              <CardHeader>
                <CardTitle>Schedule Details</CardTitle>
                <CardDescription>Configure the tournament schedule.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <div className="grid gap-2">
                  <label className="filter-label">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="e.g. Weekly Scrims"
                    className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="filter-label">Format</label>
                  <Select
                    value={form.format}
                    onValueChange={(v) => updateField("format", v as "single" | "double")}
                  >
                    <SelectTrigger className="hq-select w-full">
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single Elimination</SelectItem>
                      <SelectItem value="double">Double Elimination</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <label className="filter-label">Team Cap</label>
                  <input
                    type="number"
                    min={2}
                    value={form.teamCap}
                    onChange={(e) => updateField("teamCap", Number(e.target.value))}
                    className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="filter-label">Frequency</label>
                  <Select
                    value={form.frequency}
                    onValueChange={(v) => updateField("frequency", v as FrequencyType)}
                  >
                    <SelectTrigger className="hq-select w-full">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.frequency === "weekly" && (
                  <div className="grid gap-2">
                    <label className="filter-label">Day of Week</label>
                    <Select
                      value={String(form.day)}
                      onValueChange={(v) => updateField("day", Number(v))}
                    >
                      <SelectTrigger className="hq-select w-full">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Sunday</SelectItem>
                        <SelectItem value="1">Monday</SelectItem>
                        <SelectItem value="2">Tuesday</SelectItem>
                        <SelectItem value="3">Wednesday</SelectItem>
                        <SelectItem value="4">Thursday</SelectItem>
                        <SelectItem value="5">Friday</SelectItem>
                        <SelectItem value="6">Saturday</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {form.frequency === "monthly" && (
                  <div className="grid gap-2">
                    <label className="filter-label">Day of Month</label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={form.day}
                      onChange={(e) => updateField("day", Number(e.target.value))}
                      className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <label className="filter-label">Time</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => updateField("time", e.target.value)}
                    className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="filter-label">Channel ID</label>
                  <input
                    type="text"
                    value={form.channelId}
                    onChange={(e) => updateField("channelId", e.target.value)}
                    placeholder="Discord channel ID"
                    className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="filter-label">Role to Ping (optional)</label>
                  <input
                    type="text"
                    value={form.roleId}
                    onChange={(e) => updateField("roleId", e.target.value)}
                    placeholder="Discord role ID"
                    className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-md border border-white/8 bg-white/4 px-4 py-3 transition-colors hover:bg-white/6">
                  <span className="text-sm">Enabled</span>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => updateField("enabled", e.target.checked)}
                    className="size-4 accent-white"
                  />
                </label>
              </CardContent>
            </Card>

            <Card className="hq-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock size={16} />
                  Next Scheduled Dates
                </CardTitle>
                <CardDescription>
                  The next {nextOccurrences.length} tournaments based on this schedule.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {nextOccurrences.length === 0 ? (
                  <p className="text-sm text-white/50">No upcoming dates.</p>
                ) : (
                  <div className="space-y-2">
                    {nextOccurrences.map((date, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded border border-white/10 bg-depth-2 px-3 py-2 text-sm"
                      >
                        <CalendarDays size={14} className="text-white/50" />
                        <span>{formatDate(date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button className="hq-button" onClick={handleSave} disabled={isSaving}>
                {isSaving
                  ? "Saving..."
                  : mode.type === "create"
                    ? "Create Schedule"
                    : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                className="hq-button"
                onClick={handleBack}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <div className="hq-header">
          <div>
            <h1 className="hq-title">Auto-Tournament Schedules</h1>
            <p className="hq-subtitle">Configure recurring tournament schedules for this server.</p>
          </div>
          <div className="hq-actions">
            <Button className="hq-button" onClick={handleStartCreate}>
              <Plus size={14} />
              New Schedule
            </Button>
          </div>
        </div>

        {toast && (
          <div
            className={`mt-6 flex items-center gap-2 rounded border px-4 py-3 text-sm ${
              toast.type === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {toast.message}
          </div>
        )}

        <Card className="hq-card mt-6">
          <CardHeader>
            <CardTitle className="text-base">Schedules</CardTitle>
            <CardDescription>
              {schedulesList.length === 0
                ? "No schedules configured."
                : `Showing ${schedulesList.length} schedule${schedulesList.length === 1 ? "" : "s"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedulesList.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{formatFormatLabel(s.format)}</TableCell>
                    <TableCell>{s.teamCap}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-white/70">
                        <Clock size={12} />
                        <span className="text-sm">{formatFrequencyLabel(s.cronExpression)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs text-white/60">{s.channelId}</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.enabled ? "default" : "outline"}
                        className="hq-badge cursor-pointer"
                        onClick={() => handleToggleEnabled(s)}
                      >
                        {s.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleStartEdit(s)}
                        >
                          <Pencil size={14} />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-red-400 hover:text-red-300"
                          onClick={() => handleDelete(s)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {schedulesList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-white/50">
                      No schedules yet. Click "New Schedule" to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AuthGuard>
  );
}

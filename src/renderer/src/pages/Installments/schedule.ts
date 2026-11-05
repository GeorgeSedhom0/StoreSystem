// ─── Installment schedule ────────────────────────────────────────────────────
//
// One rule for the whole installments UI (list, cards, pay screen):
//   installment size = (bill total − down payment) ÷ number of installments
//   installment k is due at  bill time + k × interval days
//   payments (the flow) pay installments off in order.
// The next due installment is the first one not fully paid; the plan is late
// when that date has passed and money is still owed. Amounts are exactly the
// ones the pay screen always used — this only shows them as a schedule.

const DAY = 24 * 60 * 60 * 1000;
const EPS = 0.005;

export interface ScheduleInput {
  total: number;
  paid: number; // down payment
  time: string; // bill time
  installments_count: number;
  installment_interval: number;
  flow: { amount: number }[];
  ended?: boolean;
}

export type RowState = "paid" | "partial" | "late" | "due" | "upcoming";

export interface ScheduleRow {
  n: number;
  due: Date;
  amount: number;
  paid: number;
  state: RowState;
}

export interface Schedule {
  total: number;
  deposit: number;
  flowPaid: number;
  totalPaid: number;
  remaining: number;
  size: number;
  count: number;
  paidCount: number;
  nextDue: Date | null;
  nextAmount: number;
  status: "completed" | "overdue" | "active";
  /** Whole days late (overdue) or until the next due date (active). */
  daysLate: number;
  daysUntil: number;
  rows: ScheduleRow[];
}

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const dayDiff = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY);

export const scheduleOf = (
  inst: ScheduleInput,
  now: Date = new Date(),
): Schedule => {
  const total = Math.abs(inst.total || 0);
  const deposit = inst.paid || 0;
  const flowPaid = (inst.flow || []).reduce((a, f) => a + (f.amount || 0), 0);
  const totalPaid = deposit + flowPaid;
  const remaining = Math.max(0, total - totalPaid);
  const count = Math.max(1, inst.installments_count || 1);
  const interval = Math.max(0, inst.installment_interval || 0);
  const size = (total - deposit) / count;
  const start = new Date(inst.time);

  const rows: ScheduleRow[] = [];
  let paidCount = 0;
  for (let n = 1; n <= count; n++) {
    const due = new Date(start.getTime() + interval * DAY * n);
    const paid =
      size > 0 ? Math.min(size, Math.max(0, flowPaid - (n - 1) * size)) : 0;
    let state: RowState;
    if (size <= 0 || paid >= size - EPS) {
      state = "paid";
      paidCount++;
    } else if (now > due) state = "late";
    else if (paid > EPS) state = "partial";
    else state = "upcoming";
    rows.push({ n, due, amount: size, paid, state });
  }
  // The first not-fully-paid installment that isn't late yet is "due".
  const firstOpen = rows.find((r) => r.state !== "paid");
  if (firstOpen && firstOpen.state !== "late") firstOpen.state = "due";

  const completed = !!inst.ended || remaining <= EPS;
  const nextDue = completed || !firstOpen ? null : firstOpen.due;
  const nextAmount =
    completed || !firstOpen
      ? 0
      : Math.min(firstOpen.amount - firstOpen.paid, remaining);
  const overdue = !completed && nextDue !== null && now > nextDue;

  return {
    total,
    deposit,
    flowPaid,
    totalPaid,
    remaining,
    size,
    count,
    paidCount,
    nextDue,
    nextAmount,
    status: completed ? "completed" : overdue ? "overdue" : "active",
    daysLate: overdue && nextDue ? Math.max(1, dayDiff(now, nextDue)) : 0,
    daysUntil: !overdue && nextDue ? Math.max(0, dayDiff(nextDue, now)) : 0,
    rows,
  };
};

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export const fmtShortDate = (d: Date) =>
  d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });

/** Arabic day count: "يوم" / "يومين" / "3 أيام" / "15 يوماً". */
export const dayCount = (n: number) =>
  n <= 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوماً`;

/** "اليوم" / "غداً" / "بعد 3 أيام" */
export const inDays = (n: number) =>
  n <= 0 ? "اليوم" : n === 1 ? "غداً" : `بعد ${dayCount(n)}`;

/** "منذ يوم" / "منذ يومين" / "منذ 5 أيام" */
export const daysAgo = (n: number) => `منذ ${dayCount(n)}`;

/** Egyptian mobile → international digits for wa.me / tel: ("010…" → "2010…"). */
export const intlPhone = (phone?: string | null): string | null => {
  const d = (phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!d) return null;
  if (/^01\d{9}$/.test(d)) return "2" + d;
  if (/^201\d{9}$/.test(d)) return d;
  if (/^00\d{8,}$/.test(d)) return d.slice(2);
  return d.length >= 8 ? d : null;
};

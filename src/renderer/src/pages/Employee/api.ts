import axios from "axios";
import { useContext } from "react";
import {
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { StoreContext } from "@renderer/StoreDataProvider";
import {
  AttendanceDayInput,
  AttendanceRecord,
  AttendanceSettings,
  AttendanceStatus,
  Employee,
  EmployeePayload,
  SalaryPayment,
  SalaryPreview,
} from "./types";

export const DEFAULT_SETTINGS: AttendanceSettings = {
  unmarked_as: "present",
  day_rate_basis: "calendar30",
  late_deduction: false,
  late_grace_minutes: 15,
  overtime_pay: false,
  overtime_multiplier: 1.5,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const useEmployees = () => {
  const { storeId } = useContext(StoreContext);
  return useQuery({
    queryKey: ["employees", storeId],
    queryFn: async () => {
      const { data } = await axios.get<Employee[]>("/employees", {
        params: { store_id: storeId },
      });
      return data;
    },
  });
};

export const useAttendance = (start: string, end: string, enabled = true) => {
  const { storeId } = useContext(StoreContext);
  return useQuery({
    queryKey: ["attendance", storeId, start, end],
    queryFn: async () => {
      const { data } = await axios.get<AttendanceRecord[]>("/attendance", {
        params: { store_id: storeId, start, end },
      });
      return data;
    },
    enabled,
  });
};

export const useAttendanceSettings = () => {
  const { storeId } = useContext(StoreContext);
  return useQuery({
    queryKey: ["attendanceSettings", storeId],
    queryFn: async () => {
      const { data } = await axios.get<AttendanceSettings>(
        "/attendance/settings",
        { params: { store_id: storeId } },
      );
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useSaveAttendanceSettings = () => {
  const { storeId } = useContext(StoreContext);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: AttendanceSettings) => {
      const { data } = await axios.put<AttendanceSettings>(
        "/attendance/settings",
        s,
        { params: { store_id: storeId } },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["attendanceSettings", storeId], data);
      qc.invalidateQueries({ queryKey: ["salaryPreview"] });
    },
  });
};

export const useSalaryPreview = (
  employeeId: number | null | undefined,
  start: string | null,
  end: string | null,
) => {
  const { storeId } = useContext(StoreContext);
  return useQuery({
    queryKey: ["salaryPreview", storeId, employeeId, start, end],
    queryFn: async () => {
      const { data } = await axios.get<SalaryPreview>(
        `/employees/${employeeId}/salary-preview`,
        { params: { store_id: storeId, start, end } },
      );
      return data;
    },
    enabled: !!employeeId && !!start && !!end && start <= end,
    placeholderData: (prev) => prev,
  });
};

export const useSalaries = (employeeId: number | "" = "") => {
  const { storeId } = useContext(StoreContext);
  return useQuery({
    queryKey: ["salaries", storeId, employeeId],
    queryFn: async () => {
      const { data } = await axios.get<SalaryPayment[]>("/salaries", {
        params: {
          store_id: storeId,
          employee_id: employeeId === "" ? undefined : employeeId,
        },
      });
      return data;
    },
  });
};

// ---------------------------------------------------------------------------
// Employee mutations
// ---------------------------------------------------------------------------

export const useSaveEmployee = () => {
  const { storeId } = useContext(StoreContext);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number | null;
      payload: Partial<EmployeePayload>;
    }) => {
      if (id) {
        await axios.put(`/employees/${id}`, payload, {
          params: { store_id: storeId },
        });
      } else {
        await axios.post("/employees", payload, {
          params: { store_id: storeId },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", storeId] });
      qc.invalidateQueries({ queryKey: ["salaryPreview"] });
    },
  });
};

export const useEndEmployment = () => {
  const { storeId } = useContext(StoreContext);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`/employees/${id}`, { params: { store_id: storeId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", storeId] });
    },
  });
};

// ---------------------------------------------------------------------------
// Attendance mutations (optimistic)
// ---------------------------------------------------------------------------

const SAVE_KEY = ["attendance-save"];

type Snapshot = [QueryKey, AttendanceRecord[] | undefined][];

/** Apply ``fn`` to every cached attendance list whose range contains ``day``. */
const patchCaches = (
  qc: ReturnType<typeof useQueryClient>,
  storeId: number,
  days: string[],
  fn: (list: AttendanceRecord[]) => AttendanceRecord[],
): Snapshot => {
  const entries = qc.getQueriesData<AttendanceRecord[]>({
    queryKey: ["attendance", storeId],
  });
  const snapshot: Snapshot = [];
  for (const [key, data] of entries) {
    const [, , start, end] = key as [string, number, string, string];
    if (!data || !days.some((d) => d >= start && d <= end)) continue;
    snapshot.push([key, data]);
    qc.setQueryData<AttendanceRecord[]>(key, fn(data));
  }
  return snapshot;
};

const upsertIn = (list: AttendanceRecord[], rec: AttendanceRecord | null, employeeId: number, day: string) => {
  const rest = list.filter((r) => !(r.employee_id === employeeId && r.day === day));
  return rec ? [...rest, rec] : rest;
};

/** Combine a 'HH:MM' with a day into a local timestamp for the cache. */
const asStamp = (day: string, v: string | null) =>
  !v ? null : v.length <= 5 ? `${day}T${v}:00` : v.replace(" ", "T");

export const useSaveAttendanceDay = () => {
  const { storeId } = useContext(StoreContext);
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SAVE_KEY,
    mutationFn: async (input: AttendanceDayInput) => {
      const { data } = await axios.put<{
        deleted: boolean;
        record: AttendanceRecord | null;
      }>("/attendance", input, { params: { store_id: storeId } });
      return data;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["attendance", storeId] });
      const cleared =
        !input.status && !input.check_in && !input.check_out && !input.note;
      const status: AttendanceStatus = input.status ?? "present";
      const keepTimes = status === "present" || status === "half";
      const optimistic: AttendanceRecord | null = cleared
        ? null
        : {
            employee_id: input.employee_id,
            day: input.day,
            status,
            check_in: keepTimes ? asStamp(input.day, input.check_in) : null,
            check_out: keepTimes ? asStamp(input.day, input.check_out) : null,
            note: input.note,
          };
      const snapshot = patchCaches(qc, storeId, [input.day], (l) =>
        upsertIn(l, optimistic, input.employee_id, input.day),
      );
      return { snapshot };
    },
    onSuccess: (data, input) => {
      patchCaches(qc, storeId, [input.day], (l) =>
        upsertIn(l, data.record, input.employee_id, input.day),
      );
    },
    onError: (_err, _input, ctx) => {
      ctx?.snapshot.forEach(([key, data]) =>
        qc.setQueryData<AttendanceRecord[] | undefined>(key, data),
      );
    },
    onSettled: () => {
      // Refetch only once the last in-flight save is done, so rapid taps on
      // several rows don't flicker back to stale server data.
      if (qc.isMutating({ mutationKey: SAVE_KEY }) <= 1) {
        qc.invalidateQueries({ queryKey: ["attendance", storeId] });
        qc.invalidateQueries({ queryKey: ["salaryPreview"] });
      }
    },
  });
};

export const useBulkAttendance = () => {
  const { storeId } = useContext(StoreContext);
  const qc = useQueryClient();
  return useMutation({
    mutationKey: SAVE_KEY,
    mutationFn: async (input: {
      day: string;
      employee_ids: number[];
      status: AttendanceStatus;
    }) => {
      const { data } = await axios.post<{
        count: number;
        records: AttendanceRecord[];
      }>("/attendance/bulk", { ...input, store_id: storeId });
      return data;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["attendance", storeId] });
      const snapshot = patchCaches(qc, storeId, [input.day], (l) => {
        const marked = new Set(
          l.filter((r) => r.day === input.day).map((r) => r.employee_id),
        );
        const added = input.employee_ids
          .filter((id) => !marked.has(id))
          .map<AttendanceRecord>((id) => ({
            employee_id: id,
            day: input.day,
            status: input.status,
            check_in: null,
            check_out: null,
            note: null,
          }));
        return [...l, ...added];
      });
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      ctx?.snapshot.forEach(([key, data]) =>
        qc.setQueryData<AttendanceRecord[] | undefined>(key, data),
      );
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: SAVE_KEY }) <= 1) {
        qc.invalidateQueries({ queryKey: ["attendance", storeId] });
        qc.invalidateQueries({ queryKey: ["salaryPreview"] });
      }
    },
  });
};

// ---------------------------------------------------------------------------
// Salary payment
// ---------------------------------------------------------------------------

export const usePaySalary = () => {
  const { storeId } = useContext(StoreContext);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      employeeId: number;
      amount: number;
      bonus: number;
      deductions: number;
      time: string;
      paymentMethodId: number | "";
      periodStart: string;
      periodEnd: string;
      details: unknown;
      note: string;
    }) => {
      const fd = new FormData();
      fd.append("amount", String(p.amount));
      fd.append("bonus", String(p.bonus));
      fd.append("deductions", String(p.deductions));
      fd.append("time", p.time);
      if (p.paymentMethodId !== "")
        fd.append("payment_method_id", String(p.paymentMethodId));
      fd.append("period_start", p.periodStart);
      fd.append("period_end", p.periodEnd);
      fd.append("details", JSON.stringify(p.details));
      if (p.note.trim()) fd.append("note", p.note.trim());
      fd.append("store_id", String(storeId));
      await axios.post(`/employees/${p.employeeId}/pay-salary`, fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees", storeId] });
      qc.invalidateQueries({ queryKey: ["salaries", storeId] });
      qc.invalidateQueries({ queryKey: ["salaryPreview"] });
    },
  });
};

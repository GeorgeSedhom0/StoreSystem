/** The server's message for a failed request (FastAPI `detail`), else a
 * fallback. Validation errors (422) come back as a list; show the first. */
export const apiError = (e: unknown, fallback = "حدث خطأ ما"): string => {
  const detail = (e as any)?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    // Some handlers re-wrap an HTTPException as "400: message".
    return detail.replace(/^\d{3}:\s*/, "");
  }
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  if ((e as any)?.code === "ERR_NETWORK") return "تعذر الاتصال بالخادم";
  return fallback;
};

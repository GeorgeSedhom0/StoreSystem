import { useState, useMemo } from "react";
import { Installment } from "../Installments";

interface FilterState {
  searchTerm: string;
  statusFilter: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  showEnded: boolean;
}

const useInstallmentFilters = (
  data: Installment[],
  getTotalPaid: (installment: Installment) => number,
  getTotalRemaining: (installment: Installment) => number,
  getPaymentProgress: (installment: Installment) => number,
  getInstallmentStatus: (installment: Installment) => string,
) => {
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: "",
    statusFilter: "all",
    sortBy: "time",
    sortOrder: "desc",
    showEnded: false,
  });

  const filteredAndSortedData = useMemo(() => {
    let filteredData = data
      .map((installment) => ({
        ...installment,
        flow: installment.flow.filter((flow) => flow.id),
      }))
      .filter((installment) => {
        // Show ended filter
        if (!filters.showEnded && installment.ended) return false;

        // Search filter
        if (filters.searchTerm) {
          const searchLower = filters.searchTerm.toLowerCase();
          const partyName = (installment.party_name || "").toLowerCase();
          const installmentId = installment.id.toString();

          if (
            !partyName.includes(searchLower) &&
            !installmentId.includes(searchLower)
          ) {
            return false;
          }
        }

        // Status filter
        if (filters.statusFilter !== "all") {
          const status = getInstallmentStatus(installment);
          if (filters.statusFilter === "unknown" && installment.party_name)
            return false;
          if (
            filters.statusFilter !== "unknown" &&
            filters.statusFilter !== status
          )
            return false;
        }

        return true;
      });

    // Sorting
    filteredData.sort((a, b) => {
      let aVal, bVal;

      switch (filters.sortBy) {
        case "time":
          aVal = new Date(a.time).getTime();
          bVal = new Date(b.time).getTime();
          break;
        case "total":
          aVal = Math.abs(a.total);
          bVal = Math.abs(b.total);
          break;
        case "remaining":
          aVal = getTotalRemaining(a);
          bVal = getTotalRemaining(b);
          break;
        case "party":
          aVal = (a.party_name || "").toLowerCase();
          bVal = (b.party_name || "").toLowerCase();
          break;
        case "progress":
          aVal = getPaymentProgress(a);
          bVal = getPaymentProgress(b);
          break;
        default:
          return 0;
      }

      const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return filters.sortOrder === "asc" ? result : -result;
    });

    return filteredData;
  }, [
    data,
    filters,
    getTotalPaid,
    getTotalRemaining,
    getPaymentProgress,
    getInstallmentStatus,
  ]);

  const summaryStats = useMemo(
    () => ({
      totalBills: filteredAndSortedData.reduce(
        (sum, inst) => sum + Math.abs(inst.total),
        0,
      ),
      totalPaid: filteredAndSortedData.reduce(
        (sum, inst) => sum + getTotalPaid(inst),
        0,
      ),
      totalRemaining: filteredAndSortedData.reduce(
        (sum, inst) => sum + getTotalRemaining(inst),
        0,
      ),
      overdueCount: filteredAndSortedData.filter(
        (inst) => getInstallmentStatus(inst) === "overdue",
      ).length,
      completedCount: filteredAndSortedData.filter(
        (inst) => getInstallmentStatus(inst) === "completed",
      ).length,
      unknownParties: filteredAndSortedData.filter((inst) => !inst.party_name)
        .length,
    }),
    [
      filteredAndSortedData,
      getTotalPaid,
      getTotalRemaining,
      getInstallmentStatus,
    ],
  );

  const updateFilter = (key: keyof FilterState, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      searchTerm: "",
      statusFilter: "all",
      sortBy: "time",
      sortOrder: "desc",
      showEnded: false,
    });
  };

  return {
    filters,
    filteredAndSortedData,
    summaryStats,
    updateFilter,
    resetFilters,
  };
};

export default useInstallmentFilters;

import {
  Alert,
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ReactNode } from "react";
import { BillSnapshot, CorrectionResult, billTypeLabels, egp } from "../types";

const Delta = ({ before, after, money = true }: { before: number; after: number; money?: boolean }) => {
  const d = after - before;
  const fmt = (v: number) => (money ? egp(v) : v.toLocaleString("ar-EG"));
  return (
    <>
      <TableCell>{fmt(before)}</TableCell>
      <TableCell>{fmt(after)}</TableCell>
      <TableCell sx={{ color: d > 0 ? "success.main" : d < 0 ? "error.main" : undefined, fontWeight: 600 }}>
        {d > 0 ? "+" : ""}
        {fmt(d)}
      </TableCell>
    </>
  );
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
      {title}
    </Typography>
    {children}
  </Box>
);

const SmallTable = ({ head, children }: { head: string[]; children: ReactNode }) => (
  <Table size="small">
    <TableHead>
      <TableRow>
        {head.map((h) => (
          <TableCell key={h}>{h}</TableCell>
        ))}
      </TableRow>
    </TableHead>
    <TableBody>{children}</TableBody>
  </Table>
);

const BillDiff = ({ before, after }: { before: BillSnapshot; after?: BillSnapshot }) => (
  <Box>
    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
      فاتورة #{before.bill_id} — {billTypeLabels[before.type] ?? before.type} (متجر {before.store_id})
      {!after && <Chip size="small" color="error" label="ستُحذف" sx={{ mx: 1 }} />}
    </Typography>
    <SmallTable head={["", "قبل", "بعد", "الفرق"]}>
      <TableRow>
        <TableCell>الإجمالي</TableCell>
        <Delta before={Math.abs(before.total)} after={Math.abs(after?.total ?? 0)} />
      </TableRow>
      <TableRow>
        <TableCell>الخصم</TableCell>
        <Delta before={before.discount} after={after?.discount ?? 0} />
      </TableRow>
      {after && after.party_id !== before.party_id && (
        <TableRow>
          <TableCell>الطرف الثاني</TableCell>
          <TableCell>{before.party_name ?? "بدون"}</TableCell>
          <TableCell>{after.party_name ?? "بدون"}</TableCell>
          <TableCell />
        </TableRow>
      )}
    </SmallTable>
  </Box>
);

const ImpactView = ({ result }: { result: CorrectionResult }) => {
  const { impact } = result;
  const nothing =
    !impact.cash.length &&
    !impact.accounts.length &&
    !impact.interstore.length &&
    !impact.stock.length &&
    !impact.cascade.done.length &&
    !impact.cascade.price_updates.length &&
    result.before.every((b) => {
      const a = result.after.find((x) => x.store_id === b.store_id && x.bill_id === b.bill_id);
      return a && JSON.stringify(a.lines) === JSON.stringify(b.lines) && a.total === b.total;
    });

  return (
    <Stack spacing={3}>
      {impact.warnings.map((w, i) => (
        <Alert key={i} severity="warning">
          {w.text}
          {w.kind === "legacy_transfer" && (
            <Box sx={{ mt: 0.5 }}>
              {w.bills.map((b) => (
                <Chip
                  key={`${b.store_id}-${b.id}`}
                  size="small"
                  label={`متجر ${b.store_id} — فاتورة #${b.id}`}
                  sx={{ mr: 0.5 }}
                />
              ))}
            </Box>
          )}
          {w.kind === "cascade_skipped" && (
            <Box sx={{ mt: 0.5 }}>
              {w.bills.map((b, j) => (
                <Chip key={j} size="small" label={`متجر ${b.store_id} — فاتورة #${b.bill_id}`} sx={{ mr: 0.5 }} />
              ))}
            </Box>
          )}
        </Alert>
      ))}

      {nothing && <Alert severity="info">لا يوجد أي تغيير.</Alert>}

      <Section title="الفواتير">
        <Stack spacing={2}>
          {result.before.map((b) => (
            <BillDiff
              key={`${b.store_id}-${b.bill_id}`}
              before={b}
              after={result.after.find((a) => a.store_id === b.store_id && a.bill_id === b.bill_id)}
            />
          ))}
        </Stack>
      </Section>

      {impact.stock.length > 0 && (
        <Section title="المخزون">
          <SmallTable head={["المتجر", "المنتج", "قبل", "بعد", "الفرق"]}>
            {impact.stock.map((s) => (
              <TableRow key={`${s.store_id}-${s.product_id}`}>
                <TableCell>{s.store_name}</TableCell>
                <TableCell>{s.name}</TableCell>
                <Delta before={s.before} after={s.after} money={false} />
              </TableRow>
            ))}
          </SmallTable>
        </Section>
      )}

      {impact.cash.length > 0 && (
        <Section title="النقدية (رصيد الحركات المالية)">
          <SmallTable head={["المتجر", "قبل", "بعد", "الفرق"]}>
            {impact.cash.map((c) => (
              <TableRow key={c.store_id}>
                <TableCell>{c.store_name}</TableCell>
                <Delta before={c.before} after={c.after} />
              </TableRow>
            ))}
          </SmallTable>
        </Section>
      )}

      {impact.accounts.length > 0 && (
        <Section title="الحسابات">
          <SmallTable head={["المتجر", "الحساب", "قبل", "بعد", "الفرق"]}>
            {impact.accounts.map((a) => (
              <TableRow key={`${a.store_id}-${a.method_id}`}>
                <TableCell>{a.store_name}</TableCell>
                <TableCell>{a.method_name}</TableCell>
                <Delta before={a.before} after={a.after} />
              </TableRow>
            ))}
          </SmallTable>
        </Section>
      )}

      {impact.interstore.length > 0 && (
        <Section title="الأرصدة بين المتاجر">
          <SmallTable head={["المتجر", "مع", "قبل", "بعد", "الفرق"]}>
            {impact.interstore.map((r) => (
              <TableRow key={`${r.store_id}-${r.other_store_id}`}>
                <TableCell>{r.store_name}</TableCell>
                <TableCell>{r.other_store_name}</TableCell>
                <Delta before={r.before} after={r.after} />
              </TableRow>
            ))}
          </SmallTable>
        </Section>
      )}

      {(impact.cascade.done.length > 0 || impact.cascade.price_updates.length > 0) && (
        <Section title="تصحيح التكلفة في الفواتير اللاحقة">
          <SmallTable head={["المنتج", "التكلفة القديمة", "التكلفة الجديدة", "سطور معدلة", "حتى"]}>
            {impact.cascade.done.map((d) => (
              <TableRow key={`${d.product_id}-${d.old_cost}`}>
                <TableCell>{d.name ?? `#${d.product_id}`}</TableCell>
                <TableCell>{egp(d.old_cost)}</TableCell>
                <TableCell>{egp(d.new_cost)}</TableCell>
                <TableCell>{d.rows.length}</TableCell>
                <TableCell>{d.until ? new Date(d.until).toLocaleString("ar-EG") : "الآن"}</TableCell>
              </TableRow>
            ))}
          </SmallTable>
          {impact.cascade.price_updates.map((p) => (
            <Typography key={p.product_id} variant="body2" sx={{ mt: 1 }}>
              السعر الحالي للمنتج {p.name ?? `#${p.product_id}`}: التكلفة {egp(p.old_cost)} ← {egp(p.new_cost)}، البيع {egp(p.old_price)} ←{" "}
              {egp(p.new_price)}
            </Typography>
          ))}
        </Section>
      )}
    </Stack>
  );
};

export default ImpactView;

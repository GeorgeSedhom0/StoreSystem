import { Button, DialogActions } from "@mui/material";
import { Bill } from "./types";
import { forwardRef, useContext } from "react";
import { StoreContext } from "../../StoreDataProvider";
import {
  BILL_TYPE_LABELS,
  useBillPrintMessages,
} from "../Shared/hooks/useBillFooterMessages";
import {
  useBillLogo,
  useBillLogoAppearance,
} from "../Shared/hooks/useBillLogo";

const BillView = forwardRef(
  (
    {
      bill,
      open,
      setOpen,
    }: {
      bill: Bill | null;
      open: boolean;
      setOpen: (open: boolean) => void;
    },
    ref: any,
  ) => {
    const { store, storeId } = useContext(StoreContext);
    const { logo } = useBillLogo(storeId);
    const { appearance } = useBillLogoAppearance(storeId);
    const { bodyMessages, footerMessages } = useBillPrintMessages(storeId);

    if (!bill) return null;

    const billTypeKey = (bill.type in BILL_TYPE_LABELS ? bill.type : null) as
      | keyof typeof BILL_TYPE_LABELS
      | null;

    const productsTotal = bill.products.reduce(
      (acc, product) => acc + Math.abs(product.amount) * product.price,
      0,
    );
    const grossTotal = productsTotal;
    const netTotal = Math.max(grossTotal - Math.abs(bill.discount), 0);
    const installmentDetails = bill.installment_details;
    const installmentTotalPaid = installmentDetails?.total_paid || 0;
    const installmentRemaining = Math.max(netTotal - installmentTotalPaid, 0);
    const bodyMessage = billTypeKey ? bodyMessages[billTypeKey].trim() : "";
    const footerMessage = billTypeKey ? footerMessages[billTypeKey].trim() : "";

    const renderBodyMessage = (message: string, marginTop = "0.75rem") =>
      message ? (
        <div style={{ width: "100%" }}>
          <h5
            style={{
              textAlign: "center",
              fontSize: "1rem",
              margin: `${marginTop} 0 0.15rem`,
            }}
          >
            {message}
          </h5>
        </div>
      ) : null;

    const renderDefaultTotals = () => (
      <div style={{ width: "100%" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <tbody>
            <tr
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.20)",
                color: "black",
              }}
            >
              <td
                style={{
                  fontSize: "1.5em",
                  textAlign: "center",
                  padding: "12px",
                }}
              >
                الاجمالى
              </td>
              <td
                style={{
                  fontSize: "1.5em",
                  textAlign: "center",
                  padding: "12px",
                }}
              >
                {Math.abs(bill.total) + Math.abs(bill.discount)}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  fontSize: "1.5em",
                  textAlign: "center",
                  padding: "12px",
                }}
              >
                الخصم
              </td>
              <td
                style={{
                  fontSize: "1.5em",
                  textAlign: "center",
                  padding: "12px",
                }}
              >
                {bill.discount}
              </td>
            </tr>
            <tr
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.20)",
                color: "black",
              }}
            >
              <td
                style={{
                  fontSize: "1.5em",
                  textAlign: "center",
                  padding: "12px",
                }}
              >
                الصافى
              </td>
              <td
                style={{
                  fontSize: "1.5em",
                  textAlign: "center",
                  padding: "12px",
                }}
              >
                {Math.abs(bill.total)}
              </td>
            </tr>
          </tbody>
        </table>

        {renderBodyMessage(bodyMessage)}
      </div>
    );

    const renderBnplSection = () => (
      <div style={{ width: "100%" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <tbody>
            <tr
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.20)",
                color: "black",
              }}
            >
              <td
                style={{
                  fontSize: "1.35em",
                  textAlign: "center",
                  padding: "10px",
                }}
              >
                إجمالي المنتجات
              </td>
              <td
                style={{
                  fontSize: "1.35em",
                  textAlign: "center",
                  padding: "10px",
                }}
              >
                {grossTotal}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  fontSize: "1.35em",
                  textAlign: "center",
                  padding: "10px",
                }}
              >
                الخصم
              </td>
              <td
                style={{
                  fontSize: "1.35em",
                  textAlign: "center",
                  padding: "10px",
                }}
              >
                {bill.discount}
              </td>
            </tr>
            <tr
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.20)",
                color: "black",
              }}
            >
              <td
                style={{
                  fontSize: "1.35em",
                  textAlign: "center",
                  padding: "10px",
                }}
              >
                المطلوب سداده
              </td>
              <td
                style={{
                  fontSize: "1.35em",
                  textAlign: "center",
                  padding: "10px",
                }}
              >
                {netTotal}
              </td>
            </tr>
          </tbody>
        </table>

        {renderBodyMessage(bodyMessage)}
      </div>
    );

    const renderReserveSection = () => (
      <div style={{ width: "100%" }}>{renderDefaultTotals()}</div>
    );

    const renderInstallmentSection = () => (
      <div style={{ width: "100%" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <tbody>
            <tr
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.20)",
                color: "black",
              }}
            >
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                إجمالي الفاتورة
              </td>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                {netTotal}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                المقدم
              </td>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                {installmentDetails?.paid || 0}
              </td>
            </tr>
            <tr
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.20)",
                color: "black",
              }}
            >
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                إجمالي المسدد
              </td>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                {installmentTotalPaid}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                المتبقي
              </td>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                {installmentRemaining}
              </td>
            </tr>
            <tr
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.20)",
                color: "black",
              }}
            >
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                عدد الأقساط
              </td>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                {installmentDetails?.installments_count || "-"}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                الفاصل بين الأقساط
              </td>
              <td
                style={{
                  fontSize: "1.2em",
                  textAlign: "center",
                  padding: "9px",
                }}
              >
                {installmentDetails?.installment_interval
                  ? `${installmentDetails.installment_interval} يوم`
                  : "-"}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ width: "100%", marginTop: "0.6rem" }}>
          <h6
            style={{
              textAlign: "center",
              fontSize: "1rem",
              margin: "0.15rem 0 0.5rem",
            }}
          >
            سجل الدفعات
          </h6>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: "rgba(0, 0, 0, 1)",
                  color: "white",
                }}
              >
                <th
                  style={{
                    fontSize: "1.1em",
                    textAlign: "center",
                    padding: "4px",
                    width: "60%",
                  }}
                >
                  التاريخ
                </th>
                <th
                  style={{
                    fontSize: "1.1em",
                    textAlign: "center",
                    padding: "4px",
                    width: "40%",
                  }}
                >
                  المبلغ
                </th>
              </tr>
            </thead>
            <tbody>
              {installmentDetails?.flow?.length ? (
                installmentDetails.flow.map((payment) => (
                  <tr key={payment.id}>
                    <td
                      style={{
                        fontSize: "1.1em",
                        textAlign: "center",
                        padding: "4px",
                      }}
                    >
                      {new Date(payment.time).toLocaleString("ar-EG")}
                    </td>
                    <td
                      style={{
                        fontSize: "1.1em",
                        textAlign: "center",
                        padding: "4px",
                      }}
                    >
                      {payment.amount}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={2}
                    style={{
                      fontSize: "1.1em",
                      textAlign: "center",
                      padding: "6px",
                    }}
                  >
                    لا توجد دفعات مسجلة بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {renderBodyMessage(bodyMessage, "0.9rem")}
      </div>
    );

    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          overflowY: "auto",
          height: "100vh",
          padding: "1rem",
          display: open ? "flex" : "none",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "nowrap",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 9999999999999,
        }}
      >
        <div
          ref={ref}
          style={{
            width: open ? "120mm" : "98%",
            marginLeft: open ? "0" : "1%",
            marginRight: open ? "0" : "1%",
            flexDirection: "column",
            direction: "rtl",
            backgroundColor: "white",
            color: "black",
            fontSize: "10px",
            overflow: "hidden",
            maxWidth: "100%",
          }}
          id={`bill-${bill.id}`}
        >
          {logo?.dataUrl && (
            <div
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                padding: `0.75rem 0 ${appearance.spacingBottom}px`,
              }}
            >
              <img
                src={logo.dataUrl}
                alt="Store logo"
                style={{
                  display: "block",
                  maxWidth: "80%",
                  maxHeight: `${appearance.maxHeight}px`,
                  objectFit: "contain",
                }}
              />
            </div>
          )}

          <div style={{ width: "100%" }}>
            <h2
              style={{
                textAlign: "center",
                fontSize: "1.5rem",
                margin: logo?.dataUrl ? "0.05rem 0 0.15rem" : "0.15rem 0",
                wordBreak: "break-word",
                whiteSpace: "normal",
              }}
            >
              {store.name}
            </h2>
          </div>

          <div style={{ width: "100%" }}>
            <h6
              style={{
                textAlign: "center",
                fontSize: "1rem",
                margin: "0.15rem 0",
              }}
            >
              {store.phone}
            </h6>
          </div>

          <div style={{ width: "100%" }}>
            <h6
              style={{
                textAlign: "center",
                fontSize: "1rem",
                margin: "0.15rem 0",
              }}
            >
              {store.address}
            </h6>
          </div>

          <div style={{ width: "100%" }}>
            <h6
              style={{
                textAlign: "center",
                fontSize: "1rem",
                margin: "0.15rem 0",
              }}
            >
              {billTypeKey ? BILL_TYPE_LABELS[billTypeKey] : bill.type}
            </h6>
          </div>

          <div style={{ width: "100%" }}>
            <h6
              style={{
                textAlign: "center",
                fontSize: "1rem",
                margin: "0.15rem 0",
              }}
            >
              {new Date(bill.time).toLocaleString("ar-EG")}
            </h6>
          </div>

          <hr
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid rgba(0, 0, 0, 0.12)",
            }}
          />

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <thead
              style={{
                fontWeight: "bold",
              }}
            >
              <tr
                style={{
                  backgroundColor: "rgba(0, 0, 0, 1)",
                  color: "white",
                }}
              >
                <th
                  style={{
                    fontSize: "1.2em",
                    textAlign: "center",
                    padding: "4px",
                    wordBreak: "break-word",
                    whiteSpace: "normal",
                    width: "30%",
                  }}
                >
                  المنتج
                </th>
                <th
                  style={{
                    fontSize: "1.2em",
                    textAlign: "center",
                    padding: "4px",
                    width: "20%",
                  }}
                >
                  الكمية
                </th>
                <th
                  style={{
                    fontSize: "1.2em",
                    textAlign: "center",
                    padding: "4px",
                    width: "25%",
                  }}
                >
                  السعر
                </th>
                <th
                  style={{
                    fontSize: "1.2em",
                    textAlign: "center",
                    padding: "4px",
                    width: "25%",
                  }}
                >
                  ألاجمالى
                </th>
              </tr>
            </thead>
            <tbody>
              {bill.products.map((product, i) => (
                <tr
                  key={i}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "white" : "rgba(0, 0, 0, 0.20)",
                  }}
                >
                  <td
                    style={{
                      fontSize: "1.2em",
                      textAlign: "center",
                      padding: "4px",
                      wordBreak: "break-word",
                      whiteSpace: "normal",
                    }}
                  >
                    {product.name}
                  </td>
                  <td
                    style={{
                      fontSize: "1.2em",
                      textAlign: "center",
                      padding: "4px",
                    }}
                  >
                    {Math.abs(product.amount)}
                  </td>
                  <td
                    style={{
                      fontSize: "1.2em",
                      textAlign: "center",
                      padding: "4px",
                    }}
                  >
                    {bill.type === "buy"
                      ? product.wholesale_price
                      : product.price}
                  </td>
                  <td
                    style={{
                      fontSize: "1.2em",
                      textAlign: "center",
                      padding: "4px",
                    }}
                  >
                    {Math.abs(product.amount) *
                      (bill.type === "buy"
                        ? product.wholesale_price
                        : product.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid rgba(0, 0, 0, 0.12)",
            }}
          />

          <div style={{ width: "100%" }}>
            <h6
              style={{
                textAlign: "center",
                fontSize: "1.25rem",
                margin: "1rem",
              }}
            >
              اجمالى المنتجات :{" "}
              {bill.products.reduce((acc, p) => acc + Math.abs(p.amount), 0)}
            </h6>
          </div>

          <hr
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid rgba(0, 0, 0, 0.12)",
            }}
          />

          {bill.type === "installment"
            ? renderInstallmentSection()
            : bill.type === "BNPL"
              ? renderBnplSection()
              : bill.type === "reserve"
                ? renderReserveSection()
                : renderDefaultTotals()}

          {footerMessage && (
            <div style={{ width: "100%" }}>
              <h5
                style={{
                  textAlign: "center",
                  fontSize: "1rem",
                  margin: "0.15rem 0",
                }}
              >
                {footerMessage}
              </h5>
            </div>
          )}
          {open && (
            <DialogActions>
              <Button variant="contained" onClick={() => setOpen(false)}>
                اغلاق
              </Button>
            </DialogActions>
          )}
        </div>

        {bill.note && bill.note.trim() && (
          <div
            style={{
              width: "120mm",
              marginTop: "0.75rem",
              backgroundColor: "#fff",
              color: "#000",
              borderRadius: "6px",
              padding: "0.75rem 1rem",
              direction: "rtl",
            }}
          >
            <h6
              style={{
                margin: "0 0 0.35rem 0",
                fontSize: "0.95rem",
                textAlign: "right",
              }}
            >
              ملاحظة الفاتورة
            </h6>
            <p
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                textAlign: "right",
                fontSize: "0.9rem",
              }}
            >
              {bill.note}
            </p>
          </div>
        )}
      </div>
    );
  },
);

export default BillView;

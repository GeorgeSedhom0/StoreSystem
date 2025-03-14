import { Button, DialogActions } from "@mui/material";
import { forwardRef, useContext } from "react";
import { CollectionBill } from "./types";
import { StoreContext } from "../StoreDataProvider";

const billTypeLabels: Record<string, string> = {
  sell: "بيع",
  buy: "شراء",
  return: "مرتجع",
  BNPL: "بيع اجل",
  reserve: "حجز",
  installment: "قسط",
};

interface BillCollectionViewProps {
  collection: CollectionBill;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const BillCollectionView = forwardRef<HTMLDivElement, BillCollectionViewProps>(
  ({ collection, open, setOpen }, ref) => {
    // Function to determine if total should be shown as negative
    const shouldShowNegativeTotal = (billType: string) => {
      return billType === "buy";
    };

    // Function to determine if product amount should be shown as negative
    const formatProductAmount = (amount: number, billType: string) => {
      if (
        billType === "sell" ||
        billType === "BNPL" ||
        billType === "reserve" ||
        billType === "installment"
      ) {
        return -Math.abs(amount);
      }
      return Math.abs(amount);
    };

    const { store } = useContext(StoreContext);

    if (!collection) return null;

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
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 9999999999999,
        }}
      >
        <div
          ref={ref}
          style={{
            width: open ? "240mm" : "98%",
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
          id={`collection-${collection.collection_id}`}
        >
          <div style={{ width: "100%" }}>
            <h2
              style={{
                textAlign: "center",
                fontSize: "1.5rem",
                margin: "0.15rem 0",
                wordBreak: "break-word",
                whiteSpace: "normal",
              }}
            >
              {store?.name || ""}
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
              {store?.phone || ""}
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
              {store?.address || ""}
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
              مجموعة فواتير #{collection.collection_id}
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
              {new Date(collection.time).toLocaleString("ar-EG")}
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
              {collection.party_name
                ? `الطرف الثاني: ${collection.party_name}`
                : "بدون طرف ثانى"}
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
              الحالة: {collection.is_closed ? "مغلقة" : "مفتوحة"}
            </h6>
          </div>

          <hr
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px solid rgba(0, 0, 0, 0.12)",
              margin: "0.5rem 0",
            }}
          />

          {collection.bills.map((bill, index) => (
            <div key={bill.id} style={{ width: "100%", marginBottom: "1rem" }}>
              <div style={{ width: "100%" }}>
                <h6
                  style={{
                    textAlign: "center",
                    fontSize: "1.25rem",
                    margin: "0.5rem 0",
                    fontWeight: "bold",
                  }}
                >
                  فاتورة {index + 1}: {billTypeLabels[bill.type] || bill.type}
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
                  التاريخ: {new Date(bill.time).toLocaleString("ar-EG")}
                </h6>
              </div>

              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                  marginTop: "0.5rem",
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
                      الإجمالي
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
                        {product.price}
                      </td>
                      <td
                        style={{
                          fontSize: "1.2em",
                          textAlign: "center",
                          padding: "4px",
                        }}
                      >
                        {formatProductAmount(product.amount, bill.type)}
                      </td>
                      <td
                        style={{
                          fontSize: "1.2em",
                          textAlign: "center",
                          padding: "4px",
                        }}
                      >
                        {shouldShowNegativeTotal(bill.type)
                          ? -Math.abs(product.price * product.amount)
                          : Math.abs(product.price * product.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ width: "100%", marginTop: "0.5rem" }}>
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
                          padding: "8px",
                        }}
                      >
                        الخصم
                      </td>
                      <td
                        style={{
                          fontSize: "1.2em",
                          textAlign: "center",
                          padding: "8px",
                        }}
                      >
                        {Math.abs(bill.discount)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          fontSize: "1.2em",
                          textAlign: "center",
                          padding: "8px",
                          fontWeight: "bold",
                        }}
                      >
                        الإجمالي
                      </td>
                      <td
                        style={{
                          fontSize: "1.2em",
                          textAlign: "center",
                          padding: "8px",
                          fontWeight: "bold",
                        }}
                      >
                        {shouldShowNegativeTotal(bill.type)
                          ? -Math.abs(bill.total)
                          : Math.abs(bill.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <hr
                style={{
                  width: "100%",
                  border: "none",
                  borderTop: "1px solid rgba(0, 0, 0, 0.12)",
                  margin: "0.5rem 0",
                }}
              />
            </div>
          ))}

          <div
            style={{
              width: "100%",
              backgroundColor: "rgba(0, 0, 0, 0.15)",
              padding: "8px 0",
              marginTop: "1rem",
            }}
          >
            <h5
              style={{
                textAlign: "center",
                fontSize: "1.5em",
                fontWeight: "bold",
                margin: "0.5rem 0",
              }}
            >
              إجمالي المجموعة: {Math.abs(collection.total)}
            </h5>
          </div>

          {open && (
            <DialogActions
              style={{ justifyContent: "center", margin: "1rem 0" }}
            >
              <Button
                variant="contained"
                onClick={() => setOpen(false)}
                style={{
                  backgroundColor: "#1976d2",
                  color: "white",
                  padding: "6px 16px",
                  fontSize: "0.875rem",
                  minWidth: "64px",
                  boxShadow:
                    "0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)",
                  borderRadius: "4px",
                  fontWeight: "500",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                اغلاق
              </Button>
            </DialogActions>
          )}
        </div>
      </div>
    );
  },
);

export default BillCollectionView;

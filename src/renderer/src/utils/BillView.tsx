import { Button, DialogActions } from "@mui/material";
import { Bill } from "./types";
import { forwardRef, useContext } from "react";
import { StoreContext } from "../StoreDataProvider";

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
    if (!bill) return null;
    const { store } = useContext(StoreContext);

    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
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
              {
                {
                  sell: "فاتورة مبيعات",
                  buy: "فاتورة شراء",
                  return: "فاتورة مرتجع",
                  BNPL: "فاتورة بيع اجل",
                  reserve: "فاتورة حجز",
                  installment: "فاتورة تقسيط",
                }[bill.type]
              }
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
                    {bill.type === "BNPL"
                      ? bill.products.reduce(
                          (acc, p) => acc + Math.abs(p.amount) * p.price,
                          0,
                        )
                      : Math.abs(bill.total) + Math.abs(bill.discount)}
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
                    {bill.type === "BNPL"
                      ? bill.products.reduce(
                          (acc, p) => acc + Math.abs(p.amount) * p.price,
                          0,
                        ) - bill.discount
                      : Math.abs(bill.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ width: "100%" }}>
            <h5
              style={{
                textAlign: "center",
                fontSize: "1rem",
                margin: "0.15rem 0",
              }}
            >
              عند ارجاع المنتجات لا تقبل الا من خلال هذة الفاتورة
            </h5>
          </div>
          {open && (
            <DialogActions>
              <Button variant="contained" onClick={() => setOpen(false)}>
                اغلاق
              </Button>
            </DialogActions>
          )}
        </div>
      </div>
    );
  },
);

export default BillView;

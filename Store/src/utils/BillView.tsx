import { Button, Dialog, DialogActions } from "@mui/material";
import { Bill } from "./types";
import { forwardRef, useContext } from "react";
import { StoreContext } from "../StoreDataProvider";
import FormatedNumber from "../pages/Shared/FormatedNumber";

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
    ref: any
  ) => {
    if (!bill) return null;
    const { store } = useContext(StoreContext);

    return (
      <Dialog open={open} onClose={() => setOpen(false)}>
        <div
          ref={ref}
          style={{
            width: "80mm",
            padding: "2mm",
            display: "flex",
            flexDirection: "column",
            direction: "rtl",
            backgroundColor: "white",
            color: "black",
            fontSize: "10px",
          }}
          id={`bill-${bill.id}`}
        >
          <div style={{ width: "100%" }}>
            <h2
              style={{
                textAlign: "center",
                fontSize: "2rem",
                margin: "0.15rem 0",
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

          <div style={{ width: "100%", overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
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
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                      width: "200px",
                    }}
                  >
                    المنتج
                  </th>
                  <th
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                    }}
                  >
                    الكمية
                  </th>
                  <th
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                    }}
                  >
                    السعر
                  </th>
                  <th
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
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
                        i % 2 === 0 ? "white" : "rgba(0, 0, 0, 0.12)",
                    }}
                  >
                    <td
                      style={{
                        fontSize: "1.5em",
                        textAlign: "center",
                        padding: "16px",
                        wordWrap: "break-word",
                      }}
                    >
                      {product.name}
                    </td>
                    <td
                      style={{
                        fontSize: "1.5em",
                        textAlign: "center",
                        padding: "16px",
                      }}
                    >
                      {Math.abs(product.amount)}
                    </td>
                    <td
                      style={{
                        fontSize: "1.5em",
                        textAlign: "center",
                        padding: "16px",
                      }}
                    >
                      <FormatedNumber money>
                        {bill.type === "buy"
                          ? product.wholesale_price
                          : product.price}
                      </FormatedNumber>
                    </td>
                    <td
                      style={{
                        fontSize: "1.5em",
                        textAlign: "center",
                        padding: "16px",
                      }}
                    >
                      <FormatedNumber money>
                        {Math.abs(product.amount) *
                          (bill.type === "buy"
                            ? product.wholesale_price
                            : product.price)}
                      </FormatedNumber>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

          <div style={{ width: "100%", overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <tbody>
                <tr
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.12)",
                    color: "black",
                  }}
                >
                  <td
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                    }}
                  >
                    الاجمالى
                  </td>
                  <td
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                    }}
                  >
                    <FormatedNumber money>
                      {bill.type === "BNPL"
                        ? bill.products.reduce(
                            (acc, p) => acc + Math.abs(p.amount) * p.price,
                            0
                          )
                        : Math.abs(bill.total) + Math.abs(bill.discount)}
                    </FormatedNumber>
                  </td>
                </tr>
                <tr>
                  <td
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                    }}
                  >
                    الخصم
                  </td>
                  <td
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                    }}
                  >
                    <FormatedNumber money>{bill.discount}</FormatedNumber>
                  </td>
                </tr>
                <tr
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.12)",
                    color: "black",
                  }}
                >
                  <td
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                    }}
                  >
                    الصافى
                  </td>
                  <td
                    style={{
                      fontSize: "1.5em",
                      textAlign: "center",
                      padding: "16px",
                    }}
                  >
                    <FormatedNumber money>
                      {bill.type === "BNPL"
                        ? bill.products.reduce(
                            (acc, p) => acc + Math.abs(p.amount) * p.price,
                            0
                          ) - bill.discount
                        : Math.abs(bill.total)}
                    </FormatedNumber>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ width: "100%" }}>
            <h5
              style={{
                textAlign: "center",
                fontSize: "5rem",
                margin: "0.15rem 0",
              }}
            >
              عند ارجاع المنتجات لا تقبل الا من خلال هذة الفاتورة
            </h5>
          </div>
        </div>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>إغلاق</Button>
        </DialogActions>
      </Dialog>
    );
  }
);

export default BillView;

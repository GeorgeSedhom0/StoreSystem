import { useEffect } from "react";

const useQuickHandle = (shoppingCart, setShoppingCart) => {
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey && (!isNaN(parseInt(e.key)) || e.key === "Backspace")) {
        e.preventDefault();
        if (shoppingCart.length > 0) {
          setShoppingCart((prev) =>
            prev.map((item, index) => {
              if (index === prev.length - 1) {
                if (e.key === "Backspace") {
                  return {
                    ...item,
                    quantity:
                      parseInt(item.quantity.toString().slice(0, -1)) || 0,
                  };
                } else {
                  return {
                    ...item,
                    quantity:
                      parseInt(item.quantity.toString() + e.key) ||
                      item.quantity,
                  };
                }
              } else {
                return item;
              }
            }),
          );
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);

    return () => {
      document.removeEventListener("keydown", handleKeyPress);
    };
  }, [shoppingCart, setShoppingCart]);
};

export default useQuickHandle;

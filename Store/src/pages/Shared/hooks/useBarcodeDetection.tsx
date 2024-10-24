import { useEffect } from 'react';

const useBarcodeDetection = (products, addToCart, setMsg) => {
  useEffect(() => {
    let code = '';
    let reading = false;

    const handleKeyPress = (e) => {
      // If the target of the event is an input element, ignore the event
      if (e.target.tagName.toLowerCase() === 'input') {
        return;
      }

      if (e.key === 'Enter') {
        if (code.length >= 7) {
          const product = products.find((prod) => prod.bar_code === code);
          if (product) {
            addToCart(product);
          } else {
            setMsg({
              type: 'error',
              text: 'المنتج غير موجود',
            });
          }
          code = '';
        }
      } else {
        code += e.key;
      }

      if (!reading) {
        reading = true;
        setTimeout(() => {
          code = '';
          reading = false;
        }, 500);
      }
    };

    window.addEventListener('keypress', handleKeyPress);

    return () => {
      window.removeEventListener('keypress', handleKeyPress);
    };
  }, [products, addToCart, setMsg]);
};

export default useBarcodeDetection;

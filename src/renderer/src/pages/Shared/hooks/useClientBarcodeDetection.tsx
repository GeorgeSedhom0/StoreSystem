import { Dispatch, SetStateAction, useEffect } from "react";
import { Party } from "../../utils/types";
import { AlertMsg } from "../AlertMessage";
import axios from "axios";

const CLIENT_BARCODE_PREFIX = "CL";

const useClientBarcodeDetection = (
  parties: Party[],
  onClientFound: (party: Party) => void,
  setMsg: Dispatch<SetStateAction<AlertMsg>>,
  enabled: boolean = true,
) => {
  useEffect(() => {
    if (!enabled) return;

    let code = "";
    let reading = false;

    const handleKeyPress = async (e: KeyboardEvent) => {
      // If the target is an input element, ignore
      if ((e.target as HTMLElement).tagName.toLowerCase() === "input") {
        return;
      }

      if (e.key === "Enter") {
        if (code.length >= 2 && code.startsWith(CLIENT_BARCODE_PREFIX)) {
          // This is a client barcode
          const party = parties.find((p) => p.bar_code === code);
          if (party) {
            onClientFound(party);
          } else {
            // Try fetching from server (in case parties list is stale)
            try {
              const { data } = await axios.get(`/party/by-barcode/${code}`);
              if (data) {
                onClientFound(data);
              }
            } catch {
              setMsg({
                type: "error",
                text: "العميل غير موجود",
              });
            }
          }
          code = "";
        }
      } else {
        code += e.key;
      }

      if (!reading) {
        reading = true;
        setTimeout(() => {
          code = "";
          reading = false;
        }, 500);
      }
    };

    window.addEventListener("keypress", handleKeyPress);

    return () => {
      window.removeEventListener("keypress", handleKeyPress);
    };
  }, [parties, onClientFound, setMsg, enabled]);
};

export default useClientBarcodeDetection;

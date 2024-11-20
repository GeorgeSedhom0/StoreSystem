import { Button, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface PartyDetails {
  id: number;
  name: number;
  total_bills: number;
  total_amount: number;
  total_cash: number;
}
const getPartyDetails = async (partyId: number) => {
  const { data } = await axios.get<PartyDetails>("/party/details", {
    params: {
      party_id: partyId,
    },
  });
  return data;
};

const PartyDetails = ({ partyId }: { partyId: number | null }) => {
  const { data: partyDetails } = useQuery({
    queryKey: ["party-details", partyId],
    queryFn: () => getPartyDetails(partyId!),
    enabled: !!partyId,
  });

  if (!partyDetails) {
    return null;
  }
  return (
    <>
      <Typography variant="h6">
        اسم العميل : {partyDetails.name} {" | "}
        عدد الفواتير السابقة : {partyDetails.total_bills} {" | "}
        اجمالى المبلغ المستهلك : {partyDetails.total_amount} {" | "}
        اجمالى التعاملات المالية : {partyDetails.total_cash}
      </Typography>

      <Button
        variant="contained"
        onClick={() => {
          window.electron.ipcRenderer.invoke(
            "open-new-window",
            "#bills/" + partyDetails.id.toString(),
          );
        }}
      >
        الفواتير{" "}
      </Button>

      <Button
        variant="contained"
        onClick={() => {
          window.electron.ipcRenderer.invoke(
            "open-new-window",
            "#cash/" + partyDetails.id.toString(),
          );
        }}
      >
        التعاملات المالية{" "}
      </Button>
    </>
  );
};

export default PartyDetails;

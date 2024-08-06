import { Button, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link } from "react-router-dom";

interface PartyDetails {
  id: number;
  name: number;
  total_bills: number;
  total_amount: number;
  total_cash: number;
}
const getPartyDetails = async (partyId: number) => {
  const { data } = await axios.get<PartyDetails>(
    import.meta.env.VITE_SERVER_URL + "/party/details",
    {
      params: {
        party_id: partyId,
      },
    }
  );
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
        اجمالى المبلغ المستهلك : {partyDetails.total_bills} {" | "}
        اجمالى التعاملات المالية : {partyDetails.total_cash}
      </Typography>
      <Button variant="contained">
        <Link
          to={"/bills/" + partyDetails.id.toString()}
          style={{
            textDecoration: "none",
            color: "inherit",
          }}
          target="_blank"
        >
          الفواتير{" "}
        </Link>
      </Button>
      <Button variant="contained">
        <Link
          to={"/cash/" + partyDetails.id.toString()}
          style={{
            textDecoration: "none",
            color: "inherit",
          }}
          target="_blank"
        >
          التعاملات المالية{" "}
        </Link>
      </Button>
    </>
  );
};

export default PartyDetails;

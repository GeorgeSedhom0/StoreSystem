import { LoadingButton } from "@mui/lab";
import { ButtonGroup, Grid2, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useState, useContext } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Profile } from "../../Shared/Utils";
import { StoreContext } from "@renderer/StoreDataProvider";

const saveStoreData = async ({
  name,
  phone,
  address,
  storeId,
}: {
  name: string;
  phone: string;
  address: string;
  storeId: number;
}) => {
  await axios.put(
    "/store-data",
    {},
    {
      params: {
        name,
        phone,
        address,
        store_id: storeId,
      },
    },
  );
};

const getStoreData = async (storeId: number) => {
  const { data } = await axios.get<Profile["store"]>("/store-data", {
    params: {
      store_id: storeId,
    },
  });
  return data;
};

const Basics = () => {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const queryClient = useQueryClient();
  const { storeId } = useContext(StoreContext);

  const backUp = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/backup");
      // download the backup file
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "backup.sql");
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.log(e);
      setMsg({ type: "error", text: "حدث خطا ما" });
    }
    setLoading(false);
  }, []);

  const restore = useCallback(async () => {
    const userConsent = window.confirm(
      "هل انت متاكد من استعادة النسخة الاحطياتية",
    );
    if (!userConsent) return;
    setLoading(true);
    try {
      // let use pick the file .sql
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".sql";
      fileInput.click();
      fileInput.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) {
          setMsg({ type: "error", text: "حدث خطا ما" });
        }
        const formData = new FormData();
        formData.append("file", file);
        await axios.post("/restore", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        setMsg({ type: "success", text: "تم استعادة النسخة الاحطياتية" });
      };
    } catch (e) {
      console.log(e);
      setMsg({ type: "error", text: "حدث خطا ما" });
    }
    setLoading(false);
  }, []);

  const { mutate: setStoreData } = useMutation({
    mutationFn: saveStoreData,
    onError: (e) => {
      console.log(e);
      setMsg({ type: "error", text: "حدث خطا ما" });
    },
    onSuccess: () => {
      setMsg({ type: "success", text: "تم الحفظ" });
      queryClient.invalidateQueries({
        queryKey: ["store-data"],
      });
    },
  });

  const { data: storeInfo } = useQuery({
    queryKey: ["store-data"],
    queryFn: () => getStoreData(storeId),
  });

  useEffect(() => {
    if (storeInfo) {
      setName(storeInfo.name);
      setPhone(storeInfo.phone);
      setAddress(storeInfo.address);
    }
  }, [storeInfo]);

  return (
    <Grid2 container size={12} spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />
      <Grid2 size={12}>
        <Typography variant="h4">الاعدادات الاساسية</Typography>
      </Grid2>
      <Grid2 size={12}>
        <ButtonGroup>
          <LoadingButton loading={loading} onClick={backUp}>
            نسخ احطياتى
          </LoadingButton>
          <LoadingButton loading={loading} onClick={restore}>
            استعادة
          </LoadingButton>
        </ButtonGroup>
      </Grid2>
      <Grid2 size={12}>
        <Typography variant="h6">معلومات تظهر فى الفاتورة</Typography>
      </Grid2>
      <Grid2 container size={12} gap={3}>
        <TextField
          size="small"
          label="الاسم"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          size="small"
          label="الهاتف"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <TextField
          size="small"
          label="العنوان"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <LoadingButton
          variant="contained"
          loading={loading}
          onClick={() => setStoreData({ name, phone, address, storeId })}
        >
          حفظ
        </LoadingButton>
      </Grid2>
    </Grid2>
  );
};

export default Basics;

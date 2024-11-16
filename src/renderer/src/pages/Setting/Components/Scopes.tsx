import {
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import AlertMessage, { AlertMsg } from "../../Shared/AlertMessage";
import { Scope } from "../../../utils/types";
import { LoadingButton } from "@mui/lab";

const getScopes = async () => {
  const { data } = await axios.get<Scope[]>("/scopes");
  return data;
};

const getPages = async () => {
  const { data } =
    await axios.get<{ name: string; path: string; id: number }[]>("/pages");
  return data;
};

const updateScope = async ({
  name,
  pages,
  id,
  newScope,
}: {
  name: string;
  pages: string[];
  id?: number;
  newScope?: boolean;
}) => {
  if (newScope) {
    await axios.post("/scope", pages, {
      params: { name },
    });
  } else {
    await axios.put("/scope", pages, {
      params: { name, id },
    });
  }
};

const deleteScope = async (id: number) => {
  await axios.delete("/scope", {
    params: { id },
  });
};

const Scopes = () => {
  const [selectedScope, setSelectedScope] = useState<Scope>({
    id: -1,
    name: "",
    pages: [],
  });
  const [msg, setMsg] = useState<AlertMsg>({ type: "", text: "" });

  const {
    data: scopes,
    isLoading: isScopesLoading,
    refetch: refetchScopes,
  } = useQuery({
    queryKey: ["scopes"],
    queryFn: getScopes,
    initialData: [],
  });

  const { data: pages } = useQuery({
    queryKey: ["pages"],
    queryFn: getPages,
    initialData: [],
  });

  const { mutate: addScope, isPending: isAddingScope } = useMutation({
    mutationFn: updateScope,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم اضافة الصلاحية بنجاح" });
      refetchScopes();
      setSelectedScope({ id: -1, name: "", pages: [] });
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ ما" });
    },
  });

  const { mutate: removeScope, isPending: isRemovingScope } = useMutation({
    mutationFn: deleteScope,
    onSuccess: () => {
      setMsg({ type: "success", text: "تم حذف الصلاحية بنجاح" });
      refetchScopes();
      setSelectedScope({ id: -1, name: "", pages: [] });
    },
    onError: () => {
      setMsg({ type: "error", text: "حدث خطأ ما" });
    },
  });

  return (
    <Grid container spacing={3}>
      <AlertMessage message={msg} setMessage={setMsg} />

      <Grid item xs={12}>
        <Typography variant="h5">ادارة الصلاحيات</Typography>
        <Typography variant="h6">
          يمكن اختيار اى صلاحية لتعديلها او حذفها اما لاضافة صلاحية جديدة يمكنك
          اختيار "اضافة صلاحية جديدة"
        </Typography>
        <Typography variant="body2">
          يرجى العلم انه ان تم حذف الصلاحيات التى يملكها احد المستخدمين فلن
          يتمكن من الوصول الى الصفحات المعنية بعد ذلك
        </Typography>
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>الصلاحية</InputLabel>
          <Select
            value={selectedScope?.id || null}
            label="الصلاحية"
            onChange={(e) => {
              if (!e.target.value) return;
              if (e.target.value === -1) {
                setSelectedScope({ id: -1, name: "", pages: [] });
                return;
              }
              setSelectedScope(
                scopes.find((scope) => scope.id === e.target.value)!,
              );
            }}
            fullWidth
            disabled={isScopesLoading}
          >
            {scopes.map((scope) => (
              <MenuItem key={scope.id} value={scope.id}>
                {scope.name}
              </MenuItem>
            ))}
            <MenuItem value={-1}>اضافة صلاحية جديدة</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <Typography variant="h6">الصفحات</Typography>
      </Grid>
      <Grid item container gap={3} xs={12}>
        {selectedScope &&
          pages &&
          pages.map((page) => (
            <Grid item key={page.id}>
              <FormControlLabel
                control={
                  <Switch
                    checked={selectedScope.pages.includes(page.id)}
                    onChange={(e) => {
                      if (!selectedScope) return;
                      if (e.target.checked) {
                        setSelectedScope({
                          ...selectedScope,
                          pages: [...selectedScope.pages, page.id],
                        });
                      } else {
                        setSelectedScope({
                          ...selectedScope,
                          pages: selectedScope.pages.filter(
                            (selectedPage) => selectedPage !== page.id,
                          ),
                        });
                      }
                    }}
                  />
                }
                label={page.name}
              />
            </Grid>
          ))}
      </Grid>
      <Grid item container gap={3} xs={12}>
        <TextField
          label="اسم الصلاحية"
          value={selectedScope.name}
          onChange={(e) =>
            setSelectedScope({ ...selectedScope, name: e.target.value })
          }
          size="small"
        />
        <LoadingButton
          variant="contained"
          onClick={() => {
            addScope({
              name: selectedScope.name,
              pages: selectedScope.pages.map((page) => page.toString()),
              id: selectedScope.id !== -1 ? selectedScope.id : undefined,
              newScope: selectedScope.id === -1,
            });
          }}
          loading={isAddingScope || isScopesLoading}
        >
          {selectedScope.id === -1 ? "اضافة" : "تعديل"}
        </LoadingButton>
        {selectedScope.id !== -1 && (
          <LoadingButton
            variant="contained"
            onClick={() => removeScope(selectedScope.id)}
            loading={isRemovingScope || isScopesLoading}
          >
            حذف الصلاحيات
          </LoadingButton>
        )}
      </Grid>
    </Grid>
  );
};

export default Scopes;

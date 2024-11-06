export interface Theme {
  name: string;
  mode: "light" | "dark";
  primary: string;
  secondary: string;
  background: string;
  paper: string;
  divider: string;
  backgroundImage: string;
  text: {
    primary: string;
    secondary: string;
    disabled: string;
  };
  action: {
    active: string;
    hover: string;
    selected: string;
    disabled: string;
  };
  surface: {
    main: string;
    border: string;
  };
  error: string;
  warning: string;
  info: string;
  success: string;
}

export const themes: Theme[] = [
  {
    name: "Light Blue",
    mode: "light",
    primary: "#1976d2",
    secondary: "#7c4dff",
    background: "#f8faff",
    paper: "#ffffff",
    divider: "rgba(0, 0, 0, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #f8faff 0%, #e3f2fd 50%, #bbdefb 100%)",
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    action: {
      active: "rgba(0, 0, 0, 0.54)",
      hover: "rgba(25, 118, 210, 0.04)",
      selected: "rgba(25, 118, 210, 0.08)",
      disabled: "rgba(0, 0, 0, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 0, 0, 0.12)",
    },
    error: "#d32f2f",
    warning: "#ed6c02",
    info: "#0288d1",
    success: "#2e7d32",
  },
  {
    name: "Dark Blue",
    mode: "dark",
    primary: "#90caf9",
    secondary: "#ce93d8",
    background: "#0a1929",
    paper: "#0d1b2a",
    divider: "rgba(255, 255, 255, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #0a1929 0%, #0d1b2a 50%, #132f4c 100%)",
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      disabled: "rgba(255, 255, 255, 0.5)",
    },
    action: {
      active: "#ffffff",
      hover: "rgba(144, 202, 249, 0.08)",
      selected: "rgba(144, 202, 249, 0.16)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
    surface: {
      main: "#0d1b2a",
      border: "rgba(255, 255, 255, 0.12)",
    },
    error: "#f44336",
    warning: "#ffa726",
    info: "#29b6f6",
    success: "#66bb6a",
  },
  {
    name: "Light Orange",
    mode: "light",
    primary: "#f57c00",
    secondary: "#ff6090",
    background: "#fffaf5",
    paper: "#ffffff",
    divider: "rgba(0, 0, 0, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #fffaf5 0%, #fff7e6 50%, #ffe0b2 100%)",
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    action: {
      active: "rgba(0, 0, 0, 0.54)",
      hover: "rgba(245, 124, 0, 0.04)",
      selected: "rgba(245, 124, 0, 0.08)",
      disabled: "rgba(0, 0, 0, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 0, 0, 0.12)",
    },
    error: "#ffa0a0",
    warning: "#f57c00",
    info: "#0288d1",
    success: "#2e7d32",
  },
  {
    name: "Dark Orange",
    mode: "dark",
    primary: "#fb8c00",
    secondary: "#ff9cad",
    background: "#1a0f00",
    paper: "#261a0f",
    divider: "rgba(255, 255, 255, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #1a0f00 0%, #261a0f 50%, #332211 100%)",
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      disabled: "rgba(255, 255, 255, 0.5)",
    },
    action: {
      active: "#ffffff",
      hover: "rgba(255, 167, 38, 0.08)",
      selected: "rgba(255, 167, 38, 0.16)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
    surface: {
      main: "#261a0f",
      border: "rgba(255, 255, 255, 0.12)",
    },
    error: "#411a0f",
    warning: "#ffa726",
    info: "#29b6f6",
    success: "#66bb6a",
  },
  {
    name: "Light Green",
    mode: "light",
    primary: "#2e7d32",
    secondary: "#00796b",
    background: "#f6fbf6",
    paper: "#ffffff",
    divider: "rgba(0, 0, 0, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #f6fbf6 0%, #e8f5e9 50%, #c8e6c9 100%)",
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    action: {
      active: "rgba(0, 0, 0, 0.54)",
      hover: "rgba(46, 125, 50, 0.04)",
      selected: "rgba(46, 125, 50, 0.08)",
      disabled: "rgba(0, 0, 0, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 0, 0, 0.12)",
    },
    error: "#d32f2f",
    warning: "#ed6c02",
    info: "#0288d1",
    success: "#2e7d32",
  },
  {
    name: "Dark Green",
    mode: "dark",
    primary: "#81c784",
    secondary: "#a5d6a7",
    background: "#071912",
    paper: "#0f2918",
    divider: "rgba(255, 255, 255, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #071912 0%, #0f2918 50%, #1a3828 100%)",
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      disabled: "rgba(255, 255, 255, 0.5)",
    },
    action: {
      active: "#ffffff",
      hover: "rgba(129, 199, 132, 0.08)",
      selected: "rgba(129, 199, 132, 0.16)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
    surface: {
      main: "#0f2918",
      border: "rgba(255, 255, 255, 0.12)",
    },
    error: "#b44336",
    warning: "#ffa726",
    info: "#29b6f6",
    success: "#66bb6a",
  },
  {
    name: "Light Red",
    mode: "light",
    primary: "#e57373",
    secondary: "#f06292",
    background: "#fff8f8",
    paper: "#ffffff",
    divider: "rgba(0, 0, 0, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #fff8f8 0%, #ffefef 50%, #ffe1e1 100%)",
    text: {
      primary: "rgba(0, 0, 0, 0.87)",
      secondary: "rgba(0, 0, 0, 0.6)",
      disabled: "rgba(0, 0, 0, 0.38)",
    },
    action: {
      active: "rgba(0, 0, 0, 0.54)",
      hover: "rgba(229, 115, 115, 0.04)",
      selected: "rgba(229, 115, 115, 0.08)",
      disabled: "rgba(0, 0, 0, 0.26)",
    },
    surface: {
      main: "#ffffff",
      border: "rgba(0, 0, 0, 0.12)",
    },
    error: "#f54343",
    warning: "#ed6c02",
    info: "#0288d1",
    success: "#2e7d32",
  },
  {
    name: "Dark Red",
    mode: "dark",
    primary: "#ff8a80",
    secondary: "#ff80ab",
    background: "#1f1414",
    paper: "#2a1c1c",
    divider: "rgba(255, 255, 255, 0.12)",
    backgroundImage:
      "linear-gradient(135deg, #1f1414 0%, #2a1c1c 50%, #352424 100%)",
    text: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.7)",
      disabled: "rgba(255, 255, 255, 0.5)",
    },
    action: {
      active: "#ffffff",
      hover: "rgba(255, 138, 128, 0.08)",
      selected: "rgba(255, 138, 128, 0.16)",
      disabled: "rgba(255, 255, 255, 0.3)",
    },
    surface: {
      main: "#2a1c1c",
      border: "rgba(255, 255, 255, 0.12)",
    },
    error: "#6f5050",
    warning: "#ffa726",
    info: "#29b6f6",
    success: "#66bb6a",
  },
];

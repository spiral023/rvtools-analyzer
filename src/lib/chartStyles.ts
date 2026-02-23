export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--popover-foreground))",
  fontSize: "12px",
};

export const CHART_TOOLTIP_ITEM_STYLE = {
  color: "hsl(var(--popover-foreground))",
};

export const CHART_TOOLTIP_LABEL_STYLE = {
  color: "hsl(var(--popover-foreground))",
  fontWeight: 600,
};

export const CHART_AXIS_STYLE = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
export const CHART_GRID_STYLE = { stroke: "hsl(var(--border))", strokeDasharray: "3 3" };
export const CHART_AXIS_LABEL_STYLE = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

export const CHART_COLORS = {
  primary: "hsl(190, 85%, 48%)",
  secondary: "hsl(215, 12%, 45%)",
  warning: "hsl(38, 92%, 50%)",
  danger: "hsl(0, 72%, 51%)",
  success: "hsl(152, 69%, 40%)",
  info: "hsl(217, 91%, 60%)",
  purple: "hsl(263, 70%, 50%)",
  pink: "hsl(330, 80%, 55%)",
};

export const SEVERITY_COLORS = [
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.primary,
  CHART_COLORS.info,
  CHART_COLORS.purple,
  CHART_COLORS.pink,
  CHART_COLORS.secondary,
];

import { Navigate } from "react-router-dom";

export default function Wartungsankuendigung() {
  return <Navigate to="/clusters?tab=maintenance" replace />;
}

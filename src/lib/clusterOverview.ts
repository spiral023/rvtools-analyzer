export function vcpuPerCoreSeverityClass(vcpuPerCore: number): string | undefined {
  if (vcpuPerCore >= 5) return "text-red-400";
  if (vcpuPerCore >= 4) return "text-orange-400";
  return undefined;
}

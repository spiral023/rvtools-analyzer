export interface ScenarioTargetDisplay {
  label: string;
  warning: string | null;
}

export function getScenarioTargetDisplay(
  targetClusterKey: string,
  clusterNamesByKey: ReadonlyMap<string, string>,
): ScenarioTargetDisplay {
  const clusterName = clusterNamesByKey.get(targetClusterKey);
  if (clusterName) return { label: clusterName, warning: null };

  const separatorIndex = targetClusterKey.lastIndexOf("::");
  if (separatorIndex > 0 && separatorIndex < targetClusterKey.length - 2) {
    const legacyClusterName = targetClusterKey.slice(0, separatorIndex);
    const vcenterId = targetClusterKey.slice(separatorIndex + 2);
    return {
      label: "Verwaistes Ziel",
      warning: `Zielcluster „${legacyClusterName}“ in vCenter „${vcenterId}“ konnte nicht eindeutig zugeordnet werden.`,
    };
  }

  if (!targetClusterKey.includes("\u0000")) {
    return {
      label: "Verwaistes Ziel",
      warning: `Zielcluster „${targetClusterKey}“ konnte nicht eindeutig zugeordnet werden.`,
    };
  }

  return { label: targetClusterKey, warning: null };
}

import type { TechInfoOrgAggregate, TechInfoOrgNode, TechInfoOrgVmRef } from "@/domain/services/techInfoOrganisationService";

/** Einheitlicher Baumknoten für die Darstellung, unabhängig von der jeweiligen Hierarchieebene (Org/Bereich/Abteilung/Person). */
export interface TechInfoOrgTreeNode {
  id: string;
  label: string;
  depth: number;
  aggregate: TechInfoOrgAggregate;
  children: TechInfoOrgTreeNode[];
  /** Alle VM-Zuordnungen unterhalb dieses Knotens (für den Drilldown). */
  vmRefs: TechInfoOrgVmRef[];
}

function toAggregate(node: TechInfoOrgAggregate): TechInfoOrgAggregate {
  return {
    vmCount: node.vmCount,
    poweredOnCount: node.poweredOnCount,
    poweredOffCount: node.poweredOffCount,
    vCpuSum: node.vCpuSum,
    memoryMiBSum: node.memoryMiBSum,
    cpuDemandAverageMHzSum: node.cpuDemandAverageMHzSum,
    cpuDemandCapacityMHzSum: node.cpuDemandCapacityMHzSum,
    cpuDemandVmCount: node.cpuDemandVmCount,
    reclaimableVcpuSum: node.reclaimableVcpuSum,
    rightsizingVmCount: node.rightsizingVmCount,
  };
}

export function buildTechInfoOrgTree(orgNodes: readonly TechInfoOrgNode[]): TechInfoOrgTreeNode[] {
  return orgNodes.map((org) => {
    const bereiche = org.bereiche.map((bereich) => {
      const abteilungen = bereich.abteilungen.map((abteilung) => {
        const persons = abteilung.persons.map((person): TechInfoOrgTreeNode => ({
          id: person.id,
          label: person.person,
          depth: 3,
          aggregate: toAggregate(person),
          children: [],
          vmRefs: person.vms,
        }));
        return {
          id: abteilung.id,
          label: abteilung.label,
          depth: 2,
          aggregate: toAggregate(abteilung),
          children: persons,
          vmRefs: persons.flatMap((p) => p.vmRefs),
        };
      });
      return {
        id: bereich.id,
        label: bereich.label,
        depth: 1,
        aggregate: toAggregate(bereich),
        children: abteilungen,
        vmRefs: abteilungen.flatMap((a) => a.vmRefs),
      };
    });
    return {
      id: org.id,
      label: org.label,
      depth: 0,
      aggregate: toAggregate(org),
      children: bereiche,
      vmRefs: bereiche.flatMap((b) => b.vmRefs),
    };
  });
}

export function flattenVisibleTechInfoOrgTree(nodes: readonly TechInfoOrgTreeNode[], expandedIds: ReadonlySet<string>): TechInfoOrgTreeNode[] {
  const result: TechInfoOrgTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    const showChildren = node.depth === 0 || expandedIds.has(node.id);
    if (showChildren && node.children.length > 0) result.push(...flattenVisibleTechInfoOrgTree(node.children, expandedIds));
  }
  return result;
}

export function formatRamGiB(memoryMiB: number): string {
  return `${(memoryMiB / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 0 })} GiB`;
}

export function formatCpuDemandAverage(aggregate: TechInfoOrgAggregate): string {
  if (aggregate.cpuDemandVmCount === 0) return "—";
  return `${(aggregate.cpuDemandAverageMHzSum / 1_000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GHz`;
}

export function formatCpuIntensity(aggregate: TechInfoOrgAggregate): string {
  if (aggregate.cpuDemandVmCount === 0 || aggregate.cpuDemandCapacityMHzSum <= 0) return "—";
  return `${((aggregate.cpuDemandAverageMHzSum / aggregate.cpuDemandCapacityMHzSum) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
}

export function formatRightsizingPotential(aggregate: TechInfoOrgAggregate): string {
  if (aggregate.rightsizingVmCount === 0 || aggregate.vCpuSum <= 0) return "—";
  return `${((aggregate.reclaimableVcpuSum / aggregate.vCpuSum) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
}

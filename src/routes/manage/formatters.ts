import type { ProjectSnapshot } from "~/workspace/types";

export const joinLabels = (values: string[], fallback = "未识别") =>
  values.length ? values.join(" · ") : fallback;

export const formatPrimaryTechnology = (project: ProjectSnapshot) =>
  joinLabels(
    [...project.technology.languages, ...project.technology.frameworks].filter(
      (value, index, allValues) => value && allValues.indexOf(value) === index,
    ),
    "待识别",
  );

export const formatPackageManagers = (project: ProjectSnapshot) =>
  joinLabels(project.packageManagers.filter((packageManager) => packageManager !== "unknown"));

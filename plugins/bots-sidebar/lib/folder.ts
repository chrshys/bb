export function folderName(path: string): string {
  const name = path.trim().replace(/[\\/]+$/u, "").split(/[\\/]/u).pop() ?? "";
  return /^[A-Za-z]:$/u.test(name) ? "" : name.slice(0, 120);
}

export function childFolderPath(directory: string, name: string): string {
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  return `${directory.replace(/[\\/]+$/u, "")}${separator}${name}`;
}

export type LaunchableTable = { hostUserId: string; status: string; visibility: string };

export function canLaunchTable(table: LaunchableTable, userId: string, role: "dm" | "player", invited: boolean): boolean {
  if (role === "dm") return table.hostUserId === userId && table.status !== "HIDDEN";
  if (table.hostUserId === userId || table.status !== "PUBLISHED") return false;
  return table.visibility === "PUBLIC" || (table.visibility === "PRIVATE" && invited);
}

/**
 * Właściciel firmy (identyfikator w argumencie) wydaje narzędzie o podanym kodzie z bazy na pierwszą
 * aktywną budowę, tak jakby zrobił to na swoim telefonie w czasie, gdy kierownik jest bez zasięgu.
 */
import { randomUUID } from "node:crypto";
import { getRegistry } from "@/lib/registry-instance";

const [ownerId, code] = process.argv.slice(2);
const owner = getRegistry().as(ownerId);
const board = await owner.whereIsWhat();
const tool = board.base.tools.find((candidate) => candidate.code === code);
if (!tool) throw new Error(`Na bazie nie ma ${code}`);
await owner.registerMovement({
  operationId: randomUUID(),
  kind: "wydanie",
  fromLocationId: board.base.id,
  toLocationId: board.sites[0].id,
  toolIds: [tool.id],
  source: "checklista",
});
console.log("ok");
process.exit(0);

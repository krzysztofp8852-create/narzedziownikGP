import { isCronRequest } from "@/lib/cron";
import { getRegistry } from "@/lib/registry-instance";

/**
 * Zadanie dzienne harmonogramu Vercel (`vercel.json`): przypomnienia o terminach przeglądów, kalibracji, badań UDT,
 * gwarancji i zwrotu sprzętu wynajętego oraz o uprawnieniach ludzi. Błąd jednych przypomnień nie zabiera drugich.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Brak dostępu", { status: 401 });
  const system = getRegistry().system();
  const [deadlines, qualifications] = await Promise.allSettled([system.notifyDueDeadlines(), system.notifyDueQualifications()]);
  const failed = [deadlines, qualifications].filter((result) => result.status === "rejected");
  if (failed.length > 0) throw failed[0].reason;
  return Response.json({
    deadlines: deadlines.status === "fulfilled" ? deadlines.value.deadlines : 0,
    qualifications: qualifications.status === "fulfilled" ? qualifications.value.qualifications : 0,
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { notificationLink } from "@/lib/bell-text";
import { getRegistry } from "@/lib/registry-instance";
import type { PushSubscriptionData } from "@/registry/registry";

/** „Pokaż”: powiadomienie staje się przeczytane, a użytkownik trafia tam, dokąd ono prowadzi. */
export async function openNotification(notificationId: string) {
  const session = await requireSession();
  const entry = await getRegistry().as(session.userId).markNotificationRead(notificationId);
  revalidatePath("/", "layout");
  redirect(entry ? notificationLink(entry.notification) : "/dzwonek");
}

export async function markNotificationRead(notificationId: string) {
  const session = await requireSession();
  await getRegistry().as(session.userId).markNotificationRead(notificationId);
  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead() {
  const session = await requireSession();
  await getRegistry().as(session.userId).markAllNotificationsRead();
  revalidatePath("/", "layout");
}

/** Włącza powiadomienia push w tej przeglądarce: kopie nowych wpisów dzwonka przyjdą na telefon. */
export async function savePushSubscription(subscription: PushSubscriptionData) {
  const session = await requireSession();
  await getRegistry().as(session.userId).subscribeToPush(subscription);
}

/** Wyłącza powiadomienia push w tej przeglądarce (także przy wylogowaniu). */
export async function removePushSubscription(endpoint: string) {
  const session = await requireSession();
  await getRegistry().as(session.userId).unsubscribeFromPush(String(endpoint));
}

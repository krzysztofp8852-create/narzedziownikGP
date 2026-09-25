import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { signOut } from "../actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  return (
    <>
      <header className="app-header">
        <div className="hazard" aria-hidden />
        <div className="app-header-bar">
          <div>
            <p className="display app-header-company" data-testid="company-name">
              {session.company.name}
            </p>
            <p className="muted app-header-user">
              {session.fullName} · {t(`roles.${session.role}`)}
            </p>
          </div>
          <form action={signOut}>
            <button className="button button-quiet" type="submit">
              {t("header.logout")}
            </button>
          </form>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}

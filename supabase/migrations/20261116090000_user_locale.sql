-- Język interfejsu (ADR 0047): wybór jednej osoby, nie firmy. Inne osoby w firmie dalej widzą swój język, a e-maile
-- i powiadomienia push idą w języku adresata. Polski to język domyślny i jedyny pełny.
alter table app.users add column locale text not null default 'pl' check (locale in ('pl', 'uk', 'ru', 'en', 'ka', 'be'));

-- Własny wiersz zmienia każdy aktywny przez users_update_self.
grant update (locale) on app.users to authenticated;

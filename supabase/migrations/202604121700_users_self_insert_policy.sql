drop policy if exists "Users can create own account" on public.users;
create policy "Users can create own account"
on public.users for insert
with check (auth.uid() = id);

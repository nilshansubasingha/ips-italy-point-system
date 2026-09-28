begin;

drop policy if exists "ips replay read" on storage.objects;
create policy "ips replay read"
on storage.objects for select
to anon, authenticated
using (bucket_id='ips-replay');

commit;

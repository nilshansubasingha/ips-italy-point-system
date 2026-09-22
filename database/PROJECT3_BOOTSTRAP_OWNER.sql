-- Run this ONCE in Supabase SQL Editor after the intended Owner account has signed up.
-- Initial IPS Owner account: nilshansubasingha@gmail.com. Do not expose this operation through the public web UI.

insert into public.role_grants (
  user_id, role, scope_type, granted_by, note
)
select
  u.id,
  'OWNER'::public.ips_role,
  'GLOBAL'::public.ips_scope_type,
  u.id,
  'Initial IPS Owner bootstrap'
from auth.users u
where lower(u.email) = lower('nilshansubasingha@gmail.com')
  and not exists (
    select 1 from public.role_grants rg
    where rg.user_id=u.id
      and rg.role='OWNER'
      and rg.scope_type='GLOBAL'
      and rg.revoked_at is null
  );

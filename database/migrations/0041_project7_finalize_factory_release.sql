-- IPS Project 7.4 — finalize factory release manifest after expanded graphics committed.

begin;

with pkg as (
  select * from public.broadcast_packages where slug='ips-prism' and is_factory limit 1
),
next_release as (
  select coalesce(max(r.version_no),0)+1 as version_no
  from public.broadcast_package_releases r
  join pkg on pkg.id=r.package_id
)
insert into public.broadcast_package_releases(package_id,version_no,manifest,theme,checksum)
select pkg.id,next_release.version_no,public.ips_broadcast_build_release_manifest(pkg.id),pkg.theme,'ips-prism-factory-expanded'
from pkg cross join next_release;

commit;

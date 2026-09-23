-- IPS Project 5.7.1 — repair municipality labels affected by source encoding.

begin;

update public.cities
set region='Trentino-Alto Adige/Südtirol',region_code='04',updated_at=now()
where province_abbr in ('BZ','TN');

update public.cities
set region='Valle d''Aosta/Vallée d''Aoste',region_code='02',updated_at=now()
where province_abbr='AO';

update public.cities
set province_name='Forlì-Cesena',updated_at=now()
where province_abbr='FC';

commit;

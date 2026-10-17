-- Distribución de mesas por zona: lista de capacidades, por ejemplo '8,2,2,2,2'
-- (un mesón de 8 y cuatro escritorios de 2). Los puestos se numeran en ese orden.
alter table public.zones add column if not exists layout text not null default ''
  check (layout ~ '^([0-9]{1,2}(,[0-9]{1,2})*)?$');
update public.zones set layout = '8,2,2,2,2' where id in ('N','S') and desks = 16 and layout = '';
update public.zones set layout = '2,2' where id = 'Q' and desks = 4 and layout = '';

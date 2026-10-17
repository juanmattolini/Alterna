-- Feriados nacionales y días no laborables de Argentina 2026-2027.
-- Solo días hábiles (los fines de semana la oficina ya está cerrada).
-- Fuentes: calendario oficial 2026, Decreto 1103/2026 (visita del Papa) y
-- feriados inamovibles/trasladables 2027 (Ley 27.399). Los puentes turísticos
-- de 2027 todavía no fueron decretados.
alter table public.closures add column if not exists kind text not null default 'cierre'
  check (kind in ('feriado','no_laborable','cierre'));

insert into public.closures(date, reason, kind) values
  ('2026-01-01','Año Nuevo','feriado'),
  ('2026-02-16','Carnaval','feriado'),
  ('2026-02-17','Carnaval','feriado'),
  ('2026-03-23','Puente turístico','no_laborable'),
  ('2026-03-24','Día de la Memoria por la Verdad y la Justicia','feriado'),
  ('2026-04-02','Malvinas y Jueves Santo','feriado'),
  ('2026-04-03','Viernes Santo','feriado'),
  ('2026-05-01','Día del Trabajador','feriado'),
  ('2026-05-25','Revolución de Mayo','feriado'),
  ('2026-06-15','Paso a la Inmortalidad de Güemes','feriado'),
  ('2026-07-09','Día de la Independencia','feriado'),
  ('2026-07-10','Puente turístico','no_laborable'),
  ('2026-08-17','Paso a la Inmortalidad de San Martín','feriado'),
  ('2026-10-12','Día del Respeto a la Diversidad Cultural','feriado'),
  ('2026-11-09','Visita del Papa León XIV','feriado'),
  ('2026-11-23','Día de la Soberanía Nacional','feriado'),
  ('2026-12-07','Puente turístico','no_laborable'),
  ('2026-12-08','Inmaculada Concepción de María','feriado'),
  ('2026-12-25','Navidad','feriado'),
  ('2027-01-01','Año Nuevo','feriado'),
  ('2027-02-08','Carnaval','feriado'),
  ('2027-02-09','Carnaval','feriado'),
  ('2027-03-24','Día de la Memoria por la Verdad y la Justicia','feriado'),
  ('2027-03-25','Jueves Santo','no_laborable'),
  ('2027-03-26','Viernes Santo','feriado'),
  ('2027-04-02','Día del Veterano y de los Caídos en Malvinas','feriado'),
  ('2027-05-25','Revolución de Mayo','feriado'),
  ('2027-06-21','Paso a la Inmortalidad de Güemes','feriado'),
  ('2027-07-09','Día de la Independencia','feriado'),
  ('2027-08-16','Paso a la Inmortalidad de San Martín','feriado'),
  ('2027-10-11','Día del Respeto a la Diversidad Cultural','feriado'),
  ('2027-12-08','Inmaculada Concepción de María','feriado')
on conflict (date) do nothing;

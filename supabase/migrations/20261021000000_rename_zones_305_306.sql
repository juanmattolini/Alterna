-- Zona Norte pasa a llamarse 306 y Zona Sur 305 (los códigos N y S no cambian).
update public.zones set name = '306' where id = 'N';
update public.zones set name = '305' where id = 'S';

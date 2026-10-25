-- Bebidas con los nombres de la planilla de Gastrosud
set local session_replication_role = replica; -- the cutoff trigger would block already closed days
update public.meal_orders set drink = 'COCA' where drink = 'COCA COMUN';
update public.meal_orders set drink = 'AGUA C/GAS' where drink = 'SODA';

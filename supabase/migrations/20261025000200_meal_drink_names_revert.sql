-- Se vuelve a los nombres de bebida del formulario (COCA COMUN, SODA)
set local session_replication_role = replica;
update public.meal_orders set drink = 'COCA COMUN' where drink = 'COCA';
update public.meal_orders set drink = 'SODA' where drink = 'AGUA C/GAS';

CREATE OR REPLACE FUNCTION public.calc_credit_price(creditos integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  t numeric;
  unit_low numeric;
  unit_high numeric;
  unit_price numeric;
BEGIN
  IF creditos <= 0 THEN RETURN 0; END IF;
  IF creditos <= 100 THEN RETURN ROUND((creditos * 0.0536)::numeric, 2); END IF;
  IF creditos >= 10000 THEN RETURN ROUND((creditos * 0.03)::numeric, 2); END IF;

  IF creditos <= 1000 THEN
    t := (creditos - 100)::numeric / 900.0;
    unit_low := 0.0536; unit_high := 0.0375;
    unit_price := unit_low + t * (unit_high - unit_low);
    RETURN ROUND((creditos * unit_price)::numeric, 2);
  END IF;

  IF creditos <= 5000 THEN
    t := (creditos - 1000)::numeric / 4000.0;
    unit_low := 0.0375; unit_high := 0.032142;
    unit_price := unit_low + t * (unit_high - unit_low);
    RETURN ROUND((creditos * unit_price)::numeric, 2);
  END IF;

  t := (creditos - 5000)::numeric / 5000.0;
  unit_low := 0.032142; unit_high := 0.03;
  unit_price := unit_low + t * (unit_high - unit_low);
  RETURN ROUND((creditos * unit_price)::numeric, 2);
END;
$function$;
-- Védett Útvonal: kedvenc útvonalak — két új, OPCIONÁLIS szenzoros preferencia
-- (crowding = "Zsúfolt jármű zavar", noise = "Zajos környezet zavar") a weights JSONB-ben.
--
-- Miért kell migráció: a vedett_route_favorites_weights_valid CHECK pontosan a
-- 6 strukturális kulcsot engedi (weights = jsonb_build_object(6 kulcs)), így a
-- 8 kulcsos objektum mentése 23514-gyel elbukna. Ez a migráció CSAK lazít: a 6
-- kulcs továbbra is kötelező és 0/1/2; a 2 új kulcs opcionális, ha jelen van,
-- szintén csak 0/1/2 lehet; más kulcs továbbra sem megengedett.
-- Additív / nem destruktív: meglévő sor nem változik, mind érvényes marad.
-- Az alkalmazás a migráció ELŐTT is működik: 23514 esetén a 6 kulccsal ment
-- (lásd lib/vedett-route/favorites/queries.ts createFavoriteRoute()).

ALTER TABLE public.vedett_route_favorites
  DROP CONSTRAINT IF EXISTS vedett_route_favorites_weights_valid;

ALTER TABLE public.vedett_route_favorites
  ADD CONSTRAINT vedett_route_favorites_weights_valid CHECK (
    jsonb_typeof(weights) = 'object'
    AND weights ?& ARRAY['transfers', 'modeSwitches', 'underground', 'walking', 'duration', 'waiting']
    AND (weights - 'crowding' - 'noise') = jsonb_build_object(
      'transfers', weights->'transfers',
      'modeSwitches', weights->'modeSwitches',
      'underground', weights->'underground',
      'walking', weights->'walking',
      'duration', weights->'duration',
      'waiting', weights->'waiting'
    )
    AND weights->'transfers' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'modeSwitches' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'underground' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'walking' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'duration' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND weights->'waiting' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb)
    AND (NOT (weights ? 'crowding') OR weights->'crowding' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb))
    AND (NOT (weights ? 'noise') OR weights->'noise' IN ('0'::jsonb, '1'::jsonb, '2'::jsonb))
  );

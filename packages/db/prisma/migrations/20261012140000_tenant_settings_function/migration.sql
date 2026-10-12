-- Schuleinstellungen (Fristen, Grenzwerte, Aufbewahrung) durch die Administration der Schule (ADR 0009).
-- sp_app hat auf "Tenant" kein UPDATE; diese Funktion ändert nur "settings" des gesetzten Mandanten.
-- Die Prüfung der Werte macht die API (Zod-Schema tenantSettingsSchema in @sp/shared).
CREATE OR REPLACE FUNCTION update_tenant_settings(new_settings jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tenant text := current_setting('app.tenant_id', true);
BEGIN
  IF tenant IS NULL OR tenant = '' THEN
    RAISE EXCEPTION 'app.tenant_id ist nicht gesetzt';
  END IF;
  IF jsonb_typeof(new_settings) <> 'object' THEN
    RAISE EXCEPTION 'settings muss ein Objekt sein';
  END IF;
  UPDATE "Tenant" SET "settings" = new_settings, "updatedAt" = now() WHERE "id" = tenant;
END
$$;
REVOKE ALL ON FUNCTION update_tenant_settings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_tenant_settings(jsonb) TO sp_app;

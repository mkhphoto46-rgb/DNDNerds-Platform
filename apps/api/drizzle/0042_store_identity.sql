-- Stop rather than mutate existing identities. The report includes every conflicting store ID.
CREATE FUNCTION marketplace_store_name_key(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$ SELECT translate(btrim(regexp_replace(translate(value, 'يك', 'یک'), U&'[\0009-\000d\0020\00a0\1680\2000-\200a\200c\200d\2028\2029\202f\205f\3000\feff]+', ' ', 'g')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') $$;
--> statement-breakpoint
DO $$
DECLARE conflicts text;
BEGIN
 SELECT string_agg(detail, E'\n') INTO conflicts FROM (
 SELECT 'duplicate name '||marketplace_store_name_key(name)||': '||string_agg(id::text, ', ') AS detail FROM stores GROUP BY marketplace_store_name_key(name) HAVING count(*)>1
 UNION ALL
 SELECT 'invalid/reserved slug '||slug||': '||id::text FROM stores WHERE NOT (length(slug) BETWEEN 3 AND 63 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND slug NOT IN ('www','acme','api','admin','mail','smtp','imap','pop','pop3','webmail','autodiscover','autoconfig','voice','turn','stun','vtt','play','app','account','auth','login','support','status','cdn','assets','static','media','files','storage','download','downloads','docs','blog','shop','store','marketplace','cartography','ns1','ns2','localhost','ftp','sftp','vpn','dev','test','staging'))
 ) issues;
 IF conflicts IS NOT NULL THEN RAISE EXCEPTION 'Store identity migration blocked; resolve existing identities explicitly: %', conflicts; END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX stores_name_normalized_unique ON stores (marketplace_store_name_key(name));
--> statement-breakpoint
ALTER TABLE stores ADD CONSTRAINT stores_slug_dns_safe CHECK (length(slug) BETWEEN 3 AND 63 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND slug NOT IN ('www','acme','api','admin','mail','smtp','imap','pop','pop3','webmail','autodiscover','autoconfig','voice','turn','stun','vtt','play','app','account','auth','login','support','status','cdn','assets','static','media','files','storage','download','downloads','docs','blog','shop','store','marketplace','cartography','ns1','ns2','localhost','ftp','sftp','vpn','dev','test','staging'));

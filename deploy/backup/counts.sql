-- The exact row count of every table in the public schema, for comparing a restored database
-- with the live one (deploy/README.md, Backups, Restore).
select table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', table_name),
                           false, true, '')))[1]::text as rows
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

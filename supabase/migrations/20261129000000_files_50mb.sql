-- Project documents (drawing sets, DWGs) may be up to 50 MB. The app checks the same limit (MAX_PROJECT_DOC_BYTES).
-- Supabase also has a project-wide upload limit (Dashboard -> Storage -> Settings); keep it at 50 MB or more.
update storage.buckets set file_size_limit = 52428800 where id = 'files';

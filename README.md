# AR Bookshelf

Static mobile PWA for GitHub Pages. Uses Supabase Auth/DB/Storage and parses EPUB/PDF in the browser. No Node.js backend.

## Before production
- Confirm the `books` table and private `book-covers` bucket exist with the RLS policies from the supplied SQL setup.
- In Supabase Auth, add the final GitHub Pages URL as the Site URL / allowed redirect URL as appropriate.
- Keep secret/service-role keys out of the repo. This app uses the publishable key only.
- Camera access requires HTTPS.

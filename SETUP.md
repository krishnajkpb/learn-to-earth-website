# Learn to Earth — Firebase setup

1. Firebase Console → Authentication → Sign-in method → enable Email/Password.
2. Create your first admin user in Authentication → Users → Add user. Use the admin email/password you want.
3. Copy that user's UID.
4. Firestore Database → Data → Start collection → `users`. Document ID = the admin UID. Add fields:
   - `name` (string)
   - `email` (string)
   - `role` (string) = `admin`
   - `status` (string) = `approved`
5. Firestore → Rules → paste `firestore.rules` and Publish.
6. GitHub Pages: upload all files in this package to the repository root.
7. Open `admin.html` and sign in with the admin email/password.
8. Create folders, add Google Drive lesson links, and approve learners.

Google Drive: set the video to `Anyone with the link` → `Viewer`. Learn to Earth embeds `/file/d/FILE_ID/preview` inside the site. It hides a separate download link, but no browser-only website can guarantee that viewers cannot copy or screen-record a video.

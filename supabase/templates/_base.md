# Auth email templates

Sent by Supabase Auth through Resend from noreply@toxoff.app (supabase/config.toml,
`[auth.email.smtp]` and `[auth.email.template.*]`). Each file is a complete HTML email in the app's
colours. Keep them table-based and inline-styled: email clients ignore stylesheets.

Variables Supabase fills in:
- `{{ .ConfirmationURL }}` the link that completes the action (also carries the redirect back to the app)
- `{{ .Email }}` the recipient
- `{{ .Token }}` the 6-digit code, for people who can't tap the link
- `{{ .SiteURL }}` the configured site URL (`toxoff://`)

To change a template, edit the HTML and push the config:
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=... RESEND_API_KEY=... npx supabase config push`
(both secrets come from the Keychain; see README "Supabase (auth + data)").

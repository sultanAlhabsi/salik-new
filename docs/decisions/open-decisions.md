# Open Decisions

| ID | Decision | Default for this build |
| --- | --- | --- |
| DEC-PAY-001 | Final payment provider for Oman acquiring. | Local idempotent webhook adapter. |
| DEC-FIL-001 | Long-term attachment retention policy. | Private Supabase Storage with retained metadata; final retention duration remains open. |
| DEC-REF-001 | Refund, partial refund, and return workflow. | Payment states modeled; refund actions are not exposed until policy is approved. |
| DEC-SUB-001 | Subscription billing provider. | Plans and subscription states are modeled with seeded platform data. |
| DEC-EML-001 | Transactional email branding and provider policy. | Supabase Auth sends password recovery; invitation email branding remains open. |
| DEC-OBS-001 | Hosted logs, metrics, and alerting provider. | Structured API errors, health endpoint, audit log, and process logs are available locally. |

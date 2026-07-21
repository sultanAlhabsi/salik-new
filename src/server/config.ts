import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET ?? 'development-session-secret',
  omanTimezone: process.env.OMAN_TIMEZONE ?? 'Asia/Muscat',
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? 'development-payment-secret',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 5_242_880),
  supabaseUrl: process.env.SUPABASE_URL,
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'salik-private',
  supabaseDisabled: process.env.SALIK_SUPABASE_DISABLED === 'true',
  isProduction: process.env.NODE_ENV === 'production'
};

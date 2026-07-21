import 'dotenv/config';

export type AppConfig = {
  port: number;
  appOrigin: string;
  databaseUrl: string | undefined;
  sessionSecret: string;
  omanTimezone: string;
  paymentWebhookSecret: string;
  maxUploadBytes: number;
  supabaseUrl: string | undefined;
  supabasePublishableKey: string | undefined;
  supabaseSecretKey: string | undefined;
  supabaseStorageBucket: string;
  supabaseDisabled: boolean;
  isProduction: boolean;
};

function isHttpsUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isPostgresUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateProductionConfig(configuration: AppConfig) {
  const invalid: string[] = [];
  if (!isPostgresUrl(configuration.databaseUrl)) invalid.push('DATABASE_URL');
  if (!isHttpsUrl(configuration.appOrigin)) invalid.push('APP_ORIGIN');
  if (configuration.sessionSecret.length < 32) invalid.push('SESSION_SECRET');
  if (configuration.paymentWebhookSecret.length < 16) invalid.push('PAYMENT_WEBHOOK_SECRET');
  if (!isHttpsUrl(configuration.supabaseUrl)) invalid.push('SUPABASE_URL');
  if (!configuration.supabasePublishableKey) invalid.push('SUPABASE_PUBLISHABLE_KEY');
  if (!configuration.supabaseSecretKey) invalid.push('SUPABASE_SECRET_KEY');
  if (configuration.supabaseDisabled) invalid.push('SALIK_SUPABASE_DISABLED');
  if (!Number.isInteger(configuration.port) || configuration.port <= 0 || configuration.port > 65_535) {
    invalid.push('PORT');
  }
  if (!Number.isFinite(configuration.maxUploadBytes) || configuration.maxUploadBytes <= 0) {
    invalid.push('MAX_UPLOAD_BYTES');
  }
  if (invalid.length > 0) {
    throw new Error(`Invalid production configuration: ${invalid.join(', ')}`);
  }
}

export function resolveConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const configuration: AppConfig = {
    port: Number(environment.PORT ?? 3000),
    appOrigin:
      environment.APP_ORIGIN ?? environment.RENDER_EXTERNAL_URL ?? 'http://localhost:5173',
    databaseUrl: environment.DATABASE_URL,
    sessionSecret: environment.SESSION_SECRET ?? 'development-session-secret',
    omanTimezone: environment.OMAN_TIMEZONE ?? 'Asia/Muscat',
    paymentWebhookSecret: environment.PAYMENT_WEBHOOK_SECRET ?? 'development-payment-secret',
    maxUploadBytes: Number(environment.MAX_UPLOAD_BYTES ?? 5_242_880),
    supabaseUrl: environment.SUPABASE_URL,
    supabasePublishableKey: environment.SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: environment.SUPABASE_SECRET_KEY,
    supabaseStorageBucket: environment.SUPABASE_STORAGE_BUCKET ?? 'salik-private',
    supabaseDisabled: environment.SALIK_SUPABASE_DISABLED === 'true',
    isProduction: environment.NODE_ENV === 'production'
  };

  if (configuration.isProduction) {
    validateProductionConfig(configuration);
  }
  return configuration;
}

export const config = resolveConfig();

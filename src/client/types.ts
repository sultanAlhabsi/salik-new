export type Portal = 'admin' | 'supplier' | 'store' | 'driver';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId?: string | null;
  organizationName?: string | null;
  portal: Portal;
};

export type LoadState<T> =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'error'; data?: undefined; error: string }
  | { status: 'success'; data: T; error?: undefined };

// B53: the API answers some errors in English (auth, rate limits, the CSRF guard).
// Forms show this Persian text instead, keyed by the stable `error.code`.
export const API_ERROR_TEXT: Record<string, string> = {
  RATE_LIMITED: "درخواست‌های زیادی فرستاده شد. کمی صبر کن و دوباره تلاش کن.",
  RATE_LIMIT_BACKEND_UNAVAILABLE: "سرویس موقتاً در دسترس نیست. کمی بعد دوباره تلاش کن.",
  CSRF_BLOCKED: "این درخواست از صفحهٔ دیگری آمده بود و پذیرفته نشد. صفحه را تازه کن و دوباره تلاش کن.",
  INVALID_CREDENTIALS: "ایمیل یا رمز عبور درست نیست.",
  VALIDATION_ERROR: "اطلاعات واردشده معتبر نیست. فیلدها را بررسی کن.",
  INVALID_USERNAME: "نام کاربری معتبر نیست.",
  USERNAME_TAKEN: "این نام کاربری قبلاً گرفته شده است.",
  EMAIL_ALREADY_EXISTS: "با این ایمیل قبلاً حساب ساخته شده است.",
  EMAIL_TAKEN: "با این ایمیل قبلاً حساب ساخته شده است.",
  SLUG_TAKEN: "این نشانی فروشگاه قبلاً گرفته شده است.",
  APPLICATION_EXISTS: "درخواست فروشندگی قبلاً ثبت شده است.",
  CAPACITY_BELOW_SEATED: "ظرفیت میز نمی‌تواند از تعداد بازیکنان پذیرفته‌شده کمتر باشد.",
  MFA_REQUIRED: "کد شش‌رقمی تأیید دومرحله‌ای را وارد کن.",
  INVALID_TOTP: "کد تأیید دومرحله‌ای درست نیست.",
  INVALID_OR_EXPIRED_TOKEN: "پیوند نامعتبر است یا منقضی شده است. پیوند تازه بگیر.",
  EMAIL_SERVICE_UNAVAILABLE: "ارسال ایمیل هنوز برای سایت فعال نشده است.",
  UNAUTHORIZED: "برای ادامه وارد حساب خود شو.",
  ACCOUNT_INACTIVE: "این حساب فعال نیست.",
  PASSWORD_REAUTH_FAILED: "رمز عبور فعلی درست نیست.",
  ADMIN_REAUTH_FAILED: "رمز عبور فعلی درست نیست.",
  ADMIN_FORBIDDEN: "دسترسی مدیر لازم است.",
  SELF_CHANGE: "نمی‌توانی وضعیت یا نقش حساب خودت را تغییر دهی.",
  NOT_FOUND: "مورد درخواستی پیدا نشد.",
  SESSION_NOT_FOUND: "این نشست پیدا نشد.",
  PENDING_ACCOUNT_NOT_FOUND: "حساب در انتظار تأیید پیدا نشد.",
  SELF_PURCHASE: "نمی‌توانی از فروشگاهی که عضوش هستی خرید کنی.",
  BUYER_VERIFICATION_REQUIRED: "پیش از خرید، ایمیل و شمارهٔ موبایلت را تأیید کن.",
  PURCHASE_NOT_ENABLED: "خرید هنوز فعال نشده است.",
  INTERNAL_ERROR: "خطای سرور رخ داد. کمی بعد دوباره تلاش کن.",
};

const PERSIAN_TEXT = /[؀-ۿ]/;

/**
 * The text to show for a failed API response: the API's own message when it is
 * already Persian, else the Persian text for its code (or for HTTP 429), else
 * the form's Persian fallback. English API text is never shown.
 */
export function apiErrorMessage(body: unknown, fallback: string, status?: number): string {
  const error = typeof body === "object" && body !== null
    ? (body as { error?: { code?: unknown; message?: unknown } }).error
    : undefined;
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  if (message && PERSIAN_TEXT.test(message)) return message;
  const code = typeof error?.code === "string" ? error.code : "";
  if (code && Object.hasOwn(API_ERROR_TEXT, code)) return API_ERROR_TEXT[code]!;
  if (status === 429) return API_ERROR_TEXT.RATE_LIMITED!;
  return fallback;
}

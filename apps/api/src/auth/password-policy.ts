// B83: every new password (sign-up, change, reset) needs at least 12 characters.
// Sign-in and re-authentication keep the old minimum of 8, so existing passwords keep working.
export const NEW_PASSWORD_MIN_LENGTH = 12;

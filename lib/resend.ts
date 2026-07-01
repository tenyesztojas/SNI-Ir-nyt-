import { Resend } from "resend";

// Lazy factory — ne példányosodjon build-időben, csak futásidőben
export function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

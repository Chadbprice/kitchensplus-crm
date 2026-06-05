import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowRight, Phone, Mail, ChevronDown, ChevronUp } from "lucide-react";
import { useSearch } from "wouter";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663481717136/NJbAuvnBiksaabdpS5d8M3/kitchensplus_logo_0e432498.webp";
const GOLD = "#C9A84C";
const DARK = "#1A1B17";
const CHARCOAL = "#2E2F2A";
const CREAM = "#F5F0E8";
const MUTED = "#9A9589";

/** Format a raw digit string as (XXX) XXX-XXXX */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

interface ClientPhoneLoginProps {
  onSuccess: (session: { leadId: number; name: string }) => void;
}

export default function ClientPhoneLogin({ onSuccess }: ClientPhoneLoginProps) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [showEmailFallback, setShowEmailFallback] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const search = useSearch();
  const urlName = new URLSearchParams(search).get("name") ?? "";
  const firstName = urlName ? urlName.split(" ")[0] : "";

  const loginPhone = trpc.clientPortal.loginWithPhone.useMutation({
    onSuccess: async (data) => {
      await utils.clientPortal.invalidate();
      onSuccess({ leadId: data.leadId, name: data.name });
    },
    onError: (err) => {
      toast.error(err.message || "Phone number not found. Please check and try again.");
    },
  });

  const loginEmail = trpc.clientPortal.loginWithEmail.useMutation({
    onSuccess: async (data) => {
      await utils.clientPortal.invalidate();
      onSuccess({ leadId: data.leadId, name: data.name });
    },
    onError: (err) => {
      toast.error(err.message || "Email address not found. Please check and try again.");
    },
  });

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    setPhone(formatPhone(raw));
  }

  function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      toast.error("Please enter a valid phone number.");
      phoneRef.current?.focus();
      return;
    }
    loginPhone.mutate({ phone: digits });
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      toast.error("Please enter a valid email address.");
      emailRef.current?.focus();
      return;
    }
    loginEmail.mutate({ email: trimmed });
  }

  const isPending = loginPhone.isPending || loginEmail.isPending;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: DARK }}
    >
      {/* Card */}
      <div
        className="w-full max-w-[420px] rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: CHARCOAL, border: `1px solid rgba(201,168,76,0.18)` }}
      >
        {/* Gold top bar */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, #E8C96A, ${GOLD})` }} />

        <div className="px-8 pt-10 pb-8 space-y-7">
          {/* Logo */}
          <div className="flex justify-center">
            <img
              src={LOGO_URL}
              alt="Kitchens Plus Upstate"
              className="h-12 object-contain"
              style={{ filter: "brightness(1.05)" }}
            />
          </div>

          {/* Headline */}
          <div className="text-center space-y-2">
            <h1
              className="font-serif text-3xl leading-tight"
              style={{ color: CREAM, fontStyle: "italic" }}
            >
              {firstName ? `Welcome back, ${firstName}.` : "Welcome to Your Portal"}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
              Enter the mobile number we have on file to access your project.
            </p>
          </div>

          {/* Phone form */}
          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="phone"
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: MUTED }}
              >
                Your Mobile Number
              </label>
              <div
                className="relative rounded-lg transition-all duration-200"
                style={{
                  border: `1.5px solid ${phoneFocused ? GOLD : "rgba(255,255,255,0.12)"}`,
                  background: "rgba(255,255,255,0.04)",
                  boxShadow: phoneFocused ? `0 0 0 3px rgba(201,168,76,0.12)` : "none",
                }}
              >
                <Phone
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: phoneFocused ? GOLD : MUTED }}
                />
                <Input
                  id="phone"
                  ref={phoneRef}
                  type="tel"
                  inputMode="tel"
                  placeholder="(864) 555-0100"
                  value={phone}
                  onChange={handlePhoneChange}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                  autoFocus
                  autoComplete="tel"
                  className="pl-10 h-12 text-base border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  style={{ color: CREAM }}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-12 text-sm font-bold tracking-wide rounded-lg transition-all duration-200 active:scale-[0.98]"
              style={{
                background: isPending
                  ? "rgba(201,168,76,0.5)"
                  : `linear-gradient(135deg, ${GOLD}, #E8C96A)`,
                color: DARK,
                boxShadow: isPending ? "none" : `0 4px 16px rgba(201,168,76,0.35)`,
              }}
            >
              {loginPhone.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Signing you in…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Access My Dashboard
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Email fallback toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowEmailFallback((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs transition-colors"
              style={{ color: MUTED }}
            >
              {showEmailFallback ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Hide email login
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Changed your number? Sign in with email instead
                </>
              )}
            </button>

            {showEmailFallback && (
              <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: MUTED }}
                  >
                    Email Address
                  </label>
                  <div
                    className="relative rounded-lg transition-all duration-200"
                    style={{
                      border: `1.5px solid ${emailFocused ? GOLD : "rgba(255,255,255,0.12)"}`,
                      background: "rgba(255,255,255,0.04)",
                      boxShadow: emailFocused ? `0 0 0 3px rgba(201,168,76,0.12)` : "none",
                    }}
                  >
                    <Mail
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                      style={{ color: emailFocused ? GOLD : MUTED }}
                    />
                    <Input
                      id="email"
                      ref={emailRef}
                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      autoComplete="email"
                      className="pl-10 h-12 text-base border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                      style={{ color: CREAM }}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isPending}
                  variant="outline"
                  className="w-full h-11 text-sm font-semibold rounded-lg"
                  style={{
                    borderColor: `rgba(201,168,76,0.4)`,
                    color: GOLD,
                    background: "transparent",
                  }}
                >
                  {loginEmail.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      Signing you in…
                    </span>
                  ) : (
                    "Access with Email"
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* Divider */}
          <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

          {/* Contact line — Chad's direct number, no toll-free */}
          <p className="text-center text-xs" style={{ color: MUTED }}>
            Have questions?{" "}
            <a
              href="tel:8645678777"
              className="font-semibold transition-colors hover:underline"
              style={{ color: GOLD }}
            >
              Call Chad at 864-567-8777
            </a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-center" style={{ color: "rgba(154,149,137,0.5)" }}>
        © {new Date().getFullYear()} Kitchens Plus Upstate · Renovations &amp; Design
      </p>
    </div>
  );
}

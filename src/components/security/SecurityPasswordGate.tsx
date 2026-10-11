'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  Lock,
  Smartphone,
  Laptop,
  Tablet,
  Delete,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import {
  appendSecurityPinKey,
  backspaceSecurityPin,
  parseDeviceFromUserAgent,
  verifySecurityPassword,
} from '@/domain/securityEngine';

interface SecurityPasswordGateProps {
  currentIp: string;
  userAgent: string;
  onAuthorizeSuccess: (password: string) => Promise<void>;
}

export const SecurityPasswordGate: React.FC<SecurityPasswordGateProps> = ({
  currentIp,
  userAgent,
  onAuthorizeSuccess,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const parsedDevice = parseDeviceFromUserAgent(userAgent);

  const triggerHaptic = (ms = 10) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore vibrate errors
      }
    }
  };

  const handleDigitPress = (digit: string) => {
    triggerHaptic(8);
    setError(null);
    setPin((prev) => appendSecurityPinKey(prev, digit));
  };

  const handleBackspace = () => {
    triggerHaptic(8);
    setError(null);
    setPin((prev) => backspaceSecurityPin(prev));
  };

  const handleClear = () => {
    triggerHaptic(10);
    setError(null);
    setPin('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError('Please enter your security password to authorize this IP.');
      return;
    }

    if (!verifySecurityPassword(pin)) {
      triggerHaptic(40);
      setError('Incorrect password for this new IP address. Access denied.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      triggerHaptic(18);
      await onAuthorizeSuccess(pin.trim());
      setPin('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to authorize IP address'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const DeviceIcon =
    parsedDevice.deviceType === 'mobile'
      ? Smartphone
      : parsedDevice.deviceType === 'tablet'
        ? Tablet
        : Laptop;

  return (
    <div
      data-testid="security-password-gate"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#090B10]/95 backdrop-blur-xl p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md rounded-3xl bg-gradient-to-b from-[#141926] to-[#0D1018] border border-white/[0.1] p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Unrecognized IP Detected
            </span>
            <h1 className="mt-1 text-lg font-bold text-white">
              Verify New Sign-In IP
            </h1>
            <p className="text-xs text-zinc-400">
              Kanawita only asks for your password when accessed from a new or
              unrecognized IP address.
            </p>
          </div>
        </div>

        {/* Detected IP & Device Metadata Banner */}
        <div className="rounded-2xl bg-[#090B10] border border-white/[0.08] p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Globe className="h-3.5 w-3.5 text-emerald-400" />
              <span>Detected IP Address</span>
            </span>
            <span
              data-testid="gate-detected-ip"
              className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300 tabular-nums"
            >
              {currentIp}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs border-t border-white/[0.06] pt-2">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <DeviceIcon className="h-3.5 w-3.5 text-sky-400" />
              <span>Signup / Sign-In Device</span>
            </span>
            <span
              data-testid="gate-detected-device"
              className="font-semibold text-zinc-200 truncate max-w-[200px]"
            >
              {parsedDevice.deviceName}
            </span>
          </div>
        </div>

        {/* Password Form + Tactile Keypad */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="kanawita-security-pin"
              className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5"
            >
              Security Password
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="kanawita-security-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                data-testid="security-password-input"
                value={pin}
                onChange={(e) => {
                  setError(null);
                  setPin(e.target.value.slice(0, 32));
                }}
                placeholder="Enter password to trust this IP"
                className="w-full rounded-2xl bg-[#090B10] border border-white/[0.12] pl-10 pr-4 py-3 font-mono text-base font-bold tracking-[0.25em] text-white placeholder:tracking-normal placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none tabular-nums"
              />
            </div>
          </div>

          {/* Tactile Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                data-testid={`security-pad-${digit}`}
                onClick={() => handleDigitPress(digit)}
                className="rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] py-2.5 text-base font-bold text-white active:scale-[0.96] transition-transform"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              data-testid="security-pad-clear"
              className="rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] py-2.5 font-sans text-xs font-semibold text-zinc-400 active:scale-[0.96] transition-transform"
            >
              Clear
            </button>
            <button
              type="button"
              data-testid="security-pad-0"
              onClick={() => handleDigitPress('0')}
              className="rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] py-2.5 text-base font-bold text-white active:scale-[0.96] transition-transform"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              data-testid="security-pad-backspace"
              aria-label="Backspace"
              className="flex items-center justify-center rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] py-2.5 text-zinc-300 active:scale-[0.96] transition-transform"
            >
              <Delete className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div
              role="alert"
              data-testid="security-error-message"
              className="rounded-xl bg-rose-500/15 border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="security-unlock-button"
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {isSubmitting
                ? 'Registering IP...'
                : `Authorize IP (${currentIp}) & Unlock`}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};

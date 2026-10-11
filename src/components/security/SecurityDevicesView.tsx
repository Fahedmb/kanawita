'use client';

import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  Smartphone,
  Laptop,
  Tablet,
  Trash2,
  Globe,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Clock,
  FlaskConical,
} from 'lucide-react';
import { AuthorizedIpDevice, SyncRuntimeStatus } from '@/domain/models';
import {
  normalizeIpAddress,
  parseDeviceFromUserAgent,
} from '@/domain/securityEngine';

interface SecurityDevicesViewProps {
  currentIp: string;
  detectedRealIp: string;
  userAgent: string;
  authorizedIps: AuthorizedIpDevice[];
  syncStatus: SyncRuntimeStatus;
  onDeleteIp: (ip: string, deviceName: string) => Promise<void>;
  onSyncIpsToMongo: () => Promise<void>;
  onSimulateIpChange: (nextIp: string | null) => void;
}

export const SecurityDevicesView: React.FC<SecurityDevicesViewProps> = ({
  currentIp,
  detectedRealIp,
  userAgent,
  authorizedIps,
  syncStatus,
  onDeleteIp,
  onSyncIpsToMongo,
  onSimulateIpChange,
}) => {
  const [isSyncingMongo, setIsSyncingMongo] = useState<boolean>(false);
  const [deletingIp, setDeletingIp] = useState<string | null>(null);
  const [customTestIp, setCustomTestIp] = useState<string>('');

  const currentDevice = useMemo(
    () => parseDeviceFromUserAgent(userAgent),
    [userAgent]
  );

  const normalizedCurrentIp = normalizeIpAddress(currentIp);

  // Sort: Current IP first, then Original Signup Device, then most recently seen
  const sortedDevices = useMemo(() => {
    return authorizedIps
      .filter((d) => d && d.recognized !== false)
      .sort((a, b) => {
        const aIsCurrent = normalizeIpAddress(a.ip) === normalizedCurrentIp;
        const bIsCurrent = normalizeIpAddress(b.ip) === normalizedCurrentIp;
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;
        if (a.isInitialSignup && !b.isInitialSignup) return -1;
        if (!a.isInitialSignup && b.isInitialSignup) return 1;
        return (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0);
      });
  }, [authorizedIps, normalizedCurrentIp]);

  const initialSignupDevice = useMemo(() => {
    return (
      sortedDevices.find((d) => d.isInitialSignup) ?? sortedDevices[0] ?? null
    );
  }, [sortedDevices]);

  const handleSyncMongoClick = async () => {
    setIsSyncingMongo(true);
    try {
      await onSyncIpsToMongo();
    } finally {
      setIsSyncingMongo(false);
    }
  };

  const handleDeleteClick = async (ip: string, deviceName: string) => {
    setDeletingIp(ip);
    try {
      await onDeleteIp(ip, deviceName);
    } finally {
      setDeletingIp(null);
    }
  };

  const handleSimulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customTestIp.trim();
    if (!cleaned) return;
    onSimulateIpChange(normalizeIpAddress(cleaned));
    setCustomTestIp('');
  };

  const formatTimestamp = (ts: number) => {
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="space-y-4" data-testid="security-devices-view">
      {/* Header Overview Card */}
      <div className="rounded-2xl bg-gradient-to-br from-[#131824] to-[#0D1018] border border-white/[0.08] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-white">
                IP &amp; Device Security Guard
              </h2>
              <p className="text-[11px] text-zinc-400">
                Password is only requested when signing in from an unrecognized
                IP
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSyncMongoClick}
            disabled={isSyncingMongo}
            data-testid="sync-ips-mongo-button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-3 py-1.5 text-xs font-bold text-slate-950 active:scale-[0.96] transition-transform disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncingMongo ? 'animate-spin' : ''}`}
            />
            <span>{isSyncingMongo ? 'Syncing...' : 'Sync IPs'}</span>
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] font-sans uppercase text-zinc-400 block">
              Current IP
            </span>
            <span
              data-testid="security-current-ip"
              className="mt-1 block font-bold text-emerald-400 truncate"
            >
              {normalizedCurrentIp}
            </span>
          </div>

          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] font-sans uppercase text-zinc-400 block">
              Recognized IPs
            </span>
            <span
              data-testid="security-recognized-count"
              className="mt-1 block font-bold text-white"
            >
              {sortedDevices.length} trusted
            </span>
          </div>

          <div className="rounded-xl bg-[#090B10] border border-white/[0.06] p-2.5">
            <span className="text-[10px] font-sans uppercase text-zinc-400 block">
              MongoDB Registry
            </span>
            <span className="mt-1 block font-bold text-zinc-300 truncate">
              {syncStatus.isConfigured ? 'MongoDB Atlas' : 'Phone + Outbox'}
            </span>
          </div>
        </div>

        {/* Signup Device Highlight */}
        {initialSignupDevice && (
          <div
            data-testid="initial-signup-device-banner"
            className="flex items-center justify-between gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="text-zinc-300 truncate">
                Signup Device:{' '}
                <strong className="text-white">
                  {initialSignupDevice.deviceName}
                </strong>
              </span>
            </div>
            <span className="shrink-0 font-mono text-[11px] font-bold text-emerald-300 tabular-nums">
              {initialSignupDevice.ip}
            </span>
          </div>
        )}
      </div>

      {/* Recognized Devices & IPs List */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Recognized Devices &amp; Signup IPs ({sortedDevices.length})
            </h3>
            <p className="text-[11px] text-zinc-400">
              Deleting an IP immediately revokes access and requires the
              password on next visit
            </p>
          </div>
          <span className="text-[11px] font-medium text-emerald-400">
            Active Device: {currentDevice.deviceName}
          </span>
        </div>

        {sortedDevices.length === 0 ? (
          <div className="rounded-xl bg-[#090B10] border border-white/[0.05] p-6 text-center text-xs text-zinc-400">
            No recognized IPs registered.
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="recognized-ip-list">
            {sortedDevices.map((item) => {
              const isCurrent =
                normalizeIpAddress(item.ip) === normalizedCurrentIp;
              const Icon =
                item.deviceType === 'mobile'
                  ? Smartphone
                  : item.deviceType === 'tablet'
                    ? Tablet
                    : Laptop;

              return (
                <div
                  key={item.id}
                  data-testid={`recognized-ip-card-${item.ip}`}
                  className={`rounded-2xl border p-3.5 transition-all ${
                    isCurrent
                      ? 'bg-emerald-500/[0.07] border-emerald-500/35'
                      : 'bg-[#090B10] border-white/[0.07]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                          isCurrent
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-white/[0.05] border-white/[0.1] text-zinc-300'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            data-testid={`device-name-${item.ip}`}
                            className="text-xs font-bold text-white"
                          >
                            {item.deviceName}
                          </span>

                          <span
                            data-testid={`recognized-badge-${item.ip}`}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
                          >
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Recognized
                          </span>

                          {item.isInitialSignup && (
                            <span
                              data-testid={`signup-badge-${item.ip}`}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300"
                            >
                              Signup Device
                            </span>
                          )}

                          {isCurrent && (
                            <span
                              data-testid={`current-ip-badge-${item.ip}`}
                              className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold text-sky-300"
                            >
                              Current IP
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-xs font-bold text-zinc-200 tabular-nums">
                            <Globe className="h-3 w-3 text-emerald-400" />
                            {item.ip}
                          </span>
                          <span>
                            {item.os} • {item.browser}
                          </span>
                          {item.locationHint && (
                            <span className="text-zinc-500">
                              • {item.locationHint}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500 font-mono tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            Signed up: {formatTimestamp(item.createdAt)}
                          </span>
                          <span>
                            Last seen: {formatTimestamp(item.lastSeenAt)}
                          </span>
                          <span>Sign-ins: {item.signInCount ?? 1}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteClick(item.ip, item.deviceName)}
                      disabled={deletingIp === item.ip}
                      data-testid={`delete-ip-${item.ip}`}
                      title={`Delete IP ${item.ip} and revoke access`}
                      className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 px-2.5 py-1.5 text-xs font-bold text-rose-300 active:scale-[0.95] transition-all disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete IP</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Simulate / Test New IP Sign-In Card */}
      <div className="rounded-2xl bg-[#10131C] border border-white/[0.07] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-sky-400" />
            <div>
              <h3 className="text-xs font-bold text-white">
                Test Sign-In From a New IP
              </h3>
              <p className="text-[11px] text-zinc-400">
                Simulate connecting from an unrecognized IP to test the
                password prompt
              </p>
            </div>
          </div>

          {normalizedCurrentIp !== normalizeIpAddress(detectedRealIp) && (
            <button
              type="button"
              onClick={() => onSimulateIpChange(null)}
              data-testid="reset-real-ip-button"
              className="rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] px-2.5 py-1 text-[11px] font-semibold text-zinc-200 active:scale-[0.96]"
            >
              Reset to {normalizeIpAddress(detectedRealIp)}
            </button>
          )}
        </div>

        <form onSubmit={handleSimulateSubmit} className="flex gap-2">
          <input
            type="text"
            value={customTestIp}
            onChange={(e) => setCustomTestIp(e.target.value)}
            placeholder="e.g. 102.159.44.12"
            data-testid="simulate-ip-input"
            className="flex-1 rounded-xl bg-[#090B10] border border-white/[0.1] px-3 py-2 font-mono text-xs text-white placeholder-zinc-600 focus:border-emerald-500 focus:outline-none tabular-nums"
          />
          <button
            type="submit"
            data-testid="simulate-ip-submit"
            className="rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] px-3.5 py-2 text-xs font-bold text-white active:scale-[0.97] transition-all"
          >
            Switch IP
          </button>
        </form>
      </div>
    </div>
  );
};
